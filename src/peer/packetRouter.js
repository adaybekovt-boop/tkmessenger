// Packet router — middleware chain for inbound data on PeerJS connections.
//
// Each middleware receives (remoteId, data, ctx) and returns true if it
// consumed the packet. The chain stops at the first handler that returns true.
//
// This replaces the nested if/switch inside useConnections.attachConn.onData.

import {
  isWireCiphertext,
  decryptWirePayload,
} from '../core/wireCrypto.js';
import {
  dispatchEphemeralInbound,
  dispatchReliableInbound,
} from '../messaging/messageProtocol.js';
import { hapticMessage } from '../core/haptics.js';
import { playSound } from '../core/sounds.js';
import { notifyNewMessage } from '../core/notifications.js';
import {
  getMessageById,
  saveMessage,
  updateMessage as dbUpdateMessagePayload,
  deleteMessageRow,
  saveVoiceBlob,
  deleteVoiceBlob,
  saveAvatar,
} from '../core/db.js';

// ─── Drop middleware ────────────────────────────────────────────

const DROP_TYPES = new Set([
  'drop-beacon', 'drop-beacon-ack', 'drop-req', 'drop-ack',
  'drop-rej', 'drop-cancel', 'file-start', 'file-chunk',
  'file-end', 'drop-resume',
]);

function isDropPacket(data) {
  return data && typeof data === 'object' && typeof data.type === 'string'
    && DROP_TYPES.has(data.type);
}

/**
 * Routes drop/file-transfer packets to DropManager.
 * Works on both ephemeral and reliable channels.
 */
export function dropMiddleware(remoteId, data, ctx) {
  if (!isDropPacket(data)) return false;
  ctx.dropHandlePacket?.(remoteId, data);
  return true;
}

// ─── Ephemeral channel middleware ────────────────────────────────

/**
 * Decrypts (if needed) and dispatches ephemeral-channel traffic
 * (typing indicators, heartbeats).
 */
export async function ephemeralMiddleware(remoteId, rawData, ctx) {
  let payload = rawData;

  if (isWireCiphertext(rawData)) {
    try { payload = await decryptWirePayload(remoteId, rawData); }
    catch (_) { return true; } // bad ciphertext — swallow
  } else if (typeof rawData === 'string') {
    return true; // ignore stray strings
  }

  if (!payload || typeof payload !== 'object') return true;

  // Drop packets on ephemeral channel
  if (isDropPacket(payload)) {
    ctx.dropHandlePacket?.(remoteId, payload);
    return true;
  }

  dispatchEphemeralInbound(payload, remoteId, {
    applyTyping: (isTyping) => ctx.applyTypingWithTimeout(remoteId, isTyping),
    onHeartbeat: () => ctx.onHeartbeat(remoteId),
  });
  return true;
}

// ─── Reliable channel middleware ────────────────────────────────

/**
 * Dispatches reliable-channel traffic (chat messages, wire handshake,
 * profile exchange, acks, etc).
 */
export async function reliableMiddleware(remoteId, data, ctx) {
  const handled = await dispatchReliableInbound(data, ctx.conn, remoteId, {
    localProfileRef: ctx.localProfileRef,
    peerIdRef: ctx.peerIdRef,
    seenMsgIdsRef: ctx.seenMsgIdsRef,
    setProfilesByPeer: ctx.setProfilesByPeer,
    saveAvatar,
    updateMessage: ctx.updateMessage,
    queueAckStatus: ctx.queueAckStatus,
    pushMessage: ctx.pushMessage,
    saveMessage,
    saveVoiceBlob,
    getMessageById,
    deleteMessageRow,
    deleteVoiceBlob,
    dbUpdateMessagePayload,
    setMessagesByPeer: ctx.setMessagesByPeer,
    notifyNewMessage,
    hapticMessage: () => {
      try {
        const raw = localStorage.getItem('orbits_chat_prefs_v1');
        const prefs = raw ? JSON.parse(raw) : {};
        if (prefs.vibration === false) return;
      } catch (_) {}
      hapticMessage();
    },
    playReceiveSound: () => playSound('receive'),
    sendEncrypted: (msg) => { void ctx.sendEncrypted(remoteId, msg); },
    onHandshakeError: (err) => { try { console.warn('[wire] handshake error', err); } catch (_) {} },
    onDecryptError: (err) => { try { console.warn('[wire] decrypt error', err); } catch (_) {} },
    onUnexpectedPlaintext: (d) => { try { console.warn('[wire] dropped unencrypted payload', d?.type || typeof d); } catch (_) {} },
  });

  if (handled) ctx.flushOutboxForPeer(remoteId);
  return true;
}

// ─── Chain runner ───────────────────────────────────────────────

/**
 * Build a packet handler for a given channel type.
 *
 * @param {'ephemeral'|'reliable'} channel
 * @param {string} remoteId
 * @param {object} ctx — handlers and refs from useConnections
 * @returns {(data: any) => Promise<void>}
 */
export function createPacketHandler(channel, remoteId, ctx) {
  if (channel === 'ephemeral') {
    return async (data) => {
      await ephemeralMiddleware(remoteId, data, ctx);
    };
  }

  // Reliable channel: drop packets first, then chat/wire traffic.
  const chain = [dropMiddleware, reliableMiddleware];

  return async (data) => {
    for (const mw of chain) {
      const consumed = await mw(remoteId, data, ctx);
      if (consumed) return;
    }
  };
}
