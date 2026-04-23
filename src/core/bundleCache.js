// Cache of verified remote prekey bundles.
//
// Once we've received a peer's bundle over the wire and run it through
// `verifyRemoteBundle` + TOFU pin check, we stash a serialized copy here
// so the next outbound X3DH session can start without round-tripping.
//
// Rows live alongside peer pins in the `keys` store, under the
// `peer-bundle-<peerId>` row id. That keeps the schema unchanged and all
// per-peer long-term trust state in one place.

import { openDatabase } from './db.js';
import { serializeBundle, parseBundle, verifyRemoteBundle } from './prekeyBundle.js';
import { checkPin } from './peerPins.js';
import { computeFingerprint } from './identityKey.js';

const ROW_PREFIX = 'peer-bundle-';

function rowKey(peerId) {
  return `${ROW_PREFIX}${String(peerId || '')}`;
}

/**
 * Store an already-verified bundle. Callers should have verified signatures
 * and checked the TOFU pin first — `cacheVerifiedBundle` only persists. Use
 * `acceptIncomingBundle` for the full verify+pin+store path.
 */
export async function cacheVerifiedBundle(peerId, bundle) {
  if (!peerId || !bundle) throw new Error('cacheVerifiedBundle: peerId + bundle required');
  const wire = serializeBundle(bundle);
  const db = await openDatabase();
  await db.put('keys', {
    id: rowKey(peerId),
    peerId: String(peerId),
    wire,
    fingerprint: await computeFingerprint(bundle.identitySpki),
    storedAt: Date.now()
  });
  return true;
}

/** Retrieve a cached bundle (deserialized) or null. */
export async function getCachedBundle(peerId) {
  if (!peerId) return null;
  const db = await openDatabase();
  const row = await db.get('keys', rowKey(peerId));
  if (!row || !row.wire) return null;
  try {
    return {
      peerId: String(row.peerId || peerId),
      bundle: parseBundle(row.wire),
      fingerprint: String(row.fingerprint || ''),
      storedAt: Number(row.storedAt || 0)
    };
  } catch (_) {
    // Malformed cache — drop it rather than crashing downstream.
    try { await db.delete('keys', rowKey(peerId)); } catch (_) {}
    return null;
  }
}

export async function deleteCachedBundle(peerId) {
  if (!peerId) return false;
  const db = await openDatabase();
  await db.delete('keys', rowKey(peerId));
  return true;
}

/**
 * Full accept path for a bundle coming off the wire.
 *
 * 1. Parse + signature check (`verifyRemoteBundle`).
 * 2. Bind the bundle to the claimed peerId — we accept bundles only from the
 *    same transport peer id that sent them.
 * 3. TOFU pin check on `bundle.identitySpki`:
 *    - `new`: accept, caller decides whether to pin (first-contact policy).
 *    - `pinned`: accept, fingerprint matches.
 *    - `mismatch`: refuse — identity swap, requires user intervention.
 * 4. Persist to cache.
 *
 * Returns `{ ok, status, reason?, bundle?, pinStatus? }`.
 *   - ok=true only when we stored the bundle.
 *   - status mirrors the pin state so the UI can surface "new peer" vs
 *     "key rotation detected".
 */
export async function acceptIncomingBundle({ senderPeerId, wire }) {
  if (!senderPeerId) return { ok: false, reason: 'missing senderPeerId' };
  let bundle;
  try {
    bundle = parseBundle(wire);
  } catch (err) {
    return { ok: false, reason: `parse: ${err?.message || 'invalid'}` };
  }
  if (bundle.peerId !== senderPeerId) {
    return { ok: false, reason: 'bundle peerId does not match sender' };
  }

  const verify = await verifyRemoteBundle(bundle);
  if (!verify.ok) return { ok: false, reason: verify.reason || 'signature invalid' };

  const pin = await checkPin(senderPeerId, bundle.identitySpki);
  if (pin.status === 'mismatch') {
    return {
      ok: false,
      status: 'mismatch',
      reason: 'identity fingerprint mismatch',
      pinStatus: pin
    };
  }

  await cacheVerifiedBundle(senderPeerId, bundle);
  return { ok: true, status: pin.status, bundle, pinStatus: pin };
}

/** List every cached bundle (for debug/devtools — not a hot path). */
export async function listCachedBundles() {
  const db = await openDatabase();
  const all = await db.getAll('keys');
  return all
    .filter((r) => typeof r?.id === 'string' && r.id.startsWith(ROW_PREFIX))
    .map((r) => ({
      peerId: String(r.peerId || r.id.slice(ROW_PREFIX.length)),
      fingerprint: String(r.fingerprint || ''),
      storedAt: Number(r.storedAt || 0)
    }));
}
