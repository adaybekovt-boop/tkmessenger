import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer from 'peerjs';

/* eslint-disable react-hooks/exhaustive-deps */

function normalizePeerId(input) {
  return String(input || '').trim().toUpperCase();
}

function isValidPeerId(input) {
  const s = normalizePeerId(input);
  return /^[A-Z0-9_-]{3,64}$/.test(s);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

const STORAGE = {
  peerId: 'orbits_peer_id',
  knownPeers: 'orbits_known_peers',
  messages: 'orbits_messages_v1',
  outbox: 'orbits_outbox_v1'
};

function now() {
  return Date.now();
}

export function usePeer({ enabled = true, desiredPeerId = '', localProfile = null } = {}) {
  const peerRef = useRef(null);
  const connsRef = useRef(new Map());
  const outboxRef = useRef({});
  const peerIdRef = useRef('');
  const selectedPeerIdRef = useRef('');
  const localProfileRef = useRef(localProfile);

  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('инициализация');
  const [error, setError] = useState(null);

  const [peers, setPeers] = useState([]);
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [messagesByPeer, setMessagesByPeer] = useState({});

  const [outboxByPeer, setOutboxByPeer] = useState({});

  // Keep refs in sync with state
  useEffect(() => { peerIdRef.current = peerId; }, [peerId]);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);
  useEffect(() => { localProfileRef.current = localProfile; }, [localProfile]);

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

  const persistOutbox = useCallback((next) => {
    outboxRef.current = next;
    try {
      localStorage.setItem(STORAGE.outbox, JSON.stringify(next));
    } catch (_) {
    }
  }, []);

  const queueOutbox = useCallback((remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    setOutboxByPeer((prev) => {
      const list = prev[normalized] || [];
      const next = { ...prev, [normalized]: [...list, msg].slice(-800) };
      persistOutbox(next);
      return next;
    });
  }, [persistOutbox]);

  const removeOutboxItems = useCallback((remoteId, ids) => {
    const normalized = normalizePeerId(remoteId);
    setOutboxByPeer((prev) => {
      const list = prev[normalized] || [];
      const nextList = list.filter((m) => !ids.includes(m.id));
      const next = { ...prev, [normalized]: nextList };
      persistOutbox(next);
      return next;
    });
  }, [persistOutbox]);

  const flushOutboxForPeer = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    const conn = connsRef.current.get(normalized);
    if (!conn || !conn.open) return;
    const queue = outboxRef.current[normalized] || [];
    if (!queue.length) return;

    const sentIds = [];
    for (const m of queue) {
      try {
        conn.send({ type: 'text', text: m.text, ts: m.ts, from: m.from });
        sentIds.push(m.id);
        updateMessage(normalized, m.id, { delivery: 'sent' });
      } catch (_) {
        break;
      }
    }
    if (sentIds.length) removeOutboxItems(normalized, sentIds);
  }, [removeOutboxItems, updateMessage]);

  const attachConn = useCallback((conn) => {
    const remoteId = normalizePeerId(conn.peer);
    connsRef.current.set(remoteId, conn);
    upsertPeer(remoteId, { status: 'connecting', lastSeenAt: now() });

    const onOpen = () => {
      upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
      if (!selectedPeerIdRef.current) setSelectedPeerId(remoteId);
      flushOutboxForPeer(remoteId);
      try {
        conn.send({ type: 'profile_req', nonce: Date.now() });
      } catch (_) {
      }
    };
    const onClose = () => {
      connsRef.current.delete(remoteId);
      upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
    };
    const onError = () => {
      upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
    };
    const onData = (data) => {
      if (!data || typeof data !== 'object') return;
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
      if (data.type !== 'text') return;
      const text = typeof data.text === 'string' ? data.text : '';
      const ts = typeof data.ts === 'number' ? data.ts : now();
      pushMessage(remoteId, { id: `${remoteId}:${ts}:${Math.random().toString(16).slice(2)}`, from: remoteId, to: peerIdRef.current, text, ts, delivery: 'received' });
    };

    conn.on('open', onOpen);
    conn.on('close', onClose);
    conn.on('error', onError);
    conn.on('data', onData);
  }, [flushOutboxForPeer, pushMessage, upsertPeer]);

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
      setStatus('выключен');
      setPeerId('');
      return;
    }
    const desiredId = normalizePeerId(desiredPeerId);

    setStatus('подключение');
    setError(null);

    const peer = new Peer(desiredId || undefined);
    peerRef.current = peer;

    const onOpen = (id) => {
      const normalized = normalizePeerId(id);
      setPeerId(normalized);
      try {
        localStorage.setItem(STORAGE.peerId, normalized);
      } catch (_) {
      }
      setStatus('онлайн');

      const savedPeers = safeJsonParse(localStorage.getItem(STORAGE.knownPeers), []);
      if (Array.isArray(savedPeers) && savedPeers.length) {
        setPeers(savedPeers.map((p) => ({ id: normalizePeerId(p.id), status: 'offline', lastSeenAt: Number(p.lastSeenAt || 0) || 0 })));
      }

      const savedMessages = safeJsonParse(localStorage.getItem(STORAGE.messages), {});
      if (savedMessages && typeof savedMessages === 'object') {
        setMessagesByPeer(savedMessages);
      }
      const savedOutbox = safeJsonParse(localStorage.getItem(STORAGE.outbox), {});
      if (savedOutbox && typeof savedOutbox === 'object') {
        outboxRef.current = savedOutbox;
        setOutboxByPeer(savedOutbox);
      }
    };
    const onDisconnected = () => {
      setStatus('офлайн');
    };
    const onClose = () => {
      setStatus('закрыт');
    };
    const onError = (err) => {
      setError(err?.type ? String(err.type) : 'ошибка');
      if (err?.type === 'unavailable-id') {
        try {
          localStorage.removeItem(STORAGE.peerId);
        } catch (_) {
        }
      }
    };
    const onConnection = (conn) => {
      attachConn(conn);
    };

    peer.on('open', onOpen);
    peer.on('disconnected', onDisconnected);
    peer.on('close', onClose);
    peer.on('error', onError);
    peer.on('connection', onConnection);

    return () => {
      try {
        peer.off('open', onOpen);
        peer.off('disconnected', onDisconnected);
        peer.off('close', onClose);
        peer.off('error', onError);
        peer.off('connection', onConnection);
      } catch (_) {
      }
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
  }, [enabled, desiredPeerId, attachConn]);

  const [profilesByPeer, setProfilesByPeer] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem('orbits_profiles_v1'), {});
    return stored && typeof stored === 'object' ? stored : {};
  });

  useEffect(() => {
    const toSave = peers.map((p) => ({ id: p.id, lastSeenAt: p.lastSeenAt || 0 }));
    localStorage.setItem(STORAGE.knownPeers, JSON.stringify(toSave));
  }, [peers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.messages, JSON.stringify(messagesByPeer));
    } catch (_) {
    }
  }, [messagesByPeer]);

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
    const existing = connsRef.current.get(normalized);
    if (existing && existing.open) {
      setSelectedPeerId(normalized);
      return;
    }
    upsertPeer(normalized, { status: 'connecting', lastSeenAt: now() });
    const conn = peerRef.current.connect(normalized, { reliable: true });
    attachConn(conn);
    setSelectedPeerId(normalized);
  }, [attachConn, upsertPeer]);

  const requestRemoteProfile = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    const conn = connsRef.current.get(normalized);
    if (!conn || !conn.open) return;
    conn.send({ type: 'profile_req', nonce: Date.now() });
  }, []);

  const sendText = useCallback((targetId, text) => {
    const normalized = normalizePeerId(targetId);
    const body = String(text || '').trim();
    if (!body) return;
    const currentPeerId = peerIdRef.current;
    const conn = connsRef.current.get(normalized);
    const ts = now();
    const msgId = `${currentPeerId}:${ts}:${Math.random().toString(16).slice(2)}`;
    const msg = { id: msgId, from: currentPeerId, to: normalized, text: body, ts, delivery: conn?.open ? 'sent' : 'queued' };
    pushMessage(normalized, msg);
    if (!conn || !conn.open) {
      queueOutbox(normalized, msg);
      return;
    }
    try {
      conn.send({ type: 'text', text: body, ts, from: currentPeerId });
      updateMessage(normalized, msgId, { delivery: 'sent' });
    } catch (_) {
      updateMessage(normalized, msgId, { delivery: 'queued' });
      queueOutbox(normalized, { ...msg, delivery: 'queued' });
    }
  }, [pushMessage, queueOutbox, updateMessage]);

  const flushAllOutbox = useCallback(() => {
    const ids = Object.keys(outboxRef.current || {});
    for (const remoteId of ids) {
      flushOutboxForPeer(remoteId);
    }
  }, [flushOutboxForPeer]);

  const clearAllHistory = useCallback(() => {
    setMessagesByPeer({});
    setOutboxByPeer({});
    outboxRef.current = {};
    try {
      localStorage.removeItem(STORAGE.messages);
      localStorage.removeItem(STORAGE.outbox);
    } catch (_) {
    }
  }, []);

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
    clearAllHistory,
    profilesByPeer,
    requestRemoteProfile
  };
}
