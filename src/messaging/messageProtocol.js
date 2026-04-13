// Pure inbound message dispatcher.
// Routes data objects received on a PeerJS DataChannel to the right handler.
// Extracted from usePeer.js `attachConn.onData` (behavior-preserving).
//
// The dispatcher has no React or DOM dependencies — consumers pass a `ctx`
// object with plain callbacks and refs. Two dispatch functions are exported,
// one for the ephemeral (unreliable) channel and one for the reliable channel.

import { normalizePeerId, now, safeJsonParse, STORAGE } from '../peer/helpers.js';
import { base64ToBlob } from '../core/audioRecorder.js';
import {
  isWireCiphertext,
  decryptWirePayload,
  acceptWireHello
} from '../core/wireCrypto.js';

/**
 * Ephemeral (unreliable) channel router.
 * Handles `typing` and `hb` (heartbeat) only.
 *
 * @param {any}    data      — parsed data object from `conn.on('data')`
 * @param {string} remoteId  — normalized peer id on the other side
 * @param {object} ctx       — { applyTyping, onHeartbeat }
 */
export function dispatchEphemeralInbound(data, remoteId, ctx) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'typing') {
    ctx.applyTyping(!!data.isTyping);
    return;
  }
  if (data.type === 'hb') {
    ctx.onHeartbeat();
    return;
  }
}

/**
 * Reliable channel router. Dispatches `profile_req | profile_res | ack |
 * edit | delete | msg | text`. Returns `true` if the message was handled.
 *
 * @param {any}    data      — parsed data object from `conn.on('data')`
 * @param {object} conn      — the PeerJS DataConnection (used to send replies)
 * @param {string} remoteId  — normalized peer id on the other side
 * @param {object} ctx       — see property list below
 *
 * `ctx` properties consumed:
 *   - localProfileRef:    { current: localProfile|null }
 *   - peerIdRef:          { current: string }
 *   - seenMsgIdsRef:      { current: Set<string> }
 *   - setProfilesByPeer(updater)
 *   - saveAvatar(peerId, dataUrl)
 *   - updateMessage(remoteId, id, patch)
 *   - queueAckStatus(id, status)
 *   - pushMessage(remoteId, uiMsg)
 *   - saveMessage(row)
 *   - saveVoiceBlob(id, blob, meta)
 *   - getMessageById(id)
 *   - deleteMessageRow(id)
 *   - deleteVoiceBlob(id)
 *   - dbUpdateMessagePayload(id, patch)
 *   - setMessagesByPeer(updater)
 *   - notifyNewMessage({ from, text, tag })
 *   - hapticMessage()
 */
/**
 * Reliable channel entry point. Accepts either:
 *   - a wire ciphertext string (`v2:hdr:iv:ct`) → decrypts via the ratchet,
 *     then delegates to `dispatchReliablePlaintext`;
 *   - a plaintext control object (`wireHello`, `wireRekey`) — handshake only;
 *   - anything else → dropped.
 *
 * Returns a promise because decryption is async.
 */
export async function dispatchReliableInbound(data, conn, remoteId, ctx) {
  // Handshake control messages travel in plaintext (they carry public keys).
  if (data && typeof data === 'object' && (data.type === 'wireHello' || data.type === 'wireRekey')) {
    try {
      const { reply } = await acceptWireHello(remoteId, ctx.peerIdRef.current, data);
      if (reply) {
        try { conn.send(reply); } catch (_) {}
      }
    } catch (err) {
      ctx.onHandshakeError?.(err);
    }
    return true;
  }

  // Encrypted payload — decrypt first, then dispatch.
  if (isWireCiphertext(data)) {
    let plaintext;
    try {
      plaintext = await decryptWirePayload(remoteId, data);
    } catch (err) {
      ctx.onDecryptError?.(err);
      return false;
    }
    return dispatchReliablePlaintext(plaintext, conn, remoteId, ctx);
  }

  // Phase 2 breaks wire compat: anything else on the reliable channel is
  // dropped silently. Log once for diagnostics.
  ctx.onUnexpectedPlaintext?.(data);
  return false;
}

/**
 * Dispatches a decrypted application-level message object. This is the body
 * of the old reliable handler — it only runs on trusted, authenticated input.
 */
