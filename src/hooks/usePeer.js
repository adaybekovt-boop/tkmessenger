import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer from 'peerjs';
import { createRingtonePlayer } from '../core/ringtone.js';
import { hapticMessage } from '../core/haptics.js';
import { clearAllMessages, clearPendingMessages, getMessageById, getMessages, getPendingMessages, saveMessage, updateMessageStatus } from '../core/db.js';
import { getOrCreateIdentity, resetIdentity as resetLocalIdentity, setIdentity } from '../core/identity.js';

function normalizePeerId(input) {
  return String(input || '').trim().toUpperCase();
}

function isValidPeerId(input) {
  const s = normalizePeerId(input);
  return /^[A-Z0-9_-]{3,64}$/.test(s);
}

function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed == null) return fallback;
    return parsed;
  } catch (_) {
    return fallback;
  }
}

const STORAGE = {
  peerId: 'orbits_peer_id',
  knownPeers: 'orbits_known_peers',
  messages: 'orbits_messages_v1'
};

function pickPersistedPeerId(desiredPeerId) {
  const desired = normalizePeerId(desiredPeerId);
  if (desired) return desired;
  const stored = normalizePeerId(localStorage.getItem(STORAGE.peerId) || '');
  return stored;
}

function now() {
  return Date.now();
}

