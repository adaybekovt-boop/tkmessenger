// usePeer — P2P transport orchestrator.
//
// Domain-specific concerns are owned by dedicated hooks / managers:
//   - PeerConnectionManager  (peer/peerConnectionManager.js) — PeerJS lifecycle
//   - useCallSession   (call/) — voice/video calls
//   - usePeerRegistry  (hooks/) — contacts, profiles, block list
//   - useMessaging     (hooks/) — per-peer message/outbox state
//   - useWireHandshake (hooks/) — encrypted send + handshake initiation
//   - useHeartbeat     (hooks/) — periodic heartbeat on ephemeral channels
//   - useConnections   (hooks/) — connection map, attach/glare, event handlers
//
// This file wires the sub-hooks together and owns the PeerConnectionManager
// lifecycle effect and the public return surface.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMessages, getVoiceBlob } from '../core/db.js';
import {
  getOrCreateIdentity,
  resetIdentity as resetLocalIdentity,
  setIdentity
} from '../core/identity.js';
import {
  normalizePeerId,
  isValidPeerId,
  connKey as buildConnKey,
  now
} from '../peer/helpers.js';
import { PeerConnectionManager } from '../peer/peerConnectionManager.js';
import { rowsToSortedUiMessages } from '../messaging/messageMapper.js';
import { useCallSession } from '../call/index.js';
import { useDropSession } from '../drop/index.js';
import { usePeerRegistry } from './usePeerRegistry.js';
import { useWireHandshake, teardownWireSession } from './useWireHandshake.js';
import { useHeartbeat } from './useHeartbeat.js';
import { useConnections } from './useConnections.js';
import { useMessaging } from './useMessaging.js';

// Small helper to always see the most recent version of a callback from inside
// a long-lived useEffect without forcing the effect to re-run.
function useLatestRef(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}

