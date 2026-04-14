// useConnections — owns the connection map, attach logic (with glare
// resolution), and ephemeral channel opening. Extracted from usePeer.
//
// The `attachConn` function is the largest single unit in the peer hook.
// It has many dependencies that are injected via the `handlers` object
// so the caller (usePeer) remains the composition root.

import { useCallback, useRef } from 'react';
import {
  normalizePeerId,
  isValidPeerId,
  connKey as buildConnKey,
  now
} from '../peer/helpers.js';
import {
  decryptWirePayload,
  isWireCiphertext
} from '../core/wireCrypto.js';
import {
  dispatchEphemeralInbound,
  dispatchReliableInbound
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
  saveAvatar
} from '../core/db.js';

/**
 * @param {object} deps — stable refs and state setters from usePeer
 * @param {object} deps.peerRef
 * @param {object} deps.peerIdRef
 * @param {object} deps.selectedPeerIdRef
 * @param {object} deps.localProfileRef
 * @param {object} deps.seenMsgIdsRef
 * @param {Function} deps.setSelectedPeerId
 * @param {object} handlersRef — ref whose `.current` holds callbacks from sub-hooks.
 *   Populated by the caller after all sub-hooks are initialized (breaks the
 *   circular dependency: connections ↔ messaging ↔ wire).
 */
export function useConnections({ peerRef, peerIdRef, selectedPeerIdRef, localProfileRef, seenMsgIdsRef, setSelectedPeerId }, handlersRef) {
  const connsRef = useRef(new Map());

  const connKey = useCallback((remoteId, channel) => buildConnKey(remoteId, channel), []);

  const getConn = useCallback((remoteId, channel) => {
    return connsRef.current.get(buildConnKey(remoteId, channel)) || null;
  }, []);

  const attachConn = useCallback((conn, channel) => {
    const {
      upsertPeer,
      setProfilesByPeer,
      // Wire
      initiateHandshakeOnOpen,
      sendEncrypted,
      // Messaging
      pushMessage,
      updateMessage,
      queueAckStatus,
      setMessagesByPeer,
      loadPendingForPeer,
      flushOutboxForPeer,
      // Heartbeat
      ensureHeartbeat,
      stopHeartbeatIfIdle,
      lastHeartbeatByPeerRef,
      // Typing
      applyTypingWithTimeout,
      // Drop
      dropHandlePacketRef
    } = handlersRef.current;

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

    // Timeout: if the reliable connection doesn't open within 15s, mark peer offline.
    let connectTimer = null;
    if (ch === 'reliable') {
      connectTimer = setTimeout(() => {
        const current = connsRef.current.get(key);
        if (current === conn && !conn.open) {
          try { conn.close(); } catch (_) {}
          connsRef.current.delete(key);
          upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
          const ephKey = connKey(remoteId, 'ephemeral');
          const ephConn = connsRef.current.get(ephKey);
          if (ephConn && !ephConn.open) {
            try { ephConn.close(); } catch (_) {}
            connsRef.current.delete(ephKey);
          }
        }
      }, 15000);
    }

    const onOpen = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (ch === 'reliable') {
        upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
        // Telegram-style: always show chat list first; don't auto-select.
        // Wire handshake before any app-level traffic.
        void (async () => {
          await initiateHandshakeOnOpen(conn, remoteId);
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
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      const current = connsRef.current.get(key);
      if (current === conn) connsRef.current.delete(key);
      if (ch === 'reliable') upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
      else stopHeartbeatIfIdle();
    };
    const onError = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (ch === 'reliable') upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
    };

    const onData = async (data) => {
      if (ch === 'ephemeral') {
        // Decrypt ciphertext if the peer is sending encrypted ephemeral traffic.
        // Legacy plaintext objects are still accepted for backward compatibility
        // with peers that haven't upgraded yet.
        let payload = data;
        if (isWireCiphertext(data)) {
          try { payload = await decryptWirePayload(remoteId, data); }
          catch (_) { return; }
        } else if (typeof data === 'string') { return; }
        if (!payload || typeof payload !== 'object') return;

        // Drop-feature packets ride the ephemeral channel.
        // Matches both drop-* control packets and file-* transfer packets.
        if (typeof payload.type === 'string') {
          const pt = payload.type;
          if (pt.startsWith('drop-') || pt === 'file-start' || pt === 'file-chunk' || pt === 'file-end') {
            dropHandlePacketRef.current?.(remoteId, payload);
            return;
          }
        }
        dispatchEphemeralInbound(payload, remoteId, {
          applyTyping: (isTyping) => applyTypingWithTimeout(remoteId, isTyping),
          onHeartbeat: () => {
            lastHeartbeatByPeerRef.current.set(remoteId, now());
            upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
          }
        });
        return;
      }
      // ── Route file-transfer packets to DropManager ──────────
      // OrbitsDrop.sendFile() sends file-start / file-chunk / file-end
      // as plain (unencrypted) objects on the *reliable* DataConnection.
      // dispatchReliableInbound only handles chat/wire traffic and would
      // silently drop these. Intercept them here and forward to the drop
      // handler, exactly like we do for drop-* packets on ephemeral.
      if (data && typeof data === 'object' && typeof data.type === 'string') {
        const dt = data.type;
        if (dt === 'file-start' || dt === 'file-chunk' || dt === 'file-end' || dt === 'drop-resume') {
          dropHandlePacketRef.current?.(remoteId, data);
          return;
        }
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
        hapticMessage: () => {
          try {
            const raw = localStorage.getItem('orbits_chat_prefs_v1');
            const prefs = raw ? JSON.parse(raw) : {};
            if (prefs.vibration === false) return;
          } catch (_) {}
          hapticMessage();
        },
        playReceiveSound: () => playSound('receive'),
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
  }, [connKey, handlersRef, peerIdRef, selectedPeerIdRef, localProfileRef, seenMsgIdsRef, setSelectedPeerId]);

  const openEphemeral = useCallback((targetId) => {
    const normalized = normalizePeerId(targetId);
    if (!normalized || !isValidPeerId(normalized)) return;
    const p = peerRef.current;
    if (!p || p.destroyed || p.disconnected) return;
    if (normalized === peerIdRef.current) return;

    const existing = connsRef.current.get(buildConnKey(normalized, 'ephemeral'));
    if (existing && existing.open) return;

    const conn = p.connect(normalized, {
      reliable: false,
      label: 'ephemeral',
      metadata: { channel: 'ephemeral', initiator: true }
    });
    attachConn(conn, 'ephemeral');
  }, [attachConn, peerIdRef, peerRef]);

  return { connsRef, connKey, getConn, attachConn, openEphemeral };
}
