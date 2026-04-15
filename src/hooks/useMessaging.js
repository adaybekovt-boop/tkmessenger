// useMessaging — owns the per-peer message state and the user-facing send /
// edit / delete / history API.
//
// Split out of usePeer so the transport hook only has to care about peer
// lifecycle and connection plumbing, while this hook handles everything
// related to what the user actually sees in a chat.
//
// Dependencies injected from the caller (usePeer):
//   - peerIdRef      — ref holding the current local peer id
//   - getConn        — (remoteId, channel) => PeerJS connection | null
//   - sendEncrypted  — (remoteId, payload) => Promise<boolean>
//   - upsertPeer     — keeps the contact list fresh on activity
//
// The hook owns three pieces of React state: `messagesByPeer`, `outboxByPeer`,
// `typingByPeer`, plus all the setters and helpers needed by the inbound
// message dispatcher (which still lives in usePeer because it is tightly
// coupled to connection attach).

import { useCallback, useState } from 'react';
import {
  clearAllMessages,
  clearPendingMessages,
  deleteMessagesOlderThan,
  getMessageById,
  getMessages,
  getPendingMessages,
  saveMessage,
  updateMessage as dbUpdateMessagePayload,
  updateMessageStatus,
  updateMessageStatusesBatch,
  deleteMessageRow,
  saveVoiceBlob,
  deleteVoiceBlob
} from '../core/db.js';
import { blobToBase64 } from '../core/audioRecorder.js';
import { STORAGE, normalizePeerId, now } from '../peer/helpers.js';
import { rowsToSortedUiMessages } from '../messaging/messageMapper.js';
import { pendingRowsToOutbox } from '../messaging/outboxMapper.js';

