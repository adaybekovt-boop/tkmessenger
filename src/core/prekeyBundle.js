// Prekey bundle build / serialize / verify.
//
// A bundle is what a peer hands out so others can kick off X3DH with them
// asynchronously. Structure:
//
//   {
//     v: 1,
//     peerId,                 // human-readable peer id (for ctx binding)
//     identitySpki,           // ECDSA long-term identity (fingerprint anchor)
//     x3dhIdentitySpki,       // ECDH long-term identity used in DH1/DH2
//     x3dhIdentitySig,        // ECDSA(identity) over x3dhIdentitySpki — binds
//                             //   the two long-term halves so TOFU on identity
//                             //   extends to the ECDH key
//     spk: { id, pub, sig },  // signed prekey: pub = ECDH SPKI, sig = ECDSA(identity)
//                             //   over pub. Rotates periodically.
//     opk: { id, pub } | null,// optional one-time prekey. Consumed once on use.
//     createdAt
//   }
//
// All byte fields ride as base64 on the wire. `verifyRemoteBundle` checks
// both signatures; callers that care about TOFU should additionally compare
// the fingerprint of `identitySpki` against a pinned value (see peerPins.js).

import { bytesToBase64, base64ToBytes } from './base64.js';
import {
  exportIdentityPubSpki,
  getOrCreateSigningKey,
  signBytes,
  verifyWithRemoteSpki,
  getOrCreateX3DHIdentity,
  exportX3DHIdentityPubSpki,
  verifyX3DHBinding
} from './identityKey.js';
import {
  ensurePrekeysReady,
  getActiveSignedPrekey,
  listFreshOPKs
} from './prekeyStore.js';

export const BUNDLE_VERSION = 1;

/**
 * Build a freshly-signed bundle for the local device. Ensures the prekey
 * pool exists, pulls the active SPK, and includes one OPK if available.
 * The caller passes `peerId` (the local PeerJS id) so bundles are bound
 * to the advertised transport identity.
 */
export async function buildLocalBundle({ peerId, includeOpk = true } = {}) {
  await ensurePrekeysReady();
  // Make sure both long-term identities exist before reading their publics.
  await getOrCreateSigningKey();
  const x3dhIdentity = await getOrCreateX3DHIdentity();

  const identitySpki = await exportIdentityPubSpki();
  const x3dhIdentitySpki = await exportX3DHIdentityPubSpki();

  const spk = await getActiveSignedPrekey();
  if (!spk) throw new Error('no active signed prekey');

  let opk = null;
  if (includeOpk) {
    const fresh = await listFreshOPKs(1);
    if (fresh.length) opk = { id: fresh[0].id, pub: fresh[0].pubSpki };
  }

  return {
    v: BUNDLE_VERSION,
    peerId: String(peerId || ''),
    identitySpki,
    x3dhIdentitySpki,
    x3dhIdentitySig: x3dhIdentity.bindingSig,
    spk: { id: spk.id, pub: spk.pubSpki, sig: spk.sig },
    opk,
    createdAt: Date.now()
  };
}

function bytes(v) {
  if (v instanceof Uint8Array) return v;
  if (v && typeof v === 'object' && 'buffer' in v) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(0);
}

/** Convert a bundle (with Uint8Array fields) into a JSON-safe object. */
export function serializeBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('bundle required');
  return {
    v: bundle.v,
    peerId: String(bundle.peerId || ''),
    identitySpki: bytesToBase64(bytes(bundle.identitySpki)),
    x3dhIdentitySpki: bytesToBase64(bytes(bundle.x3dhIdentitySpki)),
    x3dhIdentitySig: bytesToBase64(bytes(bundle.x3dhIdentitySig)),
    spk: {
      id: String(bundle.spk?.id || ''),
      pub: bytesToBase64(bytes(bundle.spk?.pub)),
      sig: bytesToBase64(bytes(bundle.spk?.sig))
    },
    opk: bundle.opk
      ? { id: String(bundle.opk.id || ''), pub: bytesToBase64(bytes(bundle.opk.pub)) }
      : null,
    createdAt: Number(bundle.createdAt) || 0
  };
}

function requireB64Bytes(v, field) {
  if (typeof v !== 'string' || !v) throw new Error(`bundle: missing ${field}`);
  const b = base64ToBytes(v);
  if (!b || !b.byteLength) throw new Error(`bundle: empty ${field}`);
  return b;
}

/** Parse a wire bundle back to Uint8Array fields. Throws on malformed input. */
export function parseBundle(wire) {
  if (!wire || typeof wire !== 'object') throw new Error('bundle required');
  if (Number(wire.v) !== BUNDLE_VERSION) throw new Error('bundle: unsupported version');
  if (typeof wire.peerId !== 'string' || !wire.peerId) throw new Error('bundle: missing peerId');

  const identitySpki = requireB64Bytes(wire.identitySpki, 'identitySpki');
  const x3dhIdentitySpki = requireB64Bytes(wire.x3dhIdentitySpki, 'x3dhIdentitySpki');
  const x3dhIdentitySig = requireB64Bytes(wire.x3dhIdentitySig, 'x3dhIdentitySig');

  if (!wire.spk || typeof wire.spk !== 'object') throw new Error('bundle: missing spk');
  const spk = {
    id: String(wire.spk.id || ''),
    pub: requireB64Bytes(wire.spk.pub, 'spk.pub'),
    sig: requireB64Bytes(wire.spk.sig, 'spk.sig')
  };
  if (!spk.id) throw new Error('bundle: missing spk.id');

  let opk = null;
  if (wire.opk) {
    opk = {
      id: String(wire.opk.id || ''),
      pub: requireB64Bytes(wire.opk.pub, 'opk.pub')
    };
    if (!opk.id) throw new Error('bundle: missing opk.id');
  }

  return {
    v: BUNDLE_VERSION,
    peerId: wire.peerId,
    identitySpki,
    x3dhIdentitySpki,
    x3dhIdentitySig,
    spk,
    opk,
    createdAt: Number(wire.createdAt) || 0
  };
}

/**
 * Verify a parsed bundle. Returns `{ ok, reason }`. Does NOT enforce TOFU
 * pinning — callers that pin (`peerPins.js`) must compare the identity
 * fingerprint separately before trusting the bundle.
 *
 * Checks:
 *   1. x3dhIdentitySig is a valid ECDSA signature by identitySpki over the
 *      x3dhIdentitySpki binding blob.
 *   2. spk.sig is a valid ECDSA signature by identitySpki over spk.pub.
 */
export async function verifyRemoteBundle(bundle) {
  if (!bundle) return { ok: false, reason: 'no bundle' };

  const bindingOk = await verifyX3DHBinding(
    bundle.identitySpki,
    bundle.x3dhIdentitySpki,
    bundle.x3dhIdentitySig
  );
  if (!bindingOk) return { ok: false, reason: 'x3dh binding signature invalid' };

  const spkOk = await verifyWithRemoteSpki(bundle.identitySpki, bundle.spk.pub, bundle.spk.sig);
  if (!spkOk) return { ok: false, reason: 'spk signature invalid' };

  return { ok: true };
}

// Kept here so tests can round-trip without reaching into identityKey.
export { signBytes };
