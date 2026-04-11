// usePeer — P2P transport hook.
//
// Phase 1 refactor: this file is now an orchestrator. Domain-specific concerns
// are owned by dedicated hooks / managers:
//   - PeerConnectionManager  (peer/peerConnectionManager.js) — PeerJS lifecycle,
//     signaling rotation, reconnect backoff, network/visibility, multi-tab
//   - useCallSession (call/hooks/useCallSession.js) — thin React adapter over
//     CallManager; all call/media logic lives under src/call/
//   - usePeerRegistry (hooks/usePeerRegistry.js) — contacts, profiles, block list
//   - useMessaging   (hooks/useMessaging.js)   — per-peer message/outbox state
//     and the send/edit/delete/history API
//
// What still lives here:
//   - the connection map (`connsRef`) and per-connection attach / glare
//   - heartbeat loop on ephemeral channels
//   - wire-session handshake wiring (sendEncrypted + dispatchReliableInbound)
//   - top-level useEffect that drives PeerConnectionManager
//   - the public hook return surface (stable keys so callers don't change)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hapticMessage } from '../core/haptics.js';
import {
  getMessages,
  getMessageById,
  saveMessage,
  updateMessage as dbUpdateMessagePayload,
  deleteMessageRow,
  saveVoiceBlob,
  getVoiceBlob,
  deleteVoiceBlob,
  saveAvatar
} from '../core/db.js';
import {
  getOrCreateIdentity,
  resetIdentity as resetLocalIdentity,
  setIdentity
} from '../core/identity.js';
import { notifyNewMessage } from '../core/notifications.js';
import {
  normalizePeerId,
  isValidPeerId,
  connKey as buildConnKey,
  now
} from '../peer/helpers.js';
import { PeerConnectionManager } from '../peer/peerConnectionManager.js';
import {
  dispatchEphemeralInbound,
  dispatchReliableInbound
} from '../messaging/messageProtocol.js';
import { rowsToSortedUiMessages } from '../messaging/messageMapper.js';
import {
  initiateHandshake as wireInitiateHandshake,
  encryptOutbound as wireEncryptOutbound,
  waitReady as wireWaitReady,
  isReady as wireIsReady,
  teardownSession as wireTeardown
} from '../core/wireSession.js';
import { useCallSession } from '../call/index.js';
import { useDropSession } from '../drop/index.js';
import { usePeerRegistry } from './usePeerRegistry.js';
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
  const connsRef = useRef(new Map());

  const peerIdRef = useRef('');
  const selectedPeerIdRef = useRef('');
  const localProfileRef = useRef(localProfile);

  const seenMsgIdsRef = useRef(new Set());
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatByPeerRef = useRef(new Map());
  const typingTimeoutsRef = useRef(new Map());

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

  // Accessors that sit between the transport (`connsRef`) and the domain hooks.
  // Defined *before* useMessaging so they can be injected.
  const connKey = useCallback((remoteId, channel) => buildConnKey(remoteId, channel), []);

  const getConn = useCallback((remoteId, channel) => {
    return connsRef.current.get(buildConnKey(remoteId, channel)) || null;
  }, []);

  // Phase 2: everything app-level on the reliable channel flows through the
  // Double Ratchet. Plaintext is only used for wireHello / wireRekey envelopes.
  const sendEncrypted = useCallback(async (remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    const conn = connsRef.current.get(buildConnKey(normalized, 'reliable'));
    if (!conn || !conn.open) return false;
    try {
      if (!wireIsReady(normalized)) {
        await wireWaitReady(normalized, 8000);
      }
      const wire = await wireEncryptOutbound(normalized, msg);
      conn.send(wire);
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  const messaging = useMessaging({ peerIdRef, getConn, sendEncrypted, upsertPeer });
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
  // DropManager runs on the ephemeral channel (same rationale as heartbeats:
  // beacons are lossy-by-design, no point encrypting). These callbacks are
  // stable — they close over refs, not state — so the hook never rebuilds
  // its manager on re-render.

  const broadcastDropEphemeral = useCallback((packet) => {
    for (const [key, conn] of connsRef.current.entries()) {
      if (!key.endsWith('|ephemeral')) continue;
      if (!conn || !conn.open) continue;
      try { conn.send(packet); } catch (_) {}
    }
  }, []);

  const sendDropEphemeralTo = useCallback((remoteId, packet) => {
    const conn = connsRef.current.get(buildConnKey(normalizePeerId(remoteId), 'ephemeral'));
    if (!conn || !conn.open) return false;
    try { conn.send(packet); return true; } catch (_) { return false; }
  }, []);

  const getDropIdentity = useCallback(() => {
    const prof = localProfileRef.current || {};
    return {
      peerId: String(peerIdRef.current || ''),
      nickname: String(prof.displayName || prof.nickname || prof.name || '')
    };
  }, []);

  const drop = useDropSession({
    getIdentity: getDropIdentity,
    broadcastEphemeral: broadcastDropEphemeral,
    sendEphemeralTo: sendDropEphemeralTo
  });

  // ─── Keep refs in sync with the state they mirror ─────────────────────────
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);
  useEffect(() => { localProfileRef.current = localProfile; }, [localProfile]);

  // ─── Heartbeat on ephemeral channels ──────────────────────────────────────
  const ensureHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;
    heartbeatIntervalRef.current = setInterval(() => {
      const my = String(peerIdRef.current || '');
      const nowTs = now();
      for (const [key, conn] of connsRef.current.entries()) {
        if (!key.endsWith('|ephemeral')) continue;
        if (!conn || !conn.open) continue;
        try { conn.send({ type: 'hb', from: my, ts: nowTs }); } catch (_) {}
      }
      for (const p of peersRef.current) {
        const rid = p.id;
        const last = lastHeartbeatByPeerRef.current.get(rid) || 0;
        const reliable = getConn(rid, 'reliable');
        if (!reliable?.open && last && nowTs - last > 25000) {
          upsertPeer(rid, { status: 'offline' });
        }
      }
    }, 10000);
  }, [getConn, peersRef, upsertPeer]);

  const stopHeartbeatIfIdle = useCallback(() => {
    if (!heartbeatIntervalRef.current) return;
    for (const [key, conn] of connsRef.current.entries()) {
      if (!key.endsWith('|ephemeral')) continue;
      if (conn?.open) return;
    }
    clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = null;
  }, []);

  // ─── Connection attach (glare-aware) ──────────────────────────────────────
  const attachConn = useCallback((conn, channel) => {
    const remoteId = normalizePeerId(conn.peer);
    const ch = channel === 'ephemeral' ? 'ephemeral' : 'reliable';
    const key = connKey(remoteId, ch);

    const myId = String(peerIdRef.current || '');
    const initiator = !!conn?.metadata?.initiator;
    const shouldKeepInitiator = myId && myId.localeCompare(remoteId) < 0;
    const existing = connsRef.current.get(key);

    if (existing && existing !== conn) {
      const existingInitiator = !!existing?.metadata?.initiator;
      const preferredInitiator = shouldKeepInitiator;

      const connId = String(conn.connectionId || conn.id || '');
      const existingId = String(existing.connectionId || existing.id || '');

      const preferred =
        initiator === preferredInitiator && existingInitiator !== preferredInitiator
          ? conn
          : existingInitiator === preferredInitiator && initiator !== preferredInitiator
            ? existing
            : connId && existingId
              ? connId.localeCompare(existingId) < 0
                ? conn
                : existing
              : existing;

      const toClose = preferred === conn ? existing : conn;
      try { toClose.close(); } catch (_) {}
      if (preferred !== conn) return;
    }

    connsRef.current.set(key, conn);
    if (ch === 'reliable') upsertPeer(remoteId, { status: 'connecting', lastSeenAt: now() });

    const onOpen = () => {
      if (ch === 'reliable') {
        upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
        if (!selectedPeerIdRef.current) setSelectedPeerId(remoteId);
        // Phase 2 — wire handshake before any app-level traffic.
        void (async () => {
          try {
            const hello = await wireInitiateHandshake(remoteId, String(peerIdRef.current || ''));
            try { conn.send(hello); } catch (_) {}
            await wireWaitReady(remoteId, 8000).catch(() => {});
          } catch (err) {
            try { console.warn('[wire] initiateHandshake failed', err); } catch (_) {}
          }
          void loadPendingForPeer(remoteId);
          void flushOutboxForPeer(remoteId);
          void sendEncrypted(remoteId, { type: 'profile_req', nonce: Date.now() });
        })();
      } else {
        lastHeartbeatByPeerRef.current.set(remoteId, now());
        ensureHeartbeat();
      }
    };
    const onClose = () => {
      const current = connsRef.current.get(key);
      if (current === conn) connsRef.current.delete(key);
      if (ch === 'reliable') upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
      else stopHeartbeatIfIdle();
    };
    const onError = () => {
      if (ch === 'reliable') upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
    };

    const onData = (data) => {
      if (ch === 'ephemeral') {
        if (!data || typeof data !== 'object') return;
        // Drop-feature packets ride the ephemeral channel — catch them before
        // the generic dispatcher so they don't look like unknown-type garbage.
        if (typeof data.type === 'string' && data.type.startsWith('drop-')) {
          dropHandlePacketRef.current?.(remoteId, data);
          return;
        }
        dispatchEphemeralInbound(data, remoteId, {
          applyTyping: (isTyping) => applyTypingWithTimeout(remoteId, isTyping),
          onHeartbeat: () => {
            lastHeartbeatByPeerRef.current.set(remoteId, now());
            upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
          }
        });
        return;
      }
      void dispatchReliableInbound(data, conn, remoteId, {
        localProfileRef,
        peerIdRef,
        seenMsgIdsRef,
        setProfilesByPeer,
        saveAvatar,
        updateMessage,
        queueAckStatus,
        pushMessage,
        saveMessage,
        saveVoiceBlob,
        getMessageById,
        deleteMessageRow,
        deleteVoiceBlob,
        dbUpdateMessagePayload,
        setMessagesByPeer,
        notifyNewMessage,
        hapticMessage,
        sendEncrypted: (msg) => { void sendEncrypted(remoteId, msg); },
        onHandshakeError: (err) => { try { console.warn('[wire] handshake error', err); } catch (_) {} },
        onDecryptError: (err) => { try { console.warn('[wire] decrypt error', err); } catch (_) {} },
        onUnexpectedPlaintext: (d) => { try { console.warn('[wire] dropped unencrypted payload', d?.type || typeof d); } catch (_) {} }
      });
    };

    conn.on('open', onOpen);
    conn.on('close', onClose);
    conn.on('error', onError);
    conn.on('data', onData);
  }, [
    applyTypingWithTimeout, connKey, ensureHeartbeat, flushOutboxForPeer,
    loadPendingForPeer, pushMessage, queueAckStatus, sendEncrypted,
    setMessagesByPeer, setProfilesByPeer, stopHeartbeatIfIdle, updateMessage,
    upsertPeer
  ]);

  // Latest-refs so the long-lived useEffect can call them without re-running.
  const attachConnRef = useLatestRef(attachConn);
  const callHandleIncomingRef = useLatestRef(call.handleIncomingCall);
  const callEndRef = useLatestRef(call.endCall);
  const dropHandlePacketRef = useLatestRef(drop.handlePacket);
  const hydrateFromStorageRef = useLatestRef(hydrateFromStorage);
  const ensureHeartbeatRef = useLatestRef(ensureHeartbeat);
  const setMessagesByPeerRef = useLatestRef(setMessagesByPeer);

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
          (async () => {
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
          })();
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
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      try {
        for (const t of typingTimeoutsRef.current.values()) clearTimeout(t);
      } catch (_) {}
      typingTimeoutsRef.current.clear();
      lastHeartbeatByPeerRef.current.clear();
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
    if (!isValidPeerId(normalized)) throw new Error('Неверный ID');
    if (!peerRef.current) throw new Error('PeerJS не готов');
    if (normalized === peerIdRef.current) throw new Error('Нельзя подключиться к себе');

    const reliable = getConn(normalized, 'reliable');
    const ephemeral = getConn(normalized, 'ephemeral');
    if (reliable && reliable.open && ephemeral && ephemeral.open) {
      setSelectedPeerId(normalized);
      return;
    }
    upsertPeer(normalized, { status: 'connecting', lastSeenAt: now() });
    if (!reliable || !reliable.open) {
      const conn = peerRef.current.connect(normalized, {
        reliable: true,
        label: 'reliable',
        metadata: { channel: 'reliable', initiator: true }
      });
      attachConn(conn, 'reliable');
    }
    if (!ephemeral || !ephemeral.open) {
      const conn = peerRef.current.connect(normalized, {
        reliable: false,
        label: 'ephemeral',
        metadata: { channel: 'ephemeral', initiator: true }
      });
      attachConn(conn, 'ephemeral');
    }
    setSelectedPeerId(normalized);
  }, [attachConn, getConn, upsertPeer]);

  const requestRemoteProfile = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    void sendEncrypted(normalized, { type: 'profile_req', nonce: Date.now() });
  }, [sendEncrypted]);

  const flushAllOutbox = useCallback(() => {
    flushAllOutboxBase(peersRef.current.map((p) => p.id));
  }, [flushAllOutboxBase, peersRef]);

  const resetIdentity = useCallback(() => {
    const next = resetLocalIdentity();
    setError(null);
    setStatus('connecting');
    setPeerId(next.peerId);
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    try { for (const c of connsRef.current.values()) c.close(); } catch (_) {}
    connsRef.current.clear();
    lastHeartbeatByPeerRef.current.clear();
    resetRegistry();
    setSelectedPeerId('');
    resetMessagingState();
    call.endCall?.();
    pcmRef.current?.swapPeerId(next.peerId);
  }, [call, resetMessagingState, resetRegistry]);

  const blockPeer = useCallback((remoteId) => {
    registryBlockPeer(remoteId, (normalized) => {
      const c1 = getConn(normalized, 'reliable');
      const c2 = getConn(normalized, 'ephemeral');
      try { c1?.close(); } catch (_) {}
      try { c2?.close(); } catch (_) {}
      connsRef.current.delete(buildConnKey(normalized, 'reliable'));
      connsRef.current.delete(buildConnKey(normalized, 'ephemeral'));
      void wireTeardown(normalized);
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
      activate: drop.activate,
      deactivate: drop.deactivate,
      setVisibility: drop.setVisibility
    },
    reconnectNow
  };
}
