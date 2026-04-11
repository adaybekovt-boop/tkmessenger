// wireCrypto.js — thin compatibility facade over the new Double Ratchet.
//
// Phase 2 moves all crypto onto `doubleRatchet.js` + `wireSession.js`. This
// module keeps the old public surface (initWireSession, encryptWirePayload,
// decryptWirePayload, …) so existing call sites — and future Phase 1 hooks
// — don't have to know about the ratchet internals.

import {
  initiateHandshake,
  acceptHello,
  encryptOutbound,
  decryptInbound,
  waitReady,
  isReady,
  teardownSession,
  isWireCiphertext
} from './wireSession.js';

export const ORBIT_WIRE_VERSION = 2;

/**
 * Begin a session with a peer. Returns the handshake hello message the caller
 * should send over the reliable channel. Must be followed by `acceptWireHello`
 * once the peer's reply arrives.
 */
export async function initWireSession(peerId, myPeerId) {
  const hello = await initiateHandshake(peerId, myPeerId);
  return { version: ORBIT_WIRE_VERSION, hello };
}

/** Process a peer's wireHello (or wireRekey). */
export async function acceptWireHello(peerId, myPeerId, helloMsg) {
  return acceptHello(peerId, myPeerId, helloMsg);
}

export function getWireSessionStatus(peerId) {
  return { ready: isReady(peerId), version: ORBIT_WIRE_VERSION };
}

export function waitForWireReady(peerId, timeoutMs) {
  return waitReady(peerId, timeoutMs);
}

export function teardownWireSession(peerId) {
  return teardownSession(peerId);
}

export async function encryptWirePayload(peerId, obj) {
  return encryptOutbound(peerId, obj);
}

export async function decryptWirePayload(peerId, wireStr) {
  return decryptInbound(peerId, wireStr);
}

export { isWireCiphertext };