export function dispatchReliablePlaintext(data, conn, remoteId, ctx) {
  if (!data || typeof data !== 'object') return false;

  const sendReply = (msg) => {
    // All reply traffic on the reliable channel goes through the ratchet.
    try { ctx.sendEncrypted?.(msg); } catch (_) {}
  };

  if (data.type === 'profile_req') {
    const lp = ctx.localProfileRef.current;
    if (!lp) return true;
    const nonce = typeof data.nonce === 'number' ? data.nonce : Date.now();
    sendReply({
      type: 'profile_res',
      nonce,
      profile: {
        peerId: lp.peerId,
        displayName: lp.displayName,
        bio: lp.bio,
        avatarDataUrl: lp.avatarDataUrl || null
      }
    });
    return true;
  }

  if (data.type === 'profile_res') {
    const p = data.profile;
    if (!p || typeof p !== 'object') return true;
    const rawAvatar = typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : null;
    const safeAvatar = rawAvatar && rawAvatar.startsWith('data:image/') ? rawAvatar : null;
    if (safeAvatar) {
      try { void ctx.saveAvatar(remoteId, safeAvatar); } catch (_) {}
    }
    ctx.setProfilesByPeer((prev) => {
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
        localStorage.setItem(STORAGE.profiles, JSON.stringify(toStore));
      } catch (_) {
      }
      return next;
    });
    return true;
  }

  if (data.type === 'ack') {
    const ackId = typeof data.id === 'string' ? data.id : '';
    if (!ackId) return true;
    ctx.updateMessage(remoteId, ackId, { delivery: 'delivered' });
    ctx.queueAckStatus(ackId, 'delivered');
    return true;
  }

  if (data.type === 'edit') {
    const id = String(data.id || '');
    if (!id) return true;
    const newText = typeof data.text === 'string' ? data.text : '';
    const editedAt = Number(data.editedAt) || now();
    ctx.updateMessage(remoteId, id, { text: newText, editedAt });
    void (async () => {
      try {
        const row = await ctx.getMessageById(id);
        if (row) {
          const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
          await ctx.dbUpdateMessagePayload(id, {
            payload: { ...payload, text: newText, editedAt }
          });
        }
      } catch (_) {
      }
    })();
    return true;
  }

  if (data.type === 'delete') {
    const id = String(data.id || '');
    if (!id) return true;
    const forEveryone = !!data.forEveryone;
    if (forEveryone) {
      ctx.setMessagesByPeer((prev) => {
        const list = prev[remoteId] || [];
        const next = list.filter((m) => m.id !== id);
        if (next.length === list.length) return prev;
        return { ...prev, [remoteId]: next };
      });
      void ctx.deleteMessageRow(id);
      try { void ctx.deleteVoiceBlob(id).catch(() => {}); } catch (_) {}
    }
    return true;
  }

  const type = String(data.type || '');
  if (type !== 'msg' && type !== 'text') return false;

  const text = typeof data.text === 'string' ? data.text : '';
  const ts = typeof data.ts === 'number' ? data.ts : now();
  const from = normalizePeerId(data.from || remoteId);
  const msgId = typeof data.id === 'string' && data.id
    ? data.id
    : `${from}:${ts}:${Math.random().toString(16).slice(2)}`;
  const msgType = typeof data.msgType === 'string' ? data.msgType : 'text';
  const sticker = data.sticker && typeof data.sticker === 'object' ? data.sticker : null;
  const replyTo = data.replyTo && typeof data.replyTo === 'object' ? data.replyTo : null;
  const voiceMeta = data.voice && typeof data.voice === 'object' ? data.voice : null;

  if (ctx.seenMsgIdsRef.current.has(msgId)) {
    sendReply({ type: 'ack', id: msgId, ts: now() });
    return true;
  }
  ctx.seenMsgIdsRef.current.add(msgId);
  if (ctx.seenMsgIdsRef.current.size > 4000) {
    ctx.seenMsgIdsRef.current = new Set(Array.from(ctx.seenMsgIdsRef.current).slice(-2000));
  }

  void (async () => {
    try {
      const existing = await ctx.getMessageById(msgId);
      if (existing) {
        sendReply({ type: 'ack', id: msgId, ts: now() });
        return;
      }
    } catch (_) {
    }

    let voiceRef = null;
    if (voiceMeta && typeof voiceMeta.b64 === 'string') {
      try {
        const blob = base64ToBlob(voiceMeta.b64, voiceMeta.mime || 'audio/webm');
        await ctx.saveVoiceBlob(msgId, blob, {
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
      to: ctx.peerIdRef.current,
      text,
      ts,
      delivery: 'received',
      type: msgType,
      sticker,
      replyTo,
      voice: voiceRef
    };
    ctx.pushMessage(remoteId, uiMsg);
    void ctx.saveMessage({
      id: msgId,
      peerId: remoteId,
      timestamp: ts,
      direction: 'in',
      status: 'delivered',
      payload: {
        id: msgId,
        from: remoteId,
        to: ctx.peerIdRef.current,
        text,
        ts,
        type: msgType,
        sticker,
        replyTo,
        voice: voiceRef
      }
    });
    sendReply({ type: 'ack', id: msgId, ts: now() });

    if (typeof document !== 'undefined' && !document.hidden && typeof document.hasFocus === 'function' && document.hasFocus()) {
      try { ctx.hapticMessage(); } catch (_) {}
      try { ctx.playReceiveSound(); } catch (_) {}
    }

    const preview = msgType === 'sticker'
      ? (sticker?.emoji || '🖼 Стикер')
      : msgType === 'voice'
        ? '🎤 Голосовое'
        : text;
    try { ctx.notifyNewMessage({ from: remoteId, text: preview, tag: msgId }); } catch (_) {}
  })();

  return true;
}

// Re-export helpers used by ctx constructors upstream.
export { safeJsonParse };