export function usePeer({ enabled = true, desiredPeerId = '', localProfile = null } = {}) {
  const peerRef = useRef(null);
  const connsRef = useRef(new Map());
  const peerIdRef = useRef('');
  const selectedPeerIdRef = useRef('');
  const localProfileRef = useRef(localProfile);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const swapPeerIdRef = useRef(null);
  const typingTimeoutsRef = useRef(new Map());
  const seenMsgIdsRef = useRef(new Set());
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatByPeerRef = useRef(new Map());

  const callConnRef = useRef(null);
  const callStateRef = useRef({ status: 'idle', remoteId: '', videoEnabled: true, audioEnabled: true });
  const ringtoneRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [callState, setCallState] = useState({ status: 'idle', remoteId: '', videoEnabled: true, audioEnabled: true, localStream: null, remoteStream: null });

  const reconnectNow = useCallback(() => {
    const p = peerRef.current;
    if (!p || p.destroyed) return;
    try {
      p.reconnect();
    } catch (_) {
    }
  }, []);

  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);

  const [peers, setPeers] = useState([]);
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [messagesByPeer, setMessagesByPeer] = useState({});

  const [outboxByPeer, setOutboxByPeer] = useState({});
  const [typingByPeer, setTypingByPeer] = useState({});
  const callManagerRef = useRef(null);

  const [callStatus, setCallStatus] = useState('idle');
  const [activeCallFriend, setActiveCallFriend] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  // Keep refs in sync with state
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);
  useEffect(() => { localProfileRef.current = localProfile; }, [localProfile]);

  const connKey = useCallback((remoteId, channel) => {
    return `${normalizePeerId(remoteId)}|${channel}`;
  }, []);

  const getConn = useCallback((remoteId, channel) => {
    return connsRef.current.get(connKey(remoteId, channel)) || null;
  }, [connKey]);

  const upsertPeer = useCallback((id, patch) => {
    setPeers((prev) => {
      const normalized = normalizePeerId(id);
      const idx = prev.findIndex((p) => p.id === normalized);
      const next = { id: normalized, status: 'offline', lastSeenAt: 0, ...patch };
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }, []);

  const ensureHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;
    heartbeatIntervalRef.current = setInterval(() => {
      const my = String(peerIdRef.current || '');
      const nowTs = now();
      for (const [key, conn] of connsRef.current.entries()) {
        if (!key.endsWith('|ephemeral')) continue;
        if (!conn || !conn.open) continue;
        try {
          conn.send({ type: 'hb', from: my, ts: nowTs });
        } catch (_) {
        }
      }

      for (const p of peers) {
        const rid = p.id;
        const last = lastHeartbeatByPeerRef.current.get(rid) || 0;
        const reliable = getConn(rid, 'reliable');
        if (!reliable?.open && last && nowTs - last > 25000) {
          upsertPeer(rid, { status: 'offline' });
        }
      }
    }, 10000);
  }, [getConn, peers, upsertPeer]);

  const stopHeartbeatIfIdle = useCallback(() => {
    if (!heartbeatIntervalRef.current) return;
    for (const [key, conn] of connsRef.current.entries()) {
      if (!key.endsWith('|ephemeral')) continue;
      if (conn?.open) return;
    }
    clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = null;
  }, []);

  const pushMessage = useCallback((remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    setMessagesByPeer((prev) => {
      const list = prev[normalized] || [];
      return {
        ...prev,
        [normalized]: [...list, msg].slice(-500)
      };
    });
    upsertPeer(normalized, { lastSeenAt: now() });
  }, [upsertPeer]);

  const updateMessage = useCallback((remoteId, id, patch) => {
    const normalized = normalizePeerId(remoteId);
    setMessagesByPeer((prev) => {
      const list = prev[normalized] || [];
      const idx = list.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const copy = list.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return { ...prev, [normalized]: copy };
    });
  }, []);

  const loadPendingForPeer = useCallback(async (remoteId) => {
    const normalized = normalizePeerId(remoteId);
    try {
      const rows = await getPendingMessages(normalized, 400);
      const list = rows
        .map((r) => {
          const p = r.payload && typeof r.payload === 'object' ? r.payload : null;
          if (!p) return null;
          return {
            id: r.id,
            from: p.from,
            to: p.to,
            text: p.text,
            ts: p.ts,
            delivery: 'queued'
          };
        })
        .filter(Boolean);
      setOutboxByPeer((prev) => ({ ...prev, [normalized]: list }));
    } catch (_) {
    }
  }, []);

  const flushOutboxForPeer = useCallback(async (remoteId) => {
    const normalized = normalizePeerId(remoteId);
    const conn = getConn(normalized, 'reliable');
    if (!conn || !conn.open) return;
    let rows = [];
    try {
      rows = await getPendingMessages(normalized, 200);
    } catch (_) {
      return;
    }
    if (!rows.length) return;

    const sentIds = [];
    for (const r of rows) {
      const p = r.payload && typeof r.payload === 'object' ? r.payload : null;
      if (!p || typeof p.text !== 'string') continue;
      try {
        conn.send({ type: 'msg', id: r.id, text: p.text, ts: p.ts, from: p.from });
        sentIds.push(r.id);
        await updateMessageStatus(r.id, 'sent');
        updateMessage(normalized, r.id, { delivery: 'sent' });
      } catch (_) {
        break;
      }
    }

    if (sentIds.length) {
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: list.filter((m) => !sentIds.includes(m.id)) };
      });
    }
  }, [updateMessage]);

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
        void loadPendingForPeer(remoteId);
        void flushOutboxForPeer(remoteId);
        try {
          conn.send({ type: 'profile_req', nonce: Date.now() });
        } catch (_) {
        }
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

    const applyTyping = (isTyping) => {
      setTypingByPeer((prev) => {
        const next = { ...prev };
        if (isTyping) next[remoteId] = true;
        else delete next[remoteId];
        return next;
      });
      const prevT = typingTimeoutsRef.current.get(remoteId);
      if (prevT) clearTimeout(prevT);
      if (isTyping) {
        const t = setTimeout(() => {
          setTypingByPeer((prev) => {
            if (!prev[remoteId]) return prev;
            const next = { ...prev };
            delete next[remoteId];
            return next;
          });
          typingTimeoutsRef.current.delete(remoteId);
        }, 2800);
        typingTimeoutsRef.current.set(remoteId, t);
      } else {
        typingTimeoutsRef.current.delete(remoteId);
      }
    };

    const onData = (data) => {
      if (!data || typeof data !== 'object') return;
      if (ch === 'ephemeral') {
        if (data.type === 'typing') {
          applyTyping(!!data.isTyping);
        }
        if (data.type === 'hb') {
          lastHeartbeatByPeerRef.current.set(remoteId, now());
          upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
        }
        return;
      }
      if (data.type === 'profile_req') {
        const lp = localProfileRef.current;
        if (!lp) return;
        const nonce = typeof data.nonce === 'number' ? data.nonce : Date.now();
        conn.send({
          type: 'profile_res',
          nonce,
          profile: {
            peerId: lp.peerId,
            displayName: lp.displayName,
            bio: lp.bio,
            avatarDataUrl: lp.avatarDataUrl || null
          }
        });
        return;
      }
      if (data.type === 'profile_res') {
        const p = data.profile;
        if (!p || typeof p !== 'object') return;
        setProfilesByPeer((prev) => {
          const next = {
            ...prev,
            [remoteId]: {
              peerId: remoteId,
              displayName: String(p.displayName || remoteId).slice(0, 64),
              bio: String(p.bio || '').slice(0, 220),
              avatarDataUrl: typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : null
            }
          };
          try {
            localStorage.setItem('orbits_profiles_v1', JSON.stringify(next));
          } catch (_) {
          }
          return next;
        });
        return;
      }
      if (data.type === 'ack') {
        const ackId = typeof data.id === 'string' ? data.id : '';
        if (!ackId) return;
        updateMessage(remoteId, ackId, { delivery: 'delivered' });
        void updateMessageStatus(ackId, 'delivered');
        return;
      }

      const type = String(data.type || '');
      if (type !== 'msg' && type !== 'text') return;
      const text = typeof data.text === 'string' ? data.text : '';
      const ts = typeof data.ts === 'number' ? data.ts : now();
      const from = normalizePeerId(data.from || remoteId);
      const msgId = typeof data.id === 'string' && data.id ? data.id : `${from}:${ts}:${Math.random().toString(16).slice(2)}`;

      if (seenMsgIdsRef.current.has(msgId)) {
        try { conn.send({ type: 'ack', id: msgId, ts: now() }); } catch (_) {}
        return;
      }
      seenMsgIdsRef.current.add(msgId);
      if (seenMsgIdsRef.current.size > 4000) {
        seenMsgIdsRef.current = new Set(Array.from(seenMsgIdsRef.current).slice(-2000));
      }

      void (async () => {
        try {
          const existing = await getMessageById(msgId);
          if (existing) {
            try { conn.send({ type: 'ack', id: msgId, ts: now() }); } catch (_) {}
            return;
          }
        } catch (_) {
        }

        pushMessage(remoteId, { id: msgId, from: remoteId, to: peerIdRef.current, text, ts, delivery: 'received' });
        void saveMessage({
          id: msgId,
          peerId: remoteId,
          timestamp: ts,
          direction: 'in',
          status: 'delivered',
          payload: { id: msgId, from: remoteId, to: peerIdRef.current, text, ts }
        });
        try { conn.send({ type: 'ack', id: msgId, ts: now() }); } catch (_) {}

        if (typeof document !== 'undefined' && !document.hidden && typeof document.hasFocus === 'function' && document.hasFocus()) {
          hapticMessage();
        }
      })();
    };

    conn.on('open', onOpen);
    conn.on('close', onClose);
    conn.on('error', onError);
    conn.on('data', onData);
  }, [connKey, ensureHeartbeat, flushOutboxForPeer, getConn, loadPendingForPeer, pushMessage, stopHeartbeatIfIdle, upsertPeer]);

  const updateCallState = useCallback((patch) => {
    const prev = callStateRef.current;
    const next = { ...prev, ...patch };
    callStateRef.current = next;
    setCallState((s) => ({
      ...s,
      ...next,
      localStream: localStreamRef.current,
      remoteStream: remoteStreamRef.current
    }));
  }, []);

  const stopCallMedia = useCallback(() => {
    const ls = localStreamRef.current;
    localStreamRef.current = null;
    if (ls) {
      try {
        for (const t of ls.getTracks()) t.stop();
      } catch (_) {
      }
    }
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const stopRingtone = useCallback(() => {
    try {
      ringtoneRef.current?.stop();
    } catch (_) {
    }
  }, []);

  const ensureRingtone = useCallback(() => {
    if (!ringtoneRef.current) ringtoneRef.current = createRingtonePlayer();
    return ringtoneRef.current;
  }, []);

  const endCall = useCallback(() => {
    stopRingtone();
    const c = callConnRef.current;
    callConnRef.current = null;
    if (c) {
      try { c.close(); } catch (_) {}
    }
    stopCallMedia();
    updateCallState({ status: 'idle', remoteId: '' });
  }, [stopCallMedia, stopRingtone, updateCallState]);

  const toggleAudio = useCallback(() => {
    const s = localStreamRef.current;
    const track = s?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    updateCallState({ audioEnabled: track.enabled });
  }, [updateCallState]);

  const toggleVideo = useCallback(() => {
    const s = localStreamRef.current;
    const track = s?.getVideoTracks?.()[0];
    if (!track) {
      updateCallState({ videoEnabled: false });
      return;
    }
    track.enabled = !track.enabled;
    updateCallState({ videoEnabled: track.enabled });
  }, [updateCallState]);

  const getAudioConstraints = useCallback(() => {
    try {
      const raw = localStorage.getItem('orbits_mic_settings_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        return {
          deviceId: parsed.deviceId ? { exact: parsed.deviceId } : undefined,
          echoCancellation: parsed.echoCancellation !== false,
          noiseSuppression: parsed.noiseSuppression !== false,
          autoGainControl: parsed.autoGainControl !== false
        };
      }
    } catch (_) {
    }
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  }, []);

  const getVideoConstraints = useCallback((videoEnabled) => {
    if (!videoEnabled) return false;
    const saver = localStorage.getItem('orbits_power_saver') === '1';
    if (saver) {
      return { width: { ideal: 320, max: 426 }, height: { ideal: 240, max: 240 }, facingMode: 'user' };
    }
    return { facingMode: 'user' };
  }, []);

  const answerIncoming = useCallback(async (call) => {
    stopRingtone();
    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: getVideoConstraints(true)
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });
      }
      localStreamRef.current = stream;
      updateCallState({ status: 'in-call', audioEnabled: true, videoEnabled: !!stream.getVideoTracks?.()[0]?.enabled });
      callConnRef.current = call;
      call.answer(stream);
      call.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream;
        setCallState((s) => ({ ...s, remoteStream }));
      });
      call.on('close', endCall);
      call.on('error', endCall);
    } catch (_) {
      endCall();
    }
  }, [endCall, getAudioConstraints, getVideoConstraints, stopRingtone, updateCallState]);

  const startCall = useCallback(async (remoteId, { videoEnabled = true } = {}) => {
    const rid = normalizePeerId(remoteId);
    if (!peerRef.current || !peerIdRef.current || !rid) return;
    if (rid === peerIdRef.current) return;
    stopRingtone();

    updateCallState({ status: 'calling', remoteId: rid, videoEnabled, audioEnabled: true });
    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: getVideoConstraints(videoEnabled)
        });
      } catch (_) {
        if (!videoEnabled) throw _;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });
      }
      localStreamRef.current = stream;
      setCallState((s) => ({ ...s, localStream: stream }));
      const call = peerRef.current.call(rid, stream);
      callConnRef.current = call;
      call.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream;
        updateCallState({ status: 'in-call' });
        setCallState((s) => ({ ...s, remoteStream }));
      });
      call.on('close', endCall);
      call.on('error', endCall);
    } catch (_) {
      endCall();
    }
  }, [endCall, getAudioConstraints, getVideoConstraints, stopRingtone, updateCallState]);

  const acceptCall = useCallback(async () => {
    const c = callConnRef.current;
    if (!c || callStateRef.current.status !== 'ringing') return;
    await answerIncoming(c);
  }, [answerIncoming]);

  const rejectCall = useCallback(() => {
    stopRingtone();
    const c = callConnRef.current;
    callConnRef.current = null;
    if (c) {
      try { c.close(); } catch (_) {}
    }
    stopCallMedia();
    updateCallState({ status: 'idle', remoteId: '' });
  }, [stopCallMedia, stopRingtone, updateCallState]);

  useEffect(() => {
    if (!enabled) {
      try {
        for (const c of connsRef.current.values()) c.close();
      } catch (_) {
      }
      connsRef.current.clear();
      try {
        peerRef.current?.destroy();
      } catch (_) {
      }
      peerRef.current = null;
      setStatus('disabled');
      setPeerId('');
      return;
    }
    const identity = getOrCreateIdentity();
    const desiredId = normalizePeerId(desiredPeerId) || identity.peerId;

    setStatus('connecting');
    setError(null);

    reconnectAttemptRef.current = 0;

    const scheduleReconnect = (reason) => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current = Math.min(10, attempt + 1);
      const base = 800;
      const delay = Math.min(30000, base * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      setStatus(reason === 'offline' ? 'disconnected' : 'connecting');
      reconnectTimeoutRef.current = setTimeout(() => {
        if (peerRef.current !== peer || peer.destroyed) return;
        try {
          peer.reconnect();
        } catch (_) {
        }
      }, delay);
    };

    function createPeer(id) {
      try {
        return new Peer(id || undefined, {
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });
      } catch (_) {
        return new Peer(undefined, { debug: 0 });
      }
    }

    const peer = createPeer(desiredId);
    peerRef.current = peer;

    const onCall = (call) => {
      const callerId = normalizePeerId(call?.peer);
      if (!callerId) {
        try { call?.close(); } catch (_) {}
        return;
      }

      const current = callStateRef.current;
      if (current.status === 'in-call') {
        try { call.close(); } catch (_) {}
        return;
      }

      if (current.status === 'calling' && normalizePeerId(current.remoteId) === callerId) {
        const my = String(peerIdRef.current || '');
        const shouldCancelOutgoingAndAcceptIncoming = my && my.localeCompare(String(callerId)) < 0;
        if (shouldCancelOutgoingAndAcceptIncoming) {
          try { callConnRef.current?.close(); } catch (_) {}
          callConnRef.current = null;
          stopCallMedia();
          callConnRef.current = call;
          void answerIncoming(call);
          return;
        }
        try { call.close(); } catch (_) {}
        return;
      }

      callConnRef.current = call;
      updateCallState({ status: 'ringing', remoteId: callerId, videoEnabled: true, audioEnabled: true });
      ensureRingtone().start();
    };

    const onOpen = (id) => {
      reconnectAttemptRef.current = 0;
      const normalized = normalizePeerId(id);
      setPeerId(normalized);
      try {
        setIdentity({ peerId: normalized, displayName: identity.displayName || '' });
      } catch (_) {
      }
      setStatus('connected');

      const savedPeers = safeJsonParse(localStorage.getItem(STORAGE.knownPeers), []);
      if (Array.isArray(savedPeers) && savedPeers.length) {
        setPeers(savedPeers.map((p) => ({ id: normalizePeerId(p.id), status: 'offline', lastSeenAt: Number(p.lastSeenAt || 0) || 0 })));
      }

      (async () => {
        try {
          const loaded = {};
          const list = Array.isArray(savedPeers) ? savedPeers : [];
          for (const p of list.slice(0, 80)) {
            const pid = normalizePeerId(p.id);
            if (!pid) continue;
            const rows = await getMessages(pid, 50, Infinity);
            const msgs = rows
              .map((r) => {
                const payload = r.payload && typeof r.payload === 'object' ? r.payload : null;
                if (!payload) return null;
                const delivery =
                  r.direction === 'in'
                    ? 'received'
                    : r.status === 'pending'
                      ? 'queued'
                      : r.status === 'delivered' || r.status === 'read'
                        ? 'delivered'
                        : r.status === 'sent'
                          ? 'sent'
                          : 'queued';
                return { id: r.id, from: payload.from, to: payload.to, text: payload.text, ts: payload.ts, delivery };
              })
              .filter(Boolean)
              .sort((a, b) => (a.ts || 0) - (b.ts || 0));
            if (msgs.length) loaded[pid] = msgs;
          }
          setMessagesByPeer(loaded);
        } catch (_) {
        }
      })();
    };
    const onDisconnected = () => {
      scheduleReconnect('disconnected');
    };
    const onClose = () => {
      setStatus('disconnected');
    };
    let swappingId = false;
    const swapPeerId = (nextId) => {
      if (swappingId) return;
      swappingId = true;
      try {
        peer.off('open', onOpen);
        peer.off('disconnected', onDisconnected);
        peer.off('close', onClose);
        peer.off('error', onError);
        peer.off('connection', onConnection);
        peer.off('call', onCall);
      } catch (_) {
      }
      try {
        peer.destroy();
      } catch (_) {
      }

      const np = createPeer(nextId);
      peerRef.current = np;

      np.on('open', onOpen);
      np.on('disconnected', onDisconnected);
      np.on('close', onClose);
      np.on('error', onError);
      np.on('connection', onConnection);
      np.on('call', onCall);
      swappingId = false;
    };

    swapPeerIdRef.current = swapPeerId;

    const onError = (err) => {
      setError(err?.type ? String(err.type) : 'error');
      if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
        scheduleReconnect('error');
      }
      if (err?.type === 'unavailable-id') {
        const next = resetLocalIdentity();
        setStatus('connecting');
        swapPeerId(next.peerId);
      }
    };
    const onConnection = (conn) => {
      const label = String(conn?.metadata?.channel || conn?.label || 'reliable').toLowerCase();
      const ch = label.includes('eph') ? 'ephemeral' : 'reliable';
      if (!conn.metadata || typeof conn.metadata !== 'object') conn.metadata = {};
      conn.metadata.channel = ch;
      conn.metadata.initiator = false;
      attachConn(conn, ch);
    };

    peer.on('open', onOpen);
    peer.on('disconnected', onDisconnected);
    peer.on('close', onClose);
    peer.on('error', onError);
    peer.on('connection', onConnection);
    peer.on('call', onCall);

    const onOnline = () => {
      setStatus((s) => (s === 'connected' ? s : 'connecting'));
      try {
        if (peerRef.current && !peerRef.current.destroyed) peerRef.current.reconnect();
      } catch (_) {
      }
    };

    const onOffline = () => {
      setStatus('disconnected');
      scheduleReconnect('offline');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const net = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const onNetChange = () => {
      setStatus((s) => (s === 'connected' ? s : 'connecting'));
      reconnectNow();
    };
    if (net && typeof net.addEventListener === 'function') {
      net.addEventListener('change', onNetChange);
    }

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      try {
        for (const t of typingTimeoutsRef.current.values()) clearTimeout(t);
      } catch (_) {
      }
      typingTimeoutsRef.current.clear();
      lastHeartbeatByPeerRef.current.clear();
      swapPeerIdRef.current = null;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (net && typeof net.removeEventListener === 'function') {
        net.removeEventListener('change', onNetChange);
      }
      try {
        peer.off('open', onOpen);
        peer.off('disconnected', onDisconnected);
        peer.off('close', onClose);
        peer.off('error', onError);
        peer.off('connection', onConnection);
        peer.off('call', onCall);
      } catch (_) {
      }
      endCall();
      try {
        for (const c of connsRef.current.values()) c.close();
      } catch (_) {
      }
      connsRef.current.clear();
      try {
        peer.destroy();
      } catch (_) {
      }
      peerRef.current = null;
    };
  }, [answerIncoming, attachConn, desiredPeerId, enabled, endCall, ensureRingtone, reconnectNow, stopCallMedia, updateCallState]);

  const [profilesByPeer, setProfilesByPeer] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem('orbits_profiles_v1'), {});
    return stored && typeof stored === 'object' ? stored : {};
  });

  useEffect(() => {
    const toSave = peers.map((p) => ({ id: p.id, lastSeenAt: p.lastSeenAt || 0 }));
    localStorage.setItem(STORAGE.knownPeers, JSON.stringify(toSave));
  }, [peers]);

  useEffect(() => {}, [messagesByPeer]);

  const connect = useCallback(async (targetId) => {
    const normalized = normalizePeerId(targetId);
    if (!isValidPeerId(normalized)) {
      throw new Error('Неверный ID');
    }
    if (!peerRef.current) {
      throw new Error('PeerJS не готов');
    }
    if (normalized === peerIdRef.current) {
      throw new Error('Нельзя подключиться к себе');
    }
    const reliable = getConn(normalized, 'reliable');
    const ephemeral = getConn(normalized, 'ephemeral');
    if (reliable && reliable.open && ephemeral && ephemeral.open) {
      setSelectedPeerId(normalized);
      return;
    }
    upsertPeer(normalized, { status: 'connecting', lastSeenAt: now() });
    if (!reliable || !reliable.open) {
      const conn = peerRef.current.connect(normalized, { reliable: true, label: 'reliable', metadata: { channel: 'reliable', initiator: true } });
      attachConn(conn, 'reliable');
    }
    if (!ephemeral || !ephemeral.open) {
      const conn = peerRef.current.connect(normalized, { reliable: false, label: 'ephemeral', metadata: { channel: 'ephemeral', initiator: true } });
      attachConn(conn, 'ephemeral');
    }
    setSelectedPeerId(normalized);
  }, [attachConn, getConn, upsertPeer]);

  const requestRemoteProfile = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    const conn = getConn(normalized, 'reliable');
    if (!conn || !conn.open) return;
    conn.send({ type: 'profile_req', nonce: Date.now() });
  }, [getConn]);

  const sendTyping = useCallback((remoteId, isTyping) => {
    const normalized = normalizePeerId(remoteId);
    const conn = getConn(normalized, 'ephemeral');
    if (!conn || !conn.open) return;
    try {
      conn.send({ type: 'typing', isTyping: !!isTyping, ts: now() });
    } catch (_) {
    }
  }, [getConn]);

  const sendText = useCallback((targetId, text) => {
    const normalized = normalizePeerId(targetId);
    const body = String(text || '').trim();
    if (!body) return;
    const currentPeerId = peerIdRef.current;
    const conn = getConn(normalized, 'reliable');
    const ts = now();
    const msgId = `${currentPeerId}:${ts}:${Math.random().toString(16).slice(2)}`;
    const delivery = conn?.open ? 'sent' : 'queued';
    const msg = { id: msgId, from: currentPeerId, to: normalized, text: body, ts, delivery };
    pushMessage(normalized, msg);
    void saveMessage({
      id: msgId,
      peerId: normalized,
      timestamp: ts,
      direction: 'out',
      status: conn?.open ? 'sent' : 'pending',
      payload: { id: msgId, from: currentPeerId, to: normalized, text: body, ts }
    });
    if (!conn || !conn.open) {
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: [...list, msg].slice(-800) };
      });
      return;
    }
    try {
      conn.send({ type: 'msg', id: msgId, text: body, ts, from: currentPeerId });
      updateMessage(normalized, msgId, { delivery: 'sent' });
    } catch (_) {
      updateMessage(normalized, msgId, { delivery: 'queued' });
      void updateMessageStatus(msgId, 'pending');
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: [...list, { ...msg, delivery: 'queued' }].slice(-800) };
      });
    }
  }, [pushMessage, updateMessage]);

  const flushAllOutbox = useCallback(() => {
    const ids = peers.map((p) => p.id);
    for (const remoteId of ids) {
      void flushOutboxForPeer(remoteId);
    }
  }, [flushOutboxForPeer]);

  const clearAllHistory = useCallback(() => {
    setMessagesByPeer({});
    setOutboxByPeer({});
    setTypingByPeer({});
    try {
      localStorage.removeItem(STORAGE.messages);
    } catch (_) {
    }
    void clearAllMessages();
  }, []);

  const clearOutbox = useCallback(async () => {
    try {
      await clearPendingMessages(null);
    } catch (_) {
    }
    setOutboxByPeer({});
  }, []);

  const resetIdentity = useCallback(() => {
    const next = resetLocalIdentity();
    setError(null);
    setStatus('connecting');
    setPeerId(next.peerId);
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    try {
      for (const c of connsRef.current.values()) c.close();
    } catch (_) {
    }
    connsRef.current.clear();
    lastHeartbeatByPeerRef.current.clear();
    setPeers([]);
    setSelectedPeerId('');
    setMessagesByPeer({});
    setOutboxByPeer({});
    setTypingByPeer({});
    endCall();
    const swap = swapPeerIdRef.current;
    if (swap) swap(next.peerId);
  }, [endCall]);

  const connectionStatusByPeer = useMemo(() => {
    const map = new Map();
    for (const p of peers) map.set(p.id, p.status);
    return map;
  }, [peers]);

  return {
    peerId,
    status,
    error,
    peers,
    selectedPeerId,
    messagesByPeer,
    connectionStatusByPeer,
    setSelectedPeerId,
    connect,
    sendText,
    outboxByPeer,
    flushAllOutbox,
    clearOutbox,
    clearAllHistory,
    profilesByPeer,
    requestRemoteProfile,
    typingByPeer,
    sendTyping,
    resetIdentity,
    call: {
      state: callState,
      localVideoRef,
      remoteVideoRef,
      startCall,
      accept: acceptCall,
      reject: rejectCall,
      end: endCall,
      toggleAudio,
      toggleVideo
    },
    reconnectNow
  };
}
