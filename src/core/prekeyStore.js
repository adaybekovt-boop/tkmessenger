// X3DH prekey store.
//
// Holds the local device's signed prekey (SPK) and one-time prekeys (OPKs).
// The bundle we hand out to remote peers is:
//   { IK_pub, SPK_id, SPK_pub, SPK_sig, OPK: { id, pub } }
// where SPK_sig = ECDSA(identityKey, SPK_pub_spki).
//
// Private key material is kept non-extractable inside IndexedDB; only the
// SPKI-serialized public halves ever leave the device. This mirrors how
// `identityKey.js` stores the long-term ECDSA key.
//
// SPK lifecycle:
//   - exactly one SPK is `active` at a time (the one we publish);
//   - when rotated, the previous SPK is kept for a grace window so late
//     inbound messages encrypted to it can still decrypt;
//   - `pruneRetiredSPKs(maxAgeMs)` removes ones older than the window.
//
// OPK lifecycle:
//   - pool of N unused OPKs;
//   - `consumeOPK(id)` flips `used=true` so the same OPK is never reused
//     (X3DH forward secrecy depends on this);
//   - `pruneUsedOPKs(maxAgeMs)` removes spent entries after a grace window.

import { openDatabase } from './db.js';
import { signBytes } from './identityKey.js';

const SPK_ROTATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const USED_OPK_RETENTION_MS = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_OPK_POOL_SIZE = 100;

