// Trust-on-first-use pin store for remote identity keys.
//
// The first time a peer completes a signed (v3) handshake, we pin the SHA-256
// fingerprint of their identity public key. On every subsequent handshake we
// require the presented idPub to hash to the same fingerprint. A mismatch
// indicates one of:
//   1. The peer legitimately rotated keys (app reinstall, fresh identity).
//   2. An active MITM is substituting a different identity key.
//
// The application layer must surface (1) to the user — we cannot distinguish
// them automatically. This module deliberately does not auto-overwrite pins.

import { openDatabase } from './db.js';
import { bytesToBase64, base64ToBytes } from './base64.js';
import { computeFingerprint } from './identityKey.js';

const KEY_PREFIX = 'peer-pin-';

function rowKey(peerId) {
  return `${KEY_PREFIX}${String(peerId || '')}`;
}

/**
 * @returns {Promise<{ peerId: string, pubSpkiB64: string, fingerprint: string, pinnedAt: number } | null>}
 */
export async function getPin(peerId) {
  if (!peerId) return null;
  const db = await openDatabase();
  const row = await db.get('keys', rowKey(peerId));
  if (!row || !row.pubSpkiB64) return null;
  return {
    peerId: row.peerId || String(peerId),
    pubSpkiB64: String(row.pubSpkiB64),
    fingerprint: String(row.fingerprint || ''),
    pinnedAt: Number(row.pinnedAt || 0)
  };
}

export async function setPin(peerId, pubSpkiBytes) {
  if (!peerId || !pubSpkiBytes) throw new Error('setPin: peerId and pubSpkiBytes required');
  const fingerprint = await computeFingerprint(pubSpkiBytes);
  const db = await openDatabase();
  await db.put('keys', {
    id: rowKey(peerId),
    peerId: String(peerId),
    pubSpkiB64: bytesToBase64(pubSpkiBytes),
    fingerprint,
    pinnedAt: Date.now()
  });
  return { fingerprint };
}

export async function deletePin(peerId) {
  if (!peerId) return false;
  const db = await openDatabase();
  await db.delete('keys', rowKey(peerId));
  return true;
}

/**
 * Verify that a remote pubkey matches the existing pin for this peer.
 *
 * Returns one of:
 *   { status: 'pinned',   fingerprint }  — match, existing pin
 *   { status: 'new',      fingerprint }  — no prior pin, caller may pin
 *   { status: 'mismatch', fingerprint, expected } — active MITM or rotation
 */
export async function checkPin(peerId, remoteSpkiBytes) {
  const incoming = await computeFingerprint(remoteSpkiBytes);
  const pin = await getPin(peerId);
  if (!pin || !pin.fingerprint) return { status: 'new', fingerprint: incoming };
  if (pin.fingerprint === incoming) return { status: 'pinned', fingerprint: incoming };
  return { status: 'mismatch', fingerprint: incoming, expected: pin.fingerprint };
}

/** Convert a stored pin's pubSpkiB64 back into raw bytes. */
export function pubSpkiBytesFromPin(pin) {
  if (!pin || !pin.pubSpkiB64) return null;
  return base64ToBytes(pin.pubSpkiB64);
}
