// useWireHandshake — owns the encrypted send helpers and the per-connection
// handshake sequence. Extracted from usePeer to isolate wire-crypto concerns.
//
// Dependencies injected from the caller (usePeer):
//   - peerIdRef     — ref holding the current local peer id
//   - connsRef      — ref holding the Map<connKey, DataConnection>
//   - buildConnKey  — (remoteId, channel) => string

import { useCallback } from 'react';
import { normalizePeerId } from '../peer/helpers.js';
import {
  initWireSession,
  encryptWirePayload,
  waitForWireReady,
  isWireReady,
  teardownWireSession
} from '../core/wireCrypto.js';

export { teardownWireSession };

/**
 * Provides encrypted send functions for both reliable and ephemeral channels,
 * plus a handshake initiation sequence to call on reliable channel open.
 */
export function useWireHandshake({ peerIdRef, connsRef, buildConnKey }) {
  // Reliable channel: wait for wire session if needed, then encrypt + send.
  const sendEncrypted = useCallback(async (remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    const conn = connsRef.current.get(buildConnKey(normalized, 'reliable'));
    if (!conn || !conn.open) return false;
    try {
      if (!isWireReady(normalized)) {
        await waitForWireReady(normalized, 8000);
      }
      const wire = await encryptWirePayload(normalized, msg);
      conn.send(wire);
      return true;
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[sendEncrypted] failed:', normalized, err?.message);
      return false;
    }
  }, [buildConnKey, connsRef]);

  // Ephemeral channel: encrypt-or-drop. If the wire session isn't ready yet,
  // silently skip — heartbeats and typing indicators are non-critical.
  const sendEncryptedEphemeral = useCallback(async (remoteId, msg) => {
    const normalized = normalizePeerId(remoteId);
    const conn = connsRef.current.get(buildConnKey(normalized, 'ephemeral'));
    if (!conn || !conn.open) return false;
    if (!isWireReady(normalized)) return false;
    try {
      const wire = await encryptWirePayload(normalized, msg);
      conn.send(wire);
      return true;
    } catch (_) { return false; }
  }, [buildConnKey, connsRef]);

  // Run the wire handshake on a freshly opened reliable connection.
  // Returns after the session is ready (or after the 8s timeout).
  const initiateHandshakeOnOpen = useCallback(async (conn, remoteId) => {
    try {
      const { hello } = await initWireSession(remoteId, String(peerIdRef.current || ''));
      try { conn.send(hello); } catch (_) {}
      await waitForWireReady(remoteId, 8000).catch(() => {});
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[wire] initiateHandshake failed', err);
    }
  }, [peerIdRef]);

  return { sendEncrypted, sendEncryptedEphemeral, initiateHandshakeOnOpen };
}