function randomId(prefix) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${prefix}-${hex}`;
}

async function generateECDHPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function exportSpki(publicKey) {
  const buf = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(buf);
}

/**
 * Generate a fresh signed prekey, sign its SPKI with the local identity, and
 * persist it as the new active SPK. The previous active SPK, if any, is
 * demoted to `retired` so late inbound messages can still decrypt.
 */
export async function rotateSignedPrekey() {
  const db = await openDatabase();
  const pair = await generateECDHPair();
  const pubSpki = await exportSpki(pair.publicKey);
  const sig = await signBytes(pubSpki);

  const id = randomId('spk');
  const record = {
    id,
    kind: 'spk',
    status: 'active',
    used: 0,
    privateKey: pair.privateKey,
    pubSpki,
    sig,
    createdAt: Date.now()
  };

  const tx = db.transaction('prekeys', 'readwrite');
  const store = tx.objectStore('prekeys');
  // Demote any currently-active SPK.
  const idx = store.index('kind');
  let cursor = await idx.openCursor('spk');
  while (cursor) {
    const v = cursor.value;
    if (v.status === 'active') {
      await cursor.update({ ...v, status: 'retired', retiredAt: Date.now() });
    }
    cursor = await cursor.continue();
  }
  await store.put(record);
  await tx.done;
  return { id, pubSpki, sig };
}

/** Returns the active SPK record or null. */
export async function getActiveSignedPrekey() {
  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readonly');
  const idx = tx.objectStore('prekeys').index('kind');
  let cursor = await idx.openCursor('spk');
  while (cursor) {
    if (cursor.value.status === 'active') return cursor.value;
    cursor = await cursor.continue();
  }
  return null;
}

/** Look up any SPK by id — active or retired. Used by recipients on inbound. */
export async function getSignedPrekeyById(id) {
  const db = await openDatabase();
  const rec = await db.get('prekeys', id);
  return rec && rec.kind === 'spk' ? rec : null;
}

/** Drop retired SPKs older than `maxAgeMs` (default 14 days). */
export async function pruneRetiredSPKs(maxAgeMs = 14 * 24 * 60 * 60 * 1000) {
  const db = await openDatabase();
  const cutoff = Date.now() - maxAgeMs;
  const tx = db.transaction('prekeys', 'readwrite');
  const idx = tx.objectStore('prekeys').index('kind');
  let cursor = await idx.openCursor('spk');
  let removed = 0;
  while (cursor) {
    const v = cursor.value;
    if (v.status === 'retired' && Number(v.retiredAt || 0) < cutoff) {
      await cursor.delete();
      removed += 1;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

/**
 * Generate `count` fresh OPKs and persist them. Returns the freshly-minted
 * `{ id, pubSpki }[]` so callers can include them in an outgoing bundle.
 */
export async function generateOneTimePrekeys(count = DEFAULT_OPK_POOL_SIZE) {
  // Mint all key material up front. IDB transactions close across
  // non-IDB awaits, so we can't interleave `generateKey` with `store.put`.
  const minted = [];
  for (let i = 0; i < count; i++) {
    const pair = await generateECDHPair();
    const pubSpki = await exportSpki(pair.publicKey);
    minted.push({
      id: randomId('opk'),
      kind: 'opk',
      status: 'fresh',
      used: 0,
      privateKey: pair.privateKey,
      pubSpki,
      createdAt: Date.now()
    });
  }

  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readwrite');
  const store = tx.objectStore('prekeys');
  const writes = minted.map((rec) => store.put(rec));
  await Promise.all(writes);
  await tx.done;
  return minted.map(({ id, pubSpki }) => ({ id, pubSpki }));
}

/** Count of unused OPKs remaining in the pool. */
export async function countFreshOPKs() {
  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readonly');
  const idx = tx.objectStore('prekeys').index('kind_used');
  return await idx.count(['opk', 0]);
}

/**
 * Pull public parts of up to `n` fresh OPKs for publication in a bundle.
 * Does not mark them used — consumption happens on inbound X3DH via
 * `consumeOPK(id)`.
 */
export async function listFreshOPKs(n = 20) {
  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readonly');
  const idx = tx.objectStore('prekeys').index('kind_used');
  let cursor = await idx.openCursor(IDBKeyRange.only(['opk', 0]));
  const out = [];
  while (cursor && out.length < n) {
    out.push({ id: cursor.value.id, pubSpki: cursor.value.pubSpki });
    cursor = await cursor.continue();
  }
  return out;
}

/**
 * Retrieve a fresh OPK record and mark it used atomically. Returns the record
 * (including privateKey) so the caller can immediately perform DH. If the OPK
 * is missing or already used, returns null.
 */
export async function consumeOPK(id) {
  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readwrite');
  const store = tx.objectStore('prekeys');
  const rec = await store.get(id);
  if (!rec || rec.kind !== 'opk' || rec.used !== 0) {
    await tx.done;
    return null;
  }
  await store.put({ ...rec, used: 1, usedAt: Date.now() });
  await tx.done;
  return rec;
}

/** Remove OPKs marked used longer than `maxAgeMs` ago. */
export async function pruneUsedOPKs(maxAgeMs = USED_OPK_RETENTION_MS) {
  const db = await openDatabase();
  const cutoff = Date.now() - maxAgeMs;
  const tx = db.transaction('prekeys', 'readwrite');
  const idx = tx.objectStore('prekeys').index('kind_used');
  let cursor = await idx.openCursor(IDBKeyRange.only(['opk', 1]));
  let removed = 0;
  while (cursor) {
    const v = cursor.value;
    if (Number(v.usedAt || 0) < cutoff) {
      await cursor.delete();
      removed += 1;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

/**
 * Top-level bootstrap: ensure there is an active SPK newer than the rotation
 * window, and top the OPK pool up to `targetPool`. Call once at startup and
 * whenever the user publishes/refreshes their bundle.
 */
export async function ensurePrekeysReady({
  rotationMs = SPK_ROTATION_MS,
  targetPool = DEFAULT_OPK_POOL_SIZE,
  minPool = 20
} = {}) {
  const active = await getActiveSignedPrekey();
  const needsRotation = !active || Date.now() - Number(active.createdAt || 0) > rotationMs;
  if (needsRotation) {
    await rotateSignedPrekey();
  }
  const count = await countFreshOPKs();
  if (count < minPool) {
    await generateOneTimePrekeys(targetPool - count);
  }
}