export function usePeer({ enabled = true, desiredPeerId = '', localProfile = null } = {}) {
  // ─── Transport-level refs ─────────────────────────────────────────────────
  const peerRef = useRef(null);
  const pcmRef = useRef(null);

  const peerIdRef = useRef('');
  const selectedPeerIdRef = useRef('');
  const localProfileRef = useRef(localProfile);

  const seenMsgIdsRef = useRef(new Set());
  const typingTimeoutsRef = useRef(new Map());

  // Game channel subscribers. Any component (e.g. Blackjack21) can register a
  // callback via subscribeGame(); inbound { type: 'game' } payloads from the
  // encrypted reliable channel are fanned out to every subscriber.
  const gameSubsRef = useRef(new Set());
  const onGameMessage = useCallback((rid, payload) => {
    for (const fn of gameSubsRef.current) {
      try { fn(rid, payload); } catch (_) {}
    }
  }, []);
  const subscribeGame = useCallback((fn) => {
    if (typeof fn !== 'function') return () => {};
    gameSubsRef.current.add(fn);
    return () => { gameSubsRef.current.delete(fn); };
  }, []);

  // ─── Top-level React state ────────────────────────────────────────────────
  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);
  const [signalingHost, setSignalingHost] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState('');

  // ─── Domain sub-hooks ─────────────────────────────────────────────────────
  const registry = usePeerRegistry();
  const {
    peers,
    setPeers,
    peersRef,
    profilesByPeer,
    setProfilesByPeer,
    blockedPeers,
    blockedPeersRef,
    upsertPeer,
    blockPeer: registryBlockPeer,
    unblockPeer,
    hydrateFromStorage,
    resetRegistry
  } = registry;

  // ─── Connection management (extracted to useConnections) ──────────────────
  // The `handlers` ref is populated below after all sub-hooks are initialized.
  // attachConn reads from it at call time, not at definition time, breaking
  // the circular dependency between connections ↔ messaging ↔ wire.
  const handlersRef = useRef({});
  const { connsRef, connKey, getConn, attachConn, openEphemeral } =
    useConnections(
      { peerRef, peerIdRef, selectedPeerIdRef, localProfileRef, seenMsgIdsRef, setSelectedPeerId },
      handlersRef
    );

  // Wire handshake + encrypted send helpers (extracted to useWireHandshake).
  const { sendEncrypted, sendEncryptedEphemeral, initiateHandshakeOnOpen } =
    useWireHandshake({ peerIdRef, connsRef, buildConnKey });

  const messaging = useMessaging({ peerIdRef, getConn, sendEncrypted, sendEncryptedEphemeral, upsertPeer });
  const {
    messagesByPeer,
    setMessagesByPeer,
    outboxByPeer,
    typingByPeer,
    setTypingByPeer,
    pushMessage,
    updateMessage,
    applyTyping,
    sendTyping,
    queueAckStatus,
    loadPendingForPeer,
    flushOutboxForPeer,
    flushAllOutbox: flushAllOutboxBase,
    sendMessage,
    sendText,
    sendSticker,
    sendVoice,
    sendFile,
    editMessage,
    deleteMessage,
    loadMoreMessages,
    pruneOldMessages,
    clearAllHistory,
    clearOutbox,
    resetAll: resetMessagingState
  } = messaging;

  // Wrap applyTyping so the 2.8s auto-clear timer lives next to the ref that
  // owns it (typingTimeoutsRef). Kept here — timers and conn-attach are the
  // same lifetime.
  const applyTypingWithTimeout = useCallback((remoteId, isTyping) => {
    const normalized = normalizePeerId(remoteId);
    applyTyping(normalized, isTyping);
    const prev = typingTimeoutsRef.current.get(normalized);
    if (prev) clearTimeout(prev);
    if (isTyping) {
      const t = setTimeout(() => {
        setTypingByPeer((p) => {
          if (!p[normalized]) return p;
          const next = { ...p };
          delete next[normalized];
          return next;
        });
        typingTimeoutsRef.current.delete(normalized);
      }, 2800);
      typingTimeoutsRef.current.set(normalized, t);
    } else {
      typingTimeoutsRef.current.delete(normalized);
    }
  }, [applyTyping, setTypingByPeer]);

  const call = useCallSession({ peerRef, peerIdRef, blockedPeersRef });

  // ─── Drop transport wiring ────────────────────────────────────────────────
  // Beacons are sent unencrypted because they contain only peerId + nickname
  // and need to flow before a wire handshake is established (chicken-and-egg).
  // Actual file data still travels over the encrypted reliable channel.

  const broadcastDropEphemeral = useCallback((packet) => {
    for (const [key, conn] of connsRef.current.entries()) {
      if (!key.endsWith('|ephemeral') || !conn?.open) continue;
      try { conn.send(packet); } catch (_) {}
    }
  }, []);

  const sendDropEphemeralTo = useCallback((remoteId, packet) => {
    const conn = getConn(normalizePeerId(remoteId), 'ephemeral');
    if (!conn?.open) return false;
    try { conn.send(packet); return true; } catch (_) { return false; }
  }, [getConn]);

  const getDropIdentity = useCallback(() => {
    const prof = localProfileRef.current || {};
    return {
      peerId: String(peerIdRef.current || ''),
      nickname: String(prof.displayName || prof.nickname || prof.name || '')
    };
  }, []);

  const getDropConn = useCallback((remoteId) => {
    return getConn(remoteId, 'reliable');
  }, [getConn]);

  const drop = useDropSession({
    getIdentity: getDropIdentity,
    broadcastEphemeral: broadcastDropEphemeral,
    sendEphemeralTo: sendDropEphemeralTo,
    getConn: getDropConn
  });

  // ─── Drop transfer guard ───────────────────────────────────────────────────
  // Freeze heartbeat and reconnect logic while a file transfer is active.
  const isDropInProgress = drop.isDropInProgress;
  const isDropInProgressRef = useRef(false);
  useEffect(() => { isDropInProgressRef.current = isDropInProgress; }, [isDropInProgress]);

  // ─── Keep refs in sync with the state they mirror ─────────────────────────
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);
  useEffect(() => { localProfileRef.current = localProfile; }, [localProfile]);

  // ─── Broadcast profile updates to all connected peers ─────────────────────
  // When the local profile changes (avatar, display name, bio), push the
  // updated profile to every peer that has a live reliable connection so
  // they see the change immediately without having to send a profile_req.
  const prevProfileRef = useRef(localProfile);
  useEffect(() => {
    const prev = prevProfileRef.current;
    prevProfileRef.current = localProfile;
    if (!localProfile || !peerId) return;
    // Only broadcast if something actually changed
    if (prev && prev.displayName === localProfile.displayName &&
        prev.bio === localProfile.bio &&
        prev.avatarDataUrl === localProfile.avatarDataUrl) return;
    // Skip the initial mount (prev is null)
    if (!prev) return;
    const profilePayload = {
      type: 'profile_res',
      nonce: Date.now(),
      profile: {
        peerId: localProfile.peerId || peerId,
        displayName: localProfile.displayName || localProfile.nickname || '',
        bio: localProfile.bio || '',
        avatarDataUrl: localProfile.avatarDataUrl || null
      }
    };
    for (const p of peersRef.current) {
      void sendEncrypted(p.id, profilePayload);
    }
  }, [localProfile, peerId, sendEncrypted]);

  // ─── Heartbeat on ephemeral channels (extracted to useHeartbeat) ──────────
  const { ensureHeartbeat, stopHeartbeatIfIdle, lastHeartbeatByPeerRef, cleanup: cleanupHeartbeat } =
    useHeartbeat({ connsRef, peerIdRef, peersRef, getConn, upsertPeer, sendEncryptedEphemeral, isDropInProgressRef });

  // ─── Populate the handlers ref for useConnections ─────────────────────────
  // This must happen on every render so useConnections.attachConn always sees
  // the latest callbacks when it is actually invoked.
  handlersRef.current = {
    upsertPeer,
    setProfilesByPeer,
    initiateHandshakeOnOpen,
    sendEncrypted,
    pushMessage,
    updateMessage,
    queueAckStatus,
    setMessagesByPeer,
    loadPendingForPeer,
    flushOutboxForPeer,
    ensureHeartbeat,
    stopHeartbeatIfIdle,
    lastHeartbeatByPeerRef,
    applyTypingWithTimeout,
    onGameMessage,
    dropHandlePacketRef: null // set below after useLatestRef
  };

  // Latest-refs so the long-lived useEffect can call them without re-running.
  const attachConnRef = useLatestRef(attachConn);
  const getConnRef = useLatestRef(getConn);
  const callHandleIncomingRef = useLatestRef(call.handleIncomingCall);
  const callEndRef = useLatestRef(call.endCall);
  const dropHandlePacketRef = useLatestRef(drop.handlePacket);
  const hydrateFromStorageRef = useLatestRef(hydrateFromStorage);
  const ensureHeartbeatRef = useLatestRef(ensureHeartbeat);
  const setMessagesByPeerRef = useLatestRef(setMessagesByPeer);

  // Complete the handlers ref — dropHandlePacketRef is only available after useLatestRef.
  handlersRef.current.dropHandlePacketRef = dropHandlePacketRef;

  // ─── PeerConnectionManager lifecycle ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      try { for (const c of connsRef.current.values()) c.close(); } catch (_) {}
      connsRef.current.clear();
      try { pcmRef.current?.stop(); } catch (_) {}
      pcmRef.current = null;
      peerRef.current = null;
      setStatus('disabled');
      setPeerId('');
      return;
    }

    if (typeof RTCPeerConnection === 'undefined') {
      setStatus('unsupported');
      setError('Ваш браузер не поддерживает P2P-соединения');
      return;
    }

    const identity = getOrCreateIdentity();
    const desiredId = normalizePeerId(desiredPeerId) || identity.peerId;
    const env = import.meta.env || {};

    const pcm = new PeerConnectionManager({
      desiredPeerId: desiredId,
      env,
      isDropInProgressRef,
      callbacks: {
        setStatus,
        setError,
        setPeerId,
        setSignalingHost,
        onOpen: (id, peer) => {
          peerRef.current = peer;
          try {
            setIdentity({ peerId: id, displayName: identity.displayName || '' });
          } catch (_) {}
          // Defer contact hydration + auto-connect to idle time. Reading 80
          // peers × up-to-50 IDB rows each synchronously blocks the main
          // thread right when the user is waiting to see the first render of
          // the chat list. requestIdleCallback (with a setTimeout fallback)
          // lets React paint the list first, then hydrates.
          const runHydration = async () => {
            try {
              const savedPeers = await hydrateFromStorageRef.current();
              const loaded = {};
              const list = Array.isArray(savedPeers) ? savedPeers : [];
              for (const p of list.slice(0, 80)) {
                const pid = normalizePeerId(p.id);
                if (!pid) continue;
                const rows = await getMessages(pid, 50, Infinity);
                const msgs = rowsToSortedUiMessages(rows);
                if (msgs.length) loaded[pid] = msgs;
              }
              // Merge with existing in-memory state to avoid clobbering messages
              // that were sent before DB persistence caught up.
              setMessagesByPeerRef.current((prev) => {
                const next = { ...prev };
                for (const [pid, msgs] of Object.entries(loaded)) {
                  const existing = Array.isArray(prev[pid]) ? prev[pid] : [];
                  if (!existing.length) {
                    next[pid] = msgs;
                    continue;
                  }
                  const seen = new Set(existing.map((m) => m.id));
                  const additions = msgs.filter((m) => !seen.has(m.id));
                  if (!additions.length) continue;
                  next[pid] = [...existing, ...additions]
                    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
                    .slice(-800);
                }
                return next;
              });
            } catch (_) {}

            // Auto-connect to known peers so status goes online and messages flow.
            for (const p of list.slice(0, 80)) {
              const pid = normalizePeerId(p.id);
              if (!pid || pid === id) continue;
              try {
                const r = getConnRef.current(pid, 'reliable');
                const e = getConnRef.current(pid, 'ephemeral');
                if (r?.open && e?.open) continue;
                if (!r || !r.open) {
                  const conn = peer.connect(pid, {
                    reliable: true,
                    label: 'reliable',
                    metadata: { channel: 'reliable', initiator: true }
                  });
                  attachConnRef.current(conn, 'reliable');
                }
                if (!e || !e.open) {
                  const conn = peer.connect(pid, {
                    reliable: false,
                    label: 'ephemeral',
                    metadata: { channel: 'ephemeral', initiator: true }
                  });
                  attachConnRef.current(conn, 'ephemeral');
                }
              } catch (_) {}
            }
          };
          // Kick off hydration after the next paint so the chat list shows
          // up instantly with whatever's already in React state; the IDB
          // read fills in the rest a moment later.
          const schedule = (fn) => {
            if (typeof requestIdleCallback === 'function') {
              requestIdleCallback(fn, { timeout: 1500 });
            } else {
              setTimeout(fn, 16);
            }
          };
          schedule(() => {
            runHydration().catch(() => { /* fire-and-forget backstop: all paths are try/catch'd, this is defence-in-depth for Safari unhandledrejection */ });
          });
        },
        onConnection: (conn) => {
          const remoteId = normalizePeerId(conn.peer);
          if (blockedPeersRef.current.includes(remoteId)) {
            try { conn.close(); } catch (_) {}
            return;
          }
          const label = String(conn?.metadata?.channel || conn?.label || 'reliable').toLowerCase();
          const ch = label.includes('eph') ? 'ephemeral' : 'reliable';
          if (!conn.metadata || typeof conn.metadata !== 'object') conn.metadata = {};
          conn.metadata.channel = ch;
          conn.metadata.initiator = false;
          attachConnRef.current(conn, ch);
        },
        onCall: (c) => {
          callHandleIncomingRef.current?.(c);
        },
        onBeforeDestroy: () => {
          try { for (const c of connsRef.current.values()) c.close(); } catch (_) {}
          connsRef.current.clear();
        },
        onVisible: () => {
          ensureHeartbeatRef.current?.();
        },
        onMultiTabLost: () => {
          peerRef.current = null;
        }
      }
    });
    pcmRef.current = pcm;
    const peer = pcm.start();
    peerRef.current = peer;

    return () => {
      cleanupHeartbeat();
      try {
        for (const t of typingTimeoutsRef.current.values()) clearTimeout(t);
      } catch (_) {}
      typingTimeoutsRef.current.clear();
      try { for (const c of connsRef.current.values()) c.close(); } catch (_) {}
      connsRef.current.clear();
      seenMsgIdsRef.current = new Set();
      try { pcm.stop(); } catch (_) {}
      pcmRef.current = null;
      peerRef.current = null;
      try { callEndRef.current?.(); } catch (_) {}
    };
    // We intentionally depend only on `enabled` and `desiredPeerId`: every
    // other callback is accessed through a latest-ref so the transport isn't
    // rebuilt on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, desiredPeerId]);

  // ─── Public API ───────────────────────────────────────────────────────────
  const connect = useCallback(async (targetId) => {
    const normalized = normalizePeerId(targetId);
    if (!isValidPeerId(normalized)) throw new Error('Неверный Peer ID — проверь формат');
    if (!peerRef.current) throw new Error('PeerJS не готов');
    if (normalized === peerIdRef.current) throw new Error('Нельзя подключиться к себе');

    const reliable = getConn(normalized, 'reliable');
    const ephemeral = getConn(normalized, 'ephemeral');
    if (reliable && reliable.open && ephemeral && ephemeral.open) {
      setSelectedPeerId(normalized);
      return;
    }

    // Show "connecting" state but verify the peer actually exists.
    upsertPeer(normalized, { status: 'connecting', lastSeenAt: now() });

    const reliableConn = (() => {
      if (reliable && reliable.open) return reliable;
      const conn = peerRef.current.connect(normalized, {
        reliable: true,
        label: 'reliable',
        metadata: { channel: 'reliable', initiator: true }
      });
      attachConn(conn, 'reliable');
      return conn;
    })();

    if (!ephemeral || !ephemeral.open) {
      const conn = peerRef.current.connect(normalized, {
        reliable: false,
        label: 'ephemeral',
        metadata: { channel: 'ephemeral', initiator: true }
      });
      attachConn(conn, 'ephemeral');
    }

    // Wait for the reliable connection to open (peer exists) or fail.
    // Handlers are stored in named refs so cleanup() can detach them — otherwise
    // the first listener to fire wins but the losers stay wired to the conn
    // forever, leaking closures over `resolve`/`reject` + react setters.
    await new Promise((resolve, reject) => {
      if (reliableConn.open) { resolve(); return; }
      const PROBE_TIMEOUT_MS = 10_000;
      let settled = false;
      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        setPeers((prev) => prev.filter((p) => p.id !== normalized));
        reject(new Error('Пир недоступен — проверь ID'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        try { reliableConn.off?.('open', onOpen); } catch (_) {}
        try { reliableConn.off?.('error', onError); } catch (_) {}
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        // Peer did not respond — remove from contacts
        setPeers((prev) => prev.filter((p) => p.id !== normalized));
        const k1 = buildConnKey(normalized, 'reliable');
        const k2 = buildConnKey(normalized, 'ephemeral');
        const c1 = connsRef.current.get(k1);
        const c2 = connsRef.current.get(k2);
        try { c1?.close(); } catch (_) {}
        try { c2?.close(); } catch (_) {}
        connsRef.current.delete(k1);
        connsRef.current.delete(k2);
        reject(new Error('Пир не найден — проверь ID или убедись, что он в сети'));
      }, PROBE_TIMEOUT_MS);
      reliableConn.on('open', onOpen);
      reliableConn.on('error', onError);
    });

    setSelectedPeerId(normalized);
  }, [attachConn, getConn, upsertPeer, setPeers]);

  const requestRemoteProfile = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    void sendEncrypted(normalized, { type: 'profile_req', nonce: Date.now() });
  }, [sendEncrypted]);

  const sendGame = useCallback((targetId, payload) => {
    const normalized = normalizePeerId(targetId);
    if (!normalized || !payload) return false;
    return sendEncrypted(normalized, { type: 'game', payload });
  }, [sendEncrypted]);

  const flushAllOutbox = useCallback(() => {
    flushAllOutboxBase(peersRef.current.map((p) => p.id));
  }, [flushAllOutboxBase, peersRef]);

  const resetIdentity = useCallback(() => {
    const next = resetLocalIdentity();
    setError(null);
    setStatus('connecting');
    setPeerId(next.peerId);
    cleanupHeartbeat();
    try { for (const c of connsRef.current.values()) c.close(); } catch (_) {}
    connsRef.current.clear();
    resetRegistry();
    setSelectedPeerId('');
    resetMessagingState();
    call.endCall?.();
    pcmRef.current?.swapPeerId(next.peerId);
  }, [call, cleanupHeartbeat, resetMessagingState, resetRegistry]);

  const blockPeer = useCallback((remoteId) => {
    registryBlockPeer(remoteId, (normalized) => {
      const c1 = getConn(normalized, 'reliable');
      const c2 = getConn(normalized, 'ephemeral');
      try { c1?.close(); } catch (_) {}
      try { c2?.close(); } catch (_) {}
      connsRef.current.delete(buildConnKey(normalized, 'reliable'));
      connsRef.current.delete(buildConnKey(normalized, 'ephemeral'));
      void teardownWireSession(normalized);
    });
  }, [getConn, registryBlockPeer]);

  const connectionStatusByPeer = useMemo(() => {
    const map = new Map();
    for (const p of peers) map.set(p.id, p.status);
    return map;
  }, [peers]);

  const reconnectNow = useCallback(() => {
    pcmRef.current?.reconnectNow();
  }, []);

  // Discover peers — tries the signaling server's listAllPeers first, but
  // falls back to the local contacts list (public PeerJS servers disable
  // discovery, so listAllPeers usually returns nothing).
  const discoverPeers = useCallback(() => {
    return new Promise((resolve) => {
      const p = peerRef.current;
      const myId = peerIdRef.current;
      const blocked = blockedPeersRef.current || [];
      const knownIds = (peersRef.current || [])
        .map((x) => x.id)
        .filter((id) => id && id !== myId && !blocked.includes(id));

      if (!p || p.destroyed || p.disconnected || !p.open) {
        resolve(knownIds);
        return;
      }

      let resolved = false;
      const finish = (ids) => {
        if (resolved) return;
        resolved = true;
        resolve(ids);
      };

      // 3-second timeout in case listAllPeers hangs on public servers.
      const timer = setTimeout(() => finish(knownIds), 3000);

      try {
        p.listAllPeers((ids) => {
          clearTimeout(timer);
          const filtered = (ids || []).filter(
            (id) => id && id !== myId && !blocked.includes(id)
          );
          // Merge signaling results with known contacts.
          const merged = [...new Set([...filtered, ...knownIds])];
          finish(merged);
        });
      } catch (_) {
        clearTimeout(timer);
        finish(knownIds);
      }
    });
  }, []);

  return {
    peerId,
    status,
    error,
    signalingHost,
    peers,
    selectedPeerId,
    messagesByPeer,
    connectionStatusByPeer,
    setSelectedPeerId,
    connect,
    sendText,
    sendMessage,
    sendSticker,
    sendVoice,
    sendFile,
    editMessage,
    deleteMessage,
    loadVoiceBlob: getVoiceBlob,
    outboxByPeer,
    flushAllOutbox,
    loadMoreMessages,
    pruneOldMessages,
    clearOutbox,
    clearAllHistory,
    profilesByPeer,
    requestRemoteProfile,
    typingByPeer,
    sendTyping,
    resetIdentity,
    blockedPeers,
    blockPeer,
    unblockPeer,
    call: {
      state: call.callState,
      lastError: call.lastError,
      dismissError: call.dismissError,
      localVideoRef: call.localVideoRef,
      remoteVideoRef: call.remoteVideoRef,
      startCall: call.startCall,
      accept: call.acceptCall,
      reject: call.rejectCall,
      end: call.endCall,
      toggleAudio: call.toggleAudio,
      toggleVideo: call.toggleVideo,
      switchCamera: call.switchCamera,
      toggleScreenShare: call.toggleScreenShare,
      startScreenShare: call.startScreenShare,
      stopScreenShare: call.stopScreenShare
    },
    drop: {
      state: drop.dropState,
      isDropInProgress: drop.isDropInProgress,
      activate: drop.activate,
      deactivate: drop.deactivate,
      setVisibility: drop.setVisibility,
      requestDrop: drop.requestDrop,
      acceptDrop: drop.acceptDrop,
      rejectDrop: drop.rejectDrop,
      cancelRequest: drop.cancelRequest,
      openEphemeral
    },
    reconnectNow,
    discoverPeers,
    sendGame,
    subscribeGame
  };
}
