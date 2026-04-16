// useConnections — owns the connection map, attach logic (with glare
// resolution), and ephemeral channel opening.
//
// Packet routing is delegated to packetRouter.js (middleware chain)
// instead of a 200-line inline onData handler.

import { useCallback, useRef } from 'react';
import {
  normalizePeerId,
  isValidPeerId,
  connKey as buildConnKey,
  now,
} from '../peer/helpers.js';
import { createPacketHandler } from '../peer/packetRouter.js';

/**
 * @param {object} deps — stable refs and state setters from usePeer
 * @param {object} handlersRef — ref whose `.current` holds callbacks from sub-hooks.
 */
export function useConnections(
  { peerRef, peerIdRef, selectedPeerIdRef, localProfileRef, seenMsgIdsRef, setSelectedPeerId },
  handlersRef
) {
  const connsRef = useRef(new Map());

  const connKey = useCallback((remoteId, channel) => buildConnKey(remoteId, channel), []);

  const getConn = useCallback((remoteId, channel) => {
    return connsRef.current.get(buildConnKey(remoteId, channel)) || null;
  }, []);

  // ─── Glare resolution ──────────────────────────────────────────

  function resolveGlare(key, conn, myId, remoteId) {
    const initiator = !!conn?.metadata?.initiator;
    const shouldKeepInitiator = myId && myId.localeCompare(remoteId) < 0;
    const existing = connsRef.current.get(key);

    if (!existing || existing === conn) return true; // no conflict

    const existingInitiator = !!existing?.metadata?.initiator;
    const connId = String(conn.connectionId || conn.id || '');
    const existingId = String(existing.connectionId || existing.id || '');

    const preferred =
      initiator === shouldKeepInitiator && existingInitiator !== shouldKeepInitiator
        ? conn
        : existingInitiator === shouldKeepInitiator && initiator !== shouldKeepInitiator
          ? existing
          : connId && existingId
            ? connId.localeCompare(existingId) < 0 ? conn : existing
            : existing;

    const toClose = preferred === conn ? existing : conn;
    try { toClose.close(); } catch (_) {}
    return preferred === conn; // true = keep the new conn
  }

  // ─── attachConn ────────────────────────────────────────────────

  const attachConn = useCallback((conn, channel) => {
    const h = handlersRef.current;
    const remoteId = normalizePeerId(conn.peer);
    const ch = channel === 'ephemeral' ? 'ephemeral' : 'reliable';
    const key = connKey(remoteId, ch);
    const myId = String(peerIdRef.current || '');

    // Glare: decide which duplicate connection to keep
    if (!resolveGlare(key, conn, myId, remoteId)) return;

    connsRef.current.set(key, conn);
    if (ch === 'reliable') h.upsertPeer(remoteId, { status: 'connecting', lastSeenAt: now() });

    // Connection timeout (reliable only)
    let connectTimer = null;
    if (ch === 'reliable') {
      connectTimer = setTimeout(() => {
        const current = connsRef.current.get(key);
        if (current === conn && !conn.open) {
          try { conn.close(); } catch (_) {}
          connsRef.current.delete(key);
          h.upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
          const ephKey = connKey(remoteId, 'ephemeral');
          const ephConn = connsRef.current.get(ephKey);
          if (ephConn && !ephConn.open) {
            try { ephConn.close(); } catch (_) {}
            connsRef.current.delete(ephKey);
          }
        }
      }, 15000);
    }

    // ── Event handlers ──────────────────────────────────────────

    const onOpen = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (ch === 'reliable') {
        h.upsertPeer(remoteId, { status: 'online', lastSeenAt: now() });
        void (async () => {
          await h.initiateHandshakeOnOpen(conn, remoteId);
          void h.loadPendingForPeer(remoteId);
          void h.flushOutboxForPeer(remoteId);
          void h.sendEncrypted(remoteId, { type: 'profile_req', nonce: Date.now() });
        })();
      } else {
        h.lastHeartbeatByPeerRef.current.set(remoteId, now());
        h.ensureHeartbeat();
      }
    };

    const onClose = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      const current = connsRef.current.get(key);
      if (current === conn) connsRef.current.delete(key);
      if (ch === 'reliable') h.upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
      else h.stopHeartbeatIfIdle();
    };

    const onError = () => {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      if (ch === 'reliable') h.upsertPeer(remoteId, { status: 'offline', lastSeenAt: now() });
    };

    // ── Packet routing via middleware chain ──────────────────────

    const routerCtx = {
      conn,
      localProfileRef,
      peerIdRef,
      seenMsgIdsRef,
      setProfilesByPeer: h.setProfilesByPeer,
      updateMessage: h.updateMessage,
      queueAckStatus: h.queueAckStatus,
      pushMessage: h.pushMessage,
      setMessagesByPeer: h.setMessagesByPeer,
      sendEncrypted: h.sendEncrypted,
      flushOutboxForPeer: h.flushOutboxForPeer,
      applyTypingWithTimeout: h.applyTypingWithTimeout,
      dropHandlePacket: (...args) => h.dropHandlePacketRef?.current?.(...args),
      onHeartbeat: (rid) => {
        h.lastHeartbeatByPeerRef.current.set(rid, now());
        h.upsertPeer(rid, { status: 'online', lastSeenAt: now() });
      },
    };

    const onData = createPacketHandler(ch, remoteId, routerCtx);

    // Clean up previous listeners (re-attach on glare)
    try {
      conn.off('open', conn._orbHandlers?.onOpen);
      conn.off('close', conn._orbHandlers?.onClose);
      conn.off('error', conn._orbHandlers?.onError);
      conn.off('data', conn._orbHandlers?.onData);
    } catch (_) {}

    conn.on('open', onOpen);
    conn.on('close', onClose);
    conn.on('error', onError);
    conn.on('data', onData);

    conn._orbHandlers = { onOpen, onClose, onError, onData };
  }, [connKey, handlersRef, peerIdRef, selectedPeerIdRef, localProfileRef, seenMsgIdsRef, setSelectedPeerId]);

  // ─── openEphemeral ─────────────────────────────────────────────

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
      metadata: { channel: 'ephemeral', initiator: true },
    });
    attachConn(conn, 'ephemeral');
  }, [attachConn, peerIdRef, peerRef]);

  return { connsRef, connKey, getConn, attachConn, openEphemeral };
}
