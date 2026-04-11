import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer from 'peerjs';
import { createRingtonePlayer } from '../core/ringtone.js';
import { hapticMessage } from '../core/haptics.js';
import { clearAllMessages, clearPendingMessages, deleteMessagesOlderThan, getMessageById, getMessages, getPendingMessages, saveMessage, updateMessage as dbUpdateMessagePayload, updateMessageStatus, updateMessageStatusesBatch, deleteMessageRow, saveVoiceBlob, getVoiceBlob, deleteVoiceBlob, saveAvatar, getAvatar, getAllPeers, savePeer } from '../core/db.js';
import { base64ToBlob, blobToBase64 } from '../core/audioRecorder.js';
import { getOrCreateIdentity, resetIdentity as resetLocalIdentity, setIdentity } from '../core/identity.js';
import { notifyNewMessage, notifyIncomingCall } from '../core/notifications.js';

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

function mapPeerError(err) {
  const type = String(err?.type || err || '').trim();
  if (!type) return 'Неизвестная ошибка';
  const map = {
    'browser-incompatible': 'Браузер не поддерживает WebRTC/P2P',
    disconnected: 'Соединение потеряно',
    network: 'Проблемы с сетью — проверь интернет',
    'peer-unavailable': 'Пир недоступен (оффлайн или неверный ID)',
    'server-error': 'Ошибка сигнального сервера',
    'socket-error': 'Ошибка соединения с сервером сигналинга',
    'unavailable-id': 'Peer ID уже занят — нужен новый',
  };
  return map[type] || type;
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
  const peersRef = useRef([]);
  const ackQueueRef = useRef(new Map());
  const ackFlushTimeoutRef = useRef(null);
  const peerLockTokenRef = useRef('');
  const peerLockIntervalRef = useRef(null);
  const signalingHostsRef = useRef(null);
  const signalingIndexRef = useRef(0);
  const networkErrStreakRef = useRef(0);
  const lastNetworkErrAtRef = useRef(0);

  const callConnRef = useRef(null);
  const callStateRef = useRef({ status: 'idle', remoteId: '', videoEnabled: true, audioEnabled: true });
  const ringtoneRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [callState, setCallState] = useState({
    status: 'idle',
    remoteId: '',
    videoEnabled: true,
    audioEnabled: true,
    localStream: null,
    remoteStream: null,
    screenSharing: false,
    facingMode: 'user'
  });
  const savedCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);

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
  const [signalingHost, setSignalingHost] = useState('');

  const [peers, setPeers] = useState([]);
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [messagesByPeer, setMessagesByPeer] = useState({});

  const [outboxByPeer, setOutboxByPeer] = useState({});
  const [typingByPeer, setTypingByPeer] = useState({});
  const [blockedPeers, setBlockedPeers] = useState(() => {
    try {
      const raw = localStorage.getItem('orbits_blocked_peers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });
  const blockedPeersRef = useRef(blockedPeers);
  useEffect(() => { blockedPeersRef.current = blockedPeers; }, [blockedPeers]);
  const webLockRef = useRef(null);

  const [callStatus, setCallStatus] = useState('idle');
  const [activeCallFriend, setActiveCallFriend] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);

  // Keep refs in sync with state
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);
  useEffect(() => { localProfileRef.current = localProfile; }, [localProfile]);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  const connKey = useCallback((remoteId, channel) => {
    return `${normalizePeerId(remoteId)}|${channel}`;
  }, []);

  const getConn = useCallback((remoteId, channel) => {
    return connsRef.current.get(connKey(remoteId, channel)) || null;
  }, [connKey]);

  const queueAckStatus = useCallback((id, status) => {
    const msgId = String(id || '');
    if (!msgId) return;
    ackQueueRef.current.set(msgId, String(status || 'delivered'));
    if (ackFlushTimeoutRef.current) return;
    ackFlushTimeoutRef.current = setTimeout(async () => {
      ackFlushTimeoutRef.current = null;
      const batch = Array.from(ackQueueRef.current.entries());
      ackQueueRef.current.clear();
      const deliveredIds = batch.filter(([, st]) => st === 'delivered').map(([mid]) => mid);
      const sentIds = batch.filter(([, st]) => st === 'sent').map(([mid]) => mid);
      try {
        if (deliveredIds.length) await updateMessageStatusesBatch(deliveredIds, 'delivered');
        if (sentIds.length) await updateMessageStatusesBatch(sentIds, 'sent');
      } catch (_) {
      }
    }, 450);
  }, []);

  const upsertPeer = useCallback((id, patch) => {
    const normalized = normalizePeerId(id);
    setPeers((prev) => {
      const idx = prev.findIndex((p) => p.id === normalized);
      const next = { id: normalized, status: 'offline', lastSeenAt: 0, ...patch };
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
    // Persist contact to IndexedDB so it survives logout/localStorage clearing
    savePeer({ id: normalized, lastSeenAt: patch.lastSeenAt || Date.now(), trusted: true }).catch(() => {});
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

      for (const p of peersRef.current) {
        const rid = p.id;
        const last = lastHeartbeatByPeerRef.current.get(rid) || 0;
        const reliable = getConn(rid, 'reliable');
        if (!reliable?.open && last && nowTs - last > 25000) {
          upsertPeer(rid, { status: 'offline' });
        }
      }
    }, 10000);
  }, [getConn, upsertPeer]);

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
        const rawAvatar = typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : null;
        const safeAvatar = rawAvatar && rawAvatar.startsWith('data:image/') ? rawAvatar : null;
        if (safeAvatar) {
          void saveAvatar(remoteId, safeAvatar);
        }
        setProfilesByPeer((prev) => {
          const next = {
            ...prev,
            [remoteId]: {
              peerId: remoteId,
              displayName: String(p.displayName || remoteId).slice(0, 64),
              bio: String(p.bio || '').slice(0, 220),
              avatarDataUrl: safeAvatar
            }
          };
          try {
            const keys = Object.keys(next);
            const limited = keys.length > 50
              ? Object.fromEntries(keys.slice(-50).map((k) => [k, next[k]]))
              : next;
            const toStore = {};
            for (const [k, v] of Object.entries(limited)) {
              toStore[k] = { peerId: v.peerId, displayName: v.displayName, bio: v.bio };
            }
            localStorage.setItem('orbits_profiles_v1', JSON.stringify(toStore));
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
        queueAckStatus(ackId, 'delivered');
        return;
      }

      if (data.type === 'edit') {
        const id = String(data.id || '');
        if (!id) return;
        const newText = typeof data.text === 'string' ? data.text : '';
        const editedAt = Number(data.editedAt) || now();
        updateMessage(remoteId, id, { text: newText, editedAt });
        void (async () => {
          try {
            const row = await getMessageById(id);
            if (row) {
              const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
              await dbUpdateMessagePayload(id, {
                payload: { ...payload, text: newText, editedAt }
              });
            }
          } catch (_) {
          }
        })();
        return;
      }

      if (data.type === 'delete') {
        const id = String(data.id || '');
        if (!id) return;
        const forEveryone = !!data.forEveryone;
        if (forEveryone) {
          // Полностью удаляем (как в Telegram — без следа)
          setMessagesByPeer((prev) => {
            const list = prev[remoteId] || [];
            const next = list.filter((m) => m.id !== id);
            if (next.length === list.length) return prev;
            return { ...prev, [remoteId]: next };
          });
          void deleteMessageRow(id);
          void deleteVoiceBlob(id).catch(() => {});
        }
        return;
      }

      const type = String(data.type || '');
      if (type !== 'msg' && type !== 'text') return;
      const text = typeof data.text === 'string' ? data.text : '';
      const ts = typeof data.ts === 'number' ? data.ts : now();
      const from = normalizePeerId(data.from || remoteId);
      const msgId = typeof data.id === 'string' && data.id ? data.id : `${from}:${ts}:${Math.random().toString(16).slice(2)}`;
      const msgType = typeof data.msgType === 'string' ? data.msgType : 'text';
      const sticker = data.sticker && typeof data.sticker === 'object' ? data.sticker : null;
      const replyTo = data.replyTo && typeof data.replyTo === 'object' ? data.replyTo : null;
      const voiceMeta = data.voice && typeof data.voice === 'object' ? data.voice : null;

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

        // Если голосовое — сохраняем blob локально, в сообщении храним только id
        let voiceRef = null;
        if (voiceMeta && typeof voiceMeta.b64 === 'string') {
          try {
            const blob = base64ToBlob(voiceMeta.b64, voiceMeta.mime || 'audio/webm');
            await saveVoiceBlob(msgId, blob, {
              mime: voiceMeta.mime,
              duration: Number(voiceMeta.duration) || 0,
              waveform: Array.isArray(voiceMeta.waveform) ? voiceMeta.waveform : []
            });
            voiceRef = {
              duration: Number(voiceMeta.duration) || 0,
              mime: voiceMeta.mime || 'audio/webm',
              waveform: Array.isArray(voiceMeta.waveform) ? voiceMeta.waveform : []
            };
          } catch (_) {
          }
        } else if (voiceMeta) {
          voiceRef = {
            duration: Number(voiceMeta.duration) || 0,
            mime: voiceMeta.mime || 'audio/webm',
            waveform: Array.isArray(voiceMeta.waveform) ? voiceMeta.waveform : []
          };
        }

        const uiMsg = {
          id: msgId,
          from: remoteId,
          to: peerIdRef.current,
          text,
          ts,
          delivery: 'received',
          type: msgType,
          sticker,
          replyTo,
          voice: voiceRef
        };
        pushMessage(remoteId, uiMsg);
        void saveMessage({
          id: msgId,
          peerId: remoteId,
          timestamp: ts,
          direction: 'in',
          status: 'delivered',
          payload: {
            id: msgId,
            from: remoteId,
            to: peerIdRef.current,
            text,
            ts,
            type: msgType,
            sticker,
            replyTo,
            voice: voiceRef
          }
        });
        try { conn.send({ type: 'ack', id: msgId, ts: now() }); } catch (_) {}

        if (typeof document !== 'undefined' && !document.hidden && typeof document.hasFocus === 'function' && document.hasFocus()) {
          hapticMessage();
        }

        // Phase 3.5 — Browser notification when tab is not focused
        const preview = msgType === 'sticker' ? (sticker?.emoji || '🖼 Стикер') : msgType === 'voice' ? '🎤 Голосовое' : text;
        notifyNewMessage({ from: remoteId, text: preview, tag: msgId });
      })();
    };

    conn.on('open', onOpen);
    conn.on('close', onClose);
    conn.on('error', onError);
    conn.on('data', onData);
  }, [connKey, ensureHeartbeat, flushOutboxForPeer, getConn, loadPendingForPeer, pushMessage, queueAckStatus, stopHeartbeatIfIdle, upsertPeer]);

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
    const scr = screenStreamRef.current;
    screenStreamRef.current = null;
    if (scr) {
      try { scr.getTracks().forEach((t) => t.stop()); } catch (_) {}
    }
    savedCameraTrackRef.current = null;
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
    updateCallState({ status: 'idle', remoteId: '', screenSharing: false });
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

  const replaceVideoSenderTrack = useCallback(async (newTrack) => {
    const call = callConnRef.current;
    const pc = call?.peerConnection;
    if (!pc || typeof pc.getSenders !== 'function') return false;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (!sender) return false;
    try {
      await sender.replaceTrack(newTrack);
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  const switchCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const current = callStateRef.current;
      const nextFacing = current.facingMode === 'user' ? 'environment' : 'user';
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false
      });
      const newVideoTrack = nextStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      await replaceVideoSenderTrack(newVideoTrack);

      const local = localStreamRef.current;
      if (local) {
        const old = local.getVideoTracks()[0];
        if (old) {
          try { local.removeTrack(old); } catch (_) {}
          try { old.stop(); } catch (_) {}
        }
        local.addTrack(newVideoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      updateCallState({ facingMode: nextFacing, videoEnabled: true });
    } catch (err) {
      console.warn('Camera switch failed', err);
    }
  }, [replaceVideoSenderTrack, updateCallState]);

  const startScreenShare = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Демонстрация экрана не поддерживается');
      }
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 24 },
        audio: true
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      const local = localStreamRef.current;
      if (local) {
        savedCameraTrackRef.current = local.getVideoTracks()[0] || null;
      }

      screenTrack.onended = () => {
        void stopScreenShare();
      };

      await replaceVideoSenderTrack(screenTrack);
      screenStreamRef.current = screenStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      updateCallState({ screenSharing: true });
    } catch (err) {
      console.warn('Screen share failed', err);
      updateCallState({ screenSharing: false });
    }
  }, [replaceVideoSenderTrack, updateCallState]);

  const stopScreenShare = useCallback(async () => {
    const scr = screenStreamRef.current;
    screenStreamRef.current = null;
    if (scr) {
      try { scr.getTracks().forEach((t) => t.stop()); } catch (_) {}
    }
    const saved = savedCameraTrackRef.current;
    savedCameraTrackRef.current = null;
    if (saved && saved.readyState === 'live') {
      await replaceVideoSenderTrack(saved);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } else {
      // Пересоздать поток камеры
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: callStateRef.current.facingMode || 'user' }
        });
        const track = fresh.getVideoTracks()[0];
        if (track) {
          await replaceVideoSenderTrack(track);
          const local = localStreamRef.current;
          if (local) {
            const old = local.getVideoTracks()[0];
            if (old) {
              try { local.removeTrack(old); } catch (_) {}
              try { old.stop(); } catch (_) {}
            }
            local.addTrack(track);
          }
          if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        }
      } catch (_) {
      }
    }
    updateCallState({ screenSharing: false });
  }, [replaceVideoSenderTrack, updateCallState]);

  const toggleScreenShare = useCallback(async () => {
    if (callStateRef.current.screenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [startScreenShare, stopScreenShare]);

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

    if (typeof RTCPeerConnection === 'undefined') {
      setStatus('unsupported');
      setError('Ваш браузер не поддерживает P2P-соединения');
      return;
    }

    const identity = getOrCreateIdentity();
    const desiredId = normalizePeerId(desiredPeerId) || identity.peerId;

    const envPeerHost = import.meta.env?.VITE_PEER_HOST;
    const envPeerPath = import.meta.env?.VITE_PEER_PATH;
    const envPeerPort = import.meta.env?.VITE_PEER_PORT;
    const envPeerSecure = import.meta.env?.VITE_PEER_SECURE;
    const envPeerServer = import.meta.env?.VITE_PEER_SERVER;

    if (!signalingHostsRef.current) {
      const list = [];
      if (envPeerServer) {
        list.push('__URL__');
      } else if (envPeerHost) {
        list.push(String(envPeerHost));
      } else {
        list.push('0.peerjs.com', '1.peerjs.com', '2.peerjs.com');
      }
      signalingHostsRef.current = list;
      signalingIndexRef.current = 0;
    }

    const currentHost = signalingHostsRef.current[signalingIndexRef.current] || '';
    setSignalingHost(envPeerServer ? String(envPeerServer) : currentHost);

    const lockKey = `orbits_peer_lock:${desiredId}`;
    const token = Math.random().toString(36).slice(2);
    peerLockTokenRef.current = token;

    const lockWrite = () => {
      try {
        localStorage.setItem(lockKey, JSON.stringify({ token, ts: Date.now() }));
      } catch (_) {
      }
    };
    const lockRead = () => {
      try {
        return safeJsonParse(localStorage.getItem(lockKey), null);
      } catch (_) {
        return null;
      }
    };

    const existing = lockRead();
    if (existing && existing.token && existing.token !== token && Date.now() - Number(existing.ts || 0) < 4500) {
      setStatus('multitab');
      setError('Открыта другая вкладка с этим Peer ID');
      return;
    }

    lockWrite();
    if (peerLockIntervalRef.current) clearInterval(peerLockIntervalRef.current);
    peerLockIntervalRef.current = setInterval(lockWrite, 2000);

    const onStorage = (e) => {
      if (!e || e.key !== lockKey) return;
      const v = safeJsonParse(e.newValue, null);
      if (!v || v.token === token) return;
      if (Date.now() - Number(v.ts || 0) > 4500) return;
      setStatus('multitab');
      setError('Открыта другая вкладка с этим Peer ID');
      try {
        peerRef.current?.destroy();
      } catch (_) {
      }
      peerRef.current = null;
    };
    window.addEventListener('storage', onStorage);

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
        const cur = peerRef.current;
        if (!cur || cur.destroyed) return;
        try {
          cur.reconnect();
        } catch (_) {
        }
      }, delay);
    };

    function createPeer(id) {
      try {
        const turnUrl = import.meta.env?.VITE_TURN_URL;
        const turnUsername = import.meta.env?.VITE_TURN_USERNAME;
        const turnCredential = import.meta.env?.VITE_TURN_CREDENTIAL;
        const iceServers = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:stun.services.mozilla.com' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ];
        if (turnUrl && turnUsername && turnCredential) {
          iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
        }
        let host = signalingHostsRef.current?.[signalingIndexRef.current];
        let path = envPeerPath ? String(envPeerPath) : '/';
        let secure = envPeerSecure != null ? String(envPeerSecure) === 'true' : true;
        let port = envPeerPort != null ? Number(envPeerPort) : secure ? 443 : 80;

        if (envPeerServer) {
          const u = new URL(String(envPeerServer));
          host = u.hostname;
          secure = u.protocol === 'https:';
          port = u.port ? Number(u.port) : secure ? 443 : 80;
          path = u.pathname || '/';
        }

        return new Peer(id || undefined, {
          host: host === '__URL__' ? undefined : host,
          port,
          path,
          secure,
          debug: 0,
          config: {
            iceServers
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
      if (blockedPeersRef.current.includes(callerId)) {
        try { call.close(); } catch (_) {}
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
      // Phase 3.5 — Notify incoming call when tab is hidden
      notifyIncomingCall({ from: callerId });
    };

    const onOpen = (id) => {
      reconnectAttemptRef.current = 0;
      networkErrStreakRef.current = 0;
      lastNetworkErrAtRef.current = 0;
      const normalized = normalizePeerId(id);
      setPeerId(normalized);
      try {
        setIdentity({ peerId: normalized, displayName: identity.displayName || '' });
      } catch (_) {
      }
      setStatus('connected');

      let savedPeers = safeJsonParse(localStorage.getItem(STORAGE.knownPeers), []);
      if (Array.isArray(savedPeers) && savedPeers.length) {
        setPeers(savedPeers.map((p) => ({ id: normalizePeerId(p.id), status: 'offline', lastSeenAt: Number(p.lastSeenAt || 0) || 0 })));
      }

      (async () => {
        try {
          // Fallback: if localStorage contacts are empty, recover from IndexedDB
          if (!savedPeers.length) {
            try {
              const idbPeers = await getAllPeers();
              if (Array.isArray(idbPeers) && idbPeers.length) {
                savedPeers = idbPeers.map((p) => ({ id: normalizePeerId(p.id), lastSeenAt: Number(p.lastSeenAt || 0) || 0 }));
                setPeers(savedPeers.map((p) => ({ id: p.id, status: 'offline', lastSeenAt: p.lastSeenAt })));
                localStorage.setItem(STORAGE.knownPeers, JSON.stringify(savedPeers));
              }
            } catch (_) {}
          }
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
                return {
                  id: r.id,
                  from: payload.from,
                  to: payload.to,
                  text: payload.text,
                  ts: payload.ts,
                  delivery,
                  type: payload.type || 'text',
                  sticker: payload.sticker || null,
                  replyTo: payload.replyTo || null,
                  voice: payload.voice || null,
                  editedAt: payload.editedAt || null
                };
              })
              .filter(Boolean)
              .sort((a, b) => (a.ts || 0) - (b.ts || 0));
            if (msgs.length) loaded[pid] = msgs;
          }
          // Merge with existing in-memory state to avoid clobbering messages
          // that were sent before DB persistence caught up.
          setMessagesByPeer((prev) => {
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
      const oldPeer = peerRef.current;
      if (oldPeer) {
        try {
          oldPeer.off('open', onOpen);
          oldPeer.off('disconnected', onDisconnected);
          oldPeer.off('close', onClose);
          oldPeer.off('error', onError);
          oldPeer.off('connection', onConnection);
          oldPeer.off('call', onCall);
        } catch (_) {
        }
        try {
          oldPeer.destroy();
        } catch (_) {
        }
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
      setError(mapPeerError(err));
      if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
        const t = Date.now();
        const delta = t - (lastNetworkErrAtRef.current || 0);
        lastNetworkErrAtRef.current = t;
        networkErrStreakRef.current = delta < 12000 ? networkErrStreakRef.current + 1 : 1;

        const canRotate = !envPeerHost && (signalingHostsRef.current?.length || 0) > 1;
        if (canRotate && networkErrStreakRef.current >= 2) {
          networkErrStreakRef.current = 0;
          signalingIndexRef.current = (signalingIndexRef.current + 1) % signalingHostsRef.current.length;
          const nextHost = signalingHostsRef.current[signalingIndexRef.current] || '';
          setSignalingHost(nextHost);
          setStatus('connecting');
          swapPeerId(peerIdRef.current || desiredId);
          return;
        }
        scheduleReconnect('error');
      }
      if (err?.type === 'unavailable-id') {
        // Don't regenerate ID — retry with the same ID after backoff.
        // PeerJS server releases stale IDs after ~45s timeout.
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = Math.min(10, attempt + 1);
        const delay = Math.min(30000, 2000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 1000);
        setStatus('connecting');
        reconnectTimeoutRef.current = setTimeout(() => {
          const currentId = peerIdRef.current || desiredId;
          swapPeerId(currentId);
        }, delay);
      }
    };
    const onConnection = (conn) => {
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
      try {
        for (const c of connsRef.current.values()) c.close();
      } catch (_) {
      }
      connsRef.current.clear();
      const cur = peerRef.current;
      if (cur && !cur.destroyed) {
        try {
          cur.disconnect();
        } catch (_) {
        }
        try {
          cur.reconnect();
        } catch (_) {
        }
      }
    };
    if (net && typeof net.addEventListener === 'function') {
      net.addEventListener('change', onNetChange);
    }

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        lockWrite();
        return;
      }
      setStatus((s) => (s === 'connected' ? s : 'connecting'));
      const cur = peerRef.current;
      if (cur && !cur.destroyed) {
        try {
          cur.reconnect();
        } catch (_) {
        }
      }
      ensureHeartbeat();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    // Web Locks API — keep-alive for background tabs
    // Acquiring a lock prevents the browser from freezing/killing
    // the tab's network connections while in background
    let webLockAbort = null;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      try {
        const abortCtrl = new AbortController();
        webLockAbort = abortCtrl;
        navigator.locks.request(
          `orbits-peer-keepalive-${desiredId}`,
          { signal: abortCtrl.signal },
          () => new Promise(() => { /* never resolves — holds lock until abort */ })
        ).catch(() => {});
      } catch (_) {
      }
    }

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (peerLockIntervalRef.current) {
        clearInterval(peerLockIntervalRef.current);
        peerLockIntervalRef.current = null;
      }
      if (ackFlushTimeoutRef.current) {
        clearTimeout(ackFlushTimeoutRef.current);
        ackFlushTimeoutRef.current = null;
      }
      ackQueueRef.current.clear();
      window.removeEventListener('storage', onStorage);
      try {
        const cur = lockRead();
        if (cur && cur.token === token) localStorage.removeItem(lockKey);
      } catch (_) {
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
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      // Release Web Lock
      if (webLockAbort) {
        try { webLockAbort.abort(); } catch (_) {}
      }
      if (net && typeof net.removeEventListener === 'function') {
        net.removeEventListener('change', onNetChange);
      }
      const curPeer = peerRef.current;
      if (curPeer) {
        try {
          curPeer.off('open', onOpen);
          curPeer.off('disconnected', onDisconnected);
          curPeer.off('close', onClose);
          curPeer.off('error', onError);
          curPeer.off('connection', onConnection);
          curPeer.off('call', onCall);
        } catch (_) {
        }
      }
      endCall();
      try {
        for (const c of connsRef.current.values()) c.close();
      } catch (_) {
      }
      connsRef.current.clear();
      seenMsgIdsRef.current = new Set();
      if (curPeer) {
        try {
          curPeer.destroy();
        } catch (_) {
        }
      }
      peerRef.current = null;
    };
  }, [answerIncoming, attachConn, desiredPeerId, enabled, endCall, ensureHeartbeat, ensureRingtone, reconnectNow, stopCallMedia, updateCallState]);

  const [profilesByPeer, setProfilesByPeer] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem('orbits_profiles_v1'), {});
    return stored && typeof stored === 'object' ? stored : {};
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = safeJsonParse(localStorage.getItem('orbits_profiles_v1'), {});
      if (!stored || typeof stored !== 'object') return;
      const pids = Object.keys(stored);
      for (const pid of pids) {
        if (!active) break;
        try {
          const av = await getAvatar(pid);
          if (av && active) {
            setProfilesByPeer((prev) => {
              if (!prev[pid]) return prev;
              return { ...prev, [pid]: { ...prev[pid], avatarDataUrl: av } };
            });
          }
        } catch (_) {}
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Don't overwrite saved contacts with an empty list (e.g. during logout/disable)
    if (!peers.length) return;
    const toSave = peers.map((p) => ({ id: p.id, lastSeenAt: p.lastSeenAt || 0 }));
    localStorage.setItem(STORAGE.knownPeers, JSON.stringify(toSave));
  }, [peers]);


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

  const sendMessage = useCallback(async (targetId, options = {}) => {
    const normalized = normalizePeerId(targetId);
    if (!normalized) return null;
    const currentPeerId = peerIdRef.current;
    const conn = getConn(normalized, 'reliable');
    const ts = now();
    const msgId = `${currentPeerId}:${ts}:${Math.random().toString(16).slice(2)}`;

    const msgType = options.type || 'text';
    const text = msgType === 'text' ? String(options.text || '').trim() : String(options.text || '');
    if (msgType === 'text' && !text) return null;

    const sticker = options.sticker && typeof options.sticker === 'object' ? options.sticker : null;
    const replyTo = options.replyTo && typeof options.replyTo === 'object' ? options.replyTo : null;

    // Голосовое: сохраняем blob локально, в сеть отправляем base64
    let wireVoice = null;
    let uiVoice = null;
    if (msgType === 'voice' && options.voice) {
      const v = options.voice;
      try {
        if (v.blob) {
          await saveVoiceBlob(msgId, v.blob, {
            mime: v.mime || v.blob.type,
            duration: v.duration,
            waveform: v.waveform
          });
        }
        uiVoice = {
          duration: Number(v.duration) || 0,
          mime: v.mime || v.blob?.type || 'audio/webm',
          waveform: Array.isArray(v.waveform) ? v.waveform : []
        };
        if (v.blob) {
          const b64 = await blobToBase64(v.blob);
          wireVoice = { ...uiVoice, b64 };
        }
      } catch (_) {
      }
    }

    const delivery = conn?.open ? 'sent' : 'queued';
    const uiMsg = {
      id: msgId,
      from: currentPeerId,
      to: normalized,
      text,
      ts,
      delivery,
      type: msgType,
      sticker,
      replyTo,
      voice: uiVoice
    };
    pushMessage(normalized, uiMsg);

    void saveMessage({
      id: msgId,
      peerId: normalized,
      timestamp: ts,
      direction: 'out',
      status: conn?.open ? 'sent' : 'pending',
      payload: {
        id: msgId,
        from: currentPeerId,
        to: normalized,
        text,
        ts,
        type: msgType,
        sticker,
        replyTo,
        voice: uiVoice
      }
    });

    if (!conn || !conn.open) {
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: [...list, uiMsg].slice(-800) };
      });
      return msgId;
    }

    try {
      conn.send({
        type: 'msg',
        id: msgId,
        text,
        ts,
        from: currentPeerId,
        msgType,
        sticker,
        replyTo,
        voice: wireVoice
      });
      updateMessage(normalized, msgId, { delivery: 'sent' });
    } catch (_) {
      updateMessage(normalized, msgId, { delivery: 'queued' });
      void updateMessageStatus(msgId, 'pending');
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: [...list, { ...uiMsg, delivery: 'queued' }].slice(-800) };
      });
    }
    return msgId;
  }, [getConn, pushMessage, updateMessage]);

  const sendText = useCallback((targetId, text, extra = {}) => {
    return sendMessage(targetId, { type: 'text', text, replyTo: extra.replyTo || null });
  }, [sendMessage]);

  const sendSticker = useCallback((targetId, sticker, extra = {}) => {
    return sendMessage(targetId, { type: 'sticker', sticker, replyTo: extra.replyTo || null });
  }, [sendMessage]);

  const sendVoice = useCallback((targetId, voice, extra = {}) => {
    return sendMessage(targetId, { type: 'voice', voice, replyTo: extra.replyTo || null });
  }, [sendMessage]);

  const editMessage = useCallback(async (targetId, msgId, newText) => {
    const normalized = normalizePeerId(targetId);
    const id = String(msgId || '');
    const text = String(newText || '').trim();
    if (!normalized || !id || !text) return false;
    const editedAt = now();
    updateMessage(normalized, id, { text, editedAt });
    try {
      const row = await getMessageById(id);
      if (row) {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
        await dbUpdateMessagePayload(id, {
          payload: { ...payload, text, editedAt }
        });
      }
    } catch (_) {
    }
    const conn = getConn(normalized, 'reliable');
    if (conn?.open) {
      try {
        conn.send({ type: 'edit', id, text, editedAt });
      } catch (_) {
      }
    }
    return true;
  }, [getConn, updateMessage]);

  const deleteMessage = useCallback(async (targetId, msgId, forEveryone = false) => {
    const normalized = normalizePeerId(targetId);
    const id = String(msgId || '');
    if (!normalized || !id) return false;

    // Удаляем у себя — полностью без следа (Telegram-style)
    setMessagesByPeer((prev) => {
      const list = prev[normalized] || [];
      const next = list.filter((m) => m.id !== id);
      if (next.length === list.length) return prev;
      return { ...prev, [normalized]: next };
    });
    void deleteMessageRow(id);
    void deleteVoiceBlob(id).catch(() => {});

    if (forEveryone) {
      const conn = getConn(normalized, 'reliable');
      if (conn?.open) {
        try {
          conn.send({ type: 'delete', id, forEveryone: true, deletedAt: now() });
        } catch (_) {
        }
      }
    }
    return true;
  }, [getConn]);

  const flushAllOutbox = useCallback(() => {
    const ids = peers.map((p) => p.id);
    for (const remoteId of ids) {
      void flushOutboxForPeer(remoteId);
    }
  }, [flushOutboxForPeer]);

  const loadMoreMessages = useCallback(async (remoteId, beforeTimestamp) => {
    const pid = normalizePeerId(remoteId);
    const before = Number(beforeTimestamp);
    if (!pid || !Number.isFinite(before) || before <= 0) return 0;
    let rows = [];
    try {
      rows = await getMessages(pid, 50, before);
    } catch (_) {
      return 0;
    }
    if (!rows.length) return 0;

    const parsed = rows
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
        return {
          id: r.id,
          from: payload.from,
          to: payload.to,
          text: payload.text,
          ts: payload.ts,
          delivery,
          type: payload.type || 'text',
          sticker: payload.sticker || null,
          replyTo: payload.replyTo || null,
          voice: payload.voice || null,
          editedAt: payload.editedAt || null
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));

    let added = 0;
    setMessagesByPeer((prev) => {
      const existing = prev[pid] || [];
      const existingIds = new Set(existing.map((m) => m.id));
      const next = [];
      for (const m of parsed) {
        if (existingIds.has(m.id)) continue;
        next.push(m);
      }
      added = next.length;
      if (!added) return prev;
      return { ...prev, [pid]: [...next, ...existing].slice(-800) };
    });
    return added;
  }, []);

  const pruneOldMessages = useCallback(async (days) => {
    const d = Number(days);
    if (!Number.isFinite(d) || d <= 0) return 0;
    const cutoff = Date.now() - d * 24 * 60 * 60 * 1000;
    let deleted = 0;
    try {
      deleted = await deleteMessagesOlderThan(cutoff);
    } catch (_) {
      return 0;
    }
    if (deleted) {
      setMessagesByPeer((prev) => {
        const next = {};
        for (const [pid, list] of Object.entries(prev)) {
          next[pid] = (list || []).filter((m) => (m?.ts || 0) >= cutoff);
        }
        return next;
      });
    }
    return deleted;
  }, []);

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

  const blockPeer = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    if (!normalized) return;
    setBlockedPeers((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized];
      localStorage.setItem('orbits_blocked_peers', JSON.stringify(next));
      return next;
    });
    const conn = getConn(normalized, 'reliable');
    if (conn) try { conn.close(); } catch (_) {}
    const eph = getConn(normalized, 'ephemeral');
    if (eph) try { eph.close(); } catch (_) {}
    connsRef.current.delete(connKey(normalized, 'reliable'));
    connsRef.current.delete(connKey(normalized, 'ephemeral'));
    upsertPeer(normalized, { status: 'offline' });
  }, [connKey, getConn, upsertPeer]);

  const unblockPeer = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    if (!normalized) return;
    setBlockedPeers((prev) => {
      const next = prev.filter((id) => id !== normalized);
      localStorage.setItem('orbits_blocked_peers', JSON.stringify(next));
      return next;
    });
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
      state: callState,
      localVideoRef,
      remoteVideoRef,
      startCall,
      accept: acceptCall,
      reject: rejectCall,
      end: endCall,
      toggleAudio,
      toggleVideo,
      switchCamera,
      toggleScreenShare,
      startScreenShare,
      stopScreenShare
    },
    reconnectNow
  };
}