export function useMessaging({ peerIdRef, getConn, sendEncrypted, sendEncryptedEphemeral, upsertPeer }) {
  const [messagesByPeer, setMessagesByPeer] = useState({});
  const [outboxByPeer, setOutboxByPeer] = useState({});
  const [typingByPeer, setTypingByPeer] = useState({});

  // Batched ack persistence. Keeps React renders cheap when a peer sends a
  // burst of messages.
  const [ackQueue] = useState(() => ({ map: new Map(), timer: null }));
  const queueAckStatus = useCallback((id, status) => {
    const msgId = String(id || '');
    if (!msgId) return;
    ackQueue.map.set(msgId, String(status || 'delivered'));
    if (ackQueue.timer) return;
    ackQueue.timer = setTimeout(async () => {
      ackQueue.timer = null;
      const batch = Array.from(ackQueue.map.entries());
      ackQueue.map.clear();
      const deliveredIds = batch.filter(([, st]) => st === 'delivered').map(([mid]) => mid);
      const sentIds = batch.filter(([, st]) => st === 'sent').map(([mid]) => mid);
      try {
        if (deliveredIds.length) await updateMessageStatusesBatch(deliveredIds, 'delivered');
        if (sentIds.length) await updateMessageStatusesBatch(sentIds, 'sent');
      } catch (_) {
      }
    }, 450);
  }, [ackQueue]);

  const pushMessage = useCallback((remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    setMessagesByPeer((prev) => {
      const list = prev[normalized] || [];
      return { ...prev, [normalized]: [...list, msg].slice(-500) };
    });
    if (typeof upsertPeer === 'function') {
      upsertPeer(normalized, { lastSeenAt: now() });
    }
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

  const applyTyping = useCallback((remoteId, isTyping) => {
    const normalized = normalizePeerId(remoteId);
    setTypingByPeer((prev) => {
      const next = { ...prev };
      if (isTyping) next[normalized] = true;
      else delete next[normalized];
      return next;
    });
  }, []);

  const sendTyping = useCallback((remoteId, isTyping) => {
    const normalized = normalizePeerId(remoteId);
    void sendEncryptedEphemeral(normalized, { type: 'typing', isTyping: !!isTyping, ts: now() });
  }, [sendEncryptedEphemeral]);

  const loadPendingForPeer = useCallback(async (remoteId) => {
    const normalized = normalizePeerId(remoteId);
    try {
      const rows = await getPendingMessages(normalized, 400);
      const list = pendingRowsToOutbox(rows);
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
      const ok = await sendEncrypted(normalized, {
        type: 'msg',
        id: r.id,
        text: p.text,
        ts: p.ts,
        from: p.from
      });
      if (!ok) break;
      sentIds.push(r.id);
      await updateMessageStatus(r.id, 'sent');
      updateMessage(normalized, r.id, { delivery: 'sent' });
    }

    if (sentIds.length) {
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: list.filter((m) => !sentIds.includes(m.id)) };
      });
    }
  }, [getConn, sendEncrypted, updateMessage]);

  const flushAllOutbox = useCallback((peerIds) => {
    const ids = Array.isArray(peerIds) ? peerIds : [];
    for (const remoteId of ids) {
      void flushOutboxForPeer(remoteId);
    }
  }, [flushOutboxForPeer]);

  const sendMessage = useCallback(async (targetId, options = {}) => {
    const normalized = normalizePeerId(targetId);
    if (!normalized) return null;
    const currentPeerId = peerIdRef.current;
    const conn = getConn(normalized, 'reliable');
    const ts = now();
    // Use crypto.randomUUID for collision-resistant IDs. Math.random has
    // poor resolution on mobile and can collide on rapid sends.
    const rnd = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    const msgId = `${currentPeerId}:${ts}:${rnd}`;

    const msgType = options.type || 'text';
    const text = msgType === 'text' ? String(options.text || '').trim() : String(options.text || '');
    if (msgType === 'text' && !text) return null;

    const sticker = options.sticker && typeof options.sticker === 'object' ? options.sticker : null;
    const replyTo = options.replyTo && typeof options.replyTo === 'object' ? options.replyTo : null;

    // Voice: persist the blob locally and ship base64 over the wire.
    let wireVoice = null;
    let uiVoice = null;
    if (msgType === 'voice' && options.voice) {
      const v = options.voice;
      try {
        let blobSaved = false;
        if (v.blob) {
          await saveVoiceBlob(msgId, v.blob, {
            mime: v.mime || v.blob.type,
            duration: v.duration,
            waveform: v.waveform
          });
          blobSaved = true;
        }
        // Only populate uiVoice if the blob was saved successfully,
        // otherwise the recipient will see a broken voice player.
        if (blobSaved || !v.blob) {
          uiVoice = {
            duration: Number(v.duration) || 0,
            mime: v.mime || v.blob?.type || 'audio/webm',
            waveform: Array.isArray(v.waveform) ? v.waveform : []
          };
        }
        if (v.blob && blobSaved) {
          const b64 = await blobToBase64(v.blob);
          wireVoice = { ...uiVoice, b64 };
        }
      } catch (_) {
        // Voice blob save failed — send as text-only message instead of
        // showing a broken voice player to the recipient.
        uiVoice = null;
        wireVoice = null;
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

    const ok = await sendEncrypted(normalized, {
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
    if (ok) {
      updateMessage(normalized, msgId, { delivery: 'sent' });
    } else {
      updateMessage(normalized, msgId, { delivery: 'queued' });
      void updateMessageStatus(msgId, 'pending');
      setOutboxByPeer((prev) => {
        const list = prev[normalized] || [];
        return { ...prev, [normalized]: [...list, { ...uiMsg, delivery: 'queued' }].slice(-800) };
      });
    }
    return msgId;
  }, [getConn, peerIdRef, pushMessage, sendEncrypted, updateMessage]);

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
        await dbUpdateMessagePayload(id, { payload: { ...payload, text, editedAt } });
      }
    } catch (_) {
    }
    void sendEncrypted(normalized, { type: 'edit', id, text, editedAt });
    return true;
  }, [sendEncrypted, updateMessage]);

  const deleteMessage = useCallback(async (targetId, msgId, forEveryone = false) => {
    const normalized = normalizePeerId(targetId);
    const id = String(msgId || '');
    if (!normalized || !id) return false;

    setMessagesByPeer((prev) => {
      const list = prev[normalized] || [];
      const next = list.filter((m) => m.id !== id);
      if (next.length === list.length) return prev;
      return { ...prev, [normalized]: next };
    });
    void deleteMessageRow(id);
    void deleteVoiceBlob(id).catch(() => {});

    if (forEveryone) {
      void sendEncrypted(normalized, { type: 'delete', id, forEveryone: true, deletedAt: now() });
    }
    return true;
  }, [sendEncrypted]);

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

    const parsed = rowsToSortedUiMessages(rows);
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
    try { localStorage.removeItem(STORAGE.messages); } catch (_) {}
    void clearAllMessages();
  }, []);

  const clearOutbox = useCallback(async () => {
    try { await clearPendingMessages(null); } catch (_) {}
    setOutboxByPeer({});
  }, []);

  const resetAll = useCallback(() => {
    setMessagesByPeer({});
    setOutboxByPeer({});
    setTypingByPeer({});
  }, []);

  return {
    messagesByPeer,
    setMessagesByPeer,
    outboxByPeer,
    setOutboxByPeer,
    typingByPeer,
    setTypingByPeer,
    pushMessage,
    updateMessage,
    applyTyping,
    sendTyping,
    queueAckStatus,
    loadPendingForPeer,
    flushOutboxForPeer,
    flushAllOutbox,
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
    resetAll
  };
}
