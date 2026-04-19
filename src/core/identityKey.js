// Long-term identity signing key (ECDSA over P-256).
//
// Every device keeps one per-install ECDSA key pair that lives in IndexedDB
// with the private half non-extractable. We use it to sign the wireHello
// handshake payload so a peer can cryptographically verify that the DH pubkey
// they just received actually came from the holder of this identity — that
// is how MITM on the handshake is prevented.
//
// The public SPKI bytes are the stable identity. Their SHA-256 hash is
// exposed to the UI as a short hex fingerprint; users can compare fingerprints
// out-of-band (QR, voice) to detect an attacker who substitutes keys on the
// very first handshake (TOFU bootstrap).

import { base64ToBytes, bytesToBase64 } from './base64.js';
import { openDatabase } from './db.js';

const KEY_ID = 'identity-signing-v1';
const X3DH_KEY_ID = 'identity-x3dh-v1';

// Cache in-memory so we don't round-trip IDB on every sign call.
let cachedKeyPair = null;
let cachedPubSpki = null;
let cachedFingerprint = null;
let cachedX3dhKeyPair = null;
let cachedX3dhPubSpki = null;
let cachedX3dhBinding = null;

async function readKeyPairFromDb() {
  const db = await openDatabase();
  const row = await db.get('keys', KEY_ID);
  if (!row || !row.privateKey || !row.publicKey) return null;
  // Sanity: verify both halves decoded as CryptoKey (IDB structured-clones
  // them). If the browser downgraded to raw JWK, we can't use it.
  if (typeof row.privateKey !== 'object' || typeof row.publicKey !== 'object') {
    return null;
  }
  return { privateKey: row.privateKey, publicKey: row.publicKey };
}

async function writeKeyPairToDb(keyPair) {
  const db = await openDatabase();
  await db.put('keys', {
    id: KEY_ID,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: Date.now()
  });
}

async function generateNewPair() {
  // Non-extractable private key — the DB can structured-clone it but the
  // app itself cannot export the raw bytes, so a future XSS cannot exfiltrate
  // the private key via JS introspection.
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Return the cached identity signing key pair, creating+persisting one on
 * first call.
 */
export async function getOrCreateSigningKey() {
  if (cachedKeyPair) return cachedKeyPair;
  const existing = await readKeyPairFromDb();
  if (existing) {
    cachedKeyPair = existing;
    return existing;
  }
  const pair = await generateNewPair();
  await writeKeyPairToDb(pair);
  cachedKeyPair = pair;
  // Invalidate derived caches.
  cachedPubSpki = null;
  cachedFingerprint = null;
  return pair;
}

/**
 * SPKI bytes of the local identity public key. The public half is always
 * exportable regardless of the non-extractable flag on the private half.
 */
export async function exportIdentityPubSpki() {
  if (cachedPubSpki) return cachedPubSpki;
  const { publicKey } = await getOrCreateSigningKey();
  const buf = await crypto.subtle.exportKey('spki', publicKey);
  cachedPubSpki = new Uint8Array(buf);
  return cachedPubSpki;
}

/**
 * Compute the SHA-256 fingerprint of a raw SPKI byte array, lowercase hex.
 * Pure function — safe to call on remote pubkeys too.
 */
export async function computeFingerprint(spkiBytes) {
  const buf = await crypto.subtle.digest('SHA-256', spkiBytes);
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Human-readable local identity fingerprint (64 hex chars). Cached for UI.
 */
export async function getLocalIdentityFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;
  const spki = await exportIdentityPubSpki();
  cachedFingerprint = await computeFingerprint(spki);
  return cachedFingerprint;
}

/**
 * 16-hex-char short fingerprint, for compact display / peer comparison.
 */
export function shortFingerprint(fingerprint) {
  const s = String(fingerprint || '');
  return s.slice(0, 16);
}

/**
 * Sign a byte array with the local identity key. SHA-256 is the digest used
 * by ECDSA — this matches the hash parameter in verifySignature below.
 */
export async function signBytes(dataBytes) {
  const { privateKey } = await getOrCreateSigningKey();
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    dataBytes
  );
  return new Uint8Array(sig);
}

/**
 * Verify an ECDSA-P256-SHA256 signature against a remote SPKI pubkey.
 * Returns a boolean (never throws for bad inputs — callers decide how to
 * handle verification failure).
 */
export async function verifyWithRemoteSpki(remoteSpkiBytes, dataBytes, sigBytes) {
  if (!remoteSpkiBytes || !dataBytes || !sigBytes) return false;
  try {
    const remoteKey = await crypto.subtle.importKey(
      'spki',
      remoteSpkiBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      remoteKey,
      sigBytes,
      dataBytes
    );
  } catch (_) {
    return false;
  }
}

/**
 * Build the canonical byte string that both sides sign. Ordering matters:
 * the same function must produce the same bytes on both peers for the
 * signature to verify. Format:
 *
 *   "orbits-wire-v3\n" || senderPeerId || "\n" || receiverPeerId || "\n" ||
 *   base64(senderDhSpki) || "\n" || base64(senderIdSpki)
 *
 * Binding receiverPeerId blocks "take handshake from chat A, replay to chat
 * B" attacks; binding senderIdSpki blocks a (contrived) attack where two
 * identity keys share a fingerprint prefix.
 */
export function buildSignedHelloBlob({
  senderPeerId,
  receiverPeerId,
  senderDhSpki,
  senderIdSpki,
  x3dhExtras = null
}) {
  // v4 binds X3DH bootstrap material (sender's ECDH identity pub, ephemeral
  // pub, and the ids of bob's prekeys alice consumed) into the hello
  // signature so a MITM can't silently swap any of them. v3 hellos keep the
  // original 5-line blob to stay bit-compatible with already-shipped peers.
  const parts = [
    x3dhExtras ? 'orbits-wire-v4' : 'orbits-wire-v3',
    String(senderPeerId || ''),
    String(receiverPeerId || ''),
    bytesToBase64(senderDhSpki),
    bytesToBase64(senderIdSpki)
  ];
  if (x3dhExtras) {
    parts.push(bytesToBase64(x3dhExtras.x3dhIkSpki));
    parts.push(bytesToBase64(x3dhExtras.ekSpki));
    parts.push(String(x3dhExtras.spkId || ''));
    parts.push(String(x3dhExtras.opkId || ''));
  }
  return new TextEncoder().encode(parts.join('\n'));
}

// ─── X3DH long-term ECDH identity ────────────────────────────────
//
// X3DH's first DH is DH(IK_a, SPK_b) — both sides need an ECDH-capable
// long-term identity. Our `identity-signing-v1` is ECDSA, so we keep a
// second long-term key specifically for X3DH. It's bound to the ECDSA
// identity by a signature: the ECDSA key signs the ECDH public SPKI bytes,
// so a verifier who already trusts the ECDSA identity (via fingerprint /
// TOFU pin) can extend that trust to the ECDH half without a second
// fingerprint comparison.

const X3DH_BINDING_PREFIX = new TextEncoder().encode('orbits-x3dh-ik-v1\n');

function buildX3dhBindingBlob(x3dhPubSpki) {
  const out = new Uint8Array(X3DH_BINDING_PREFIX.length + x3dhPubSpki.length);
  out.set(X3DH_BINDING_PREFIX, 0);
  out.set(x3dhPubSpki, X3DH_BINDING_PREFIX.length);
  return out;
}

async function readX3dhPairFromDb() {
  const db = await openDatabase();
  const row = await db.get('keys', X3DH_KEY_ID);
  if (!row || !row.privateKey || !row.publicKey || !row.bindingSig) return null;
  if (typeof row.privateKey !== 'object' || typeof row.publicKey !== 'object') return null;
  return { privateKey: row.privateKey, publicKey: row.publicKey, bindingSig: row.bindingSig };
}

async function generateX3dhPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

/**
 * Return the cached long-term X3DH ECDH pair, creating+persisting one on
 * first call. The freshly-minted pub is signed with the ECDSA identity so
 * remote peers can bind the two halves together.
 */
export async function getOrCreateX3DHIdentity() {
  if (cachedX3dhKeyPair && cachedX3dhBinding) {
    return { ...cachedX3dhKeyPair, bindingSig: cachedX3dhBinding };
  }
  const existing = await readX3dhPairFromDb();
  if (existing) {
    cachedX3dhKeyPair = { privateKey: existing.privateKey, publicKey: existing.publicKey };
    cachedX3dhBinding = existing.bindingSig;
    return existing;
  }

  const pair = await generateX3dhPair();
  const pubBuf = await crypto.subtle.exportKey('spki', pair.publicKey);
  const pubSpki = new Uint8Array(pubBuf);
  const bindingSig = await signBytes(buildX3dhBindingBlob(pubSpki));

  const db = await openDatabase();
  await db.put('keys', {
    id: X3DH_KEY_ID,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    bindingSig,
    createdAt: Date.now()
  });

  cachedX3dhKeyPair = { privateKey: pair.privateKey, publicKey: pair.publicKey };
  cachedX3dhBinding = bindingSig;
  cachedX3dhPubSpki = pubSpki;
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, bindingSig };
}

/** SPKI bytes of the local X3DH ECDH public key. */
export async function exportX3DHIdentityPubSpki() {
  if (cachedX3dhPubSpki) return cachedX3dhPubSpki;
  const { publicKey } = await getOrCreateX3DHIdentity();
  const buf = await crypto.subtle.exportKey('spki', publicKey);
  cachedX3dhPubSpki = new Uint8Array(buf);
  return cachedX3dhPubSpki;
}

/**
 * Verify that an X3DH public SPKI was endorsed by a given ECDSA identity.
 * Callers should first verify the ECDSA identity itself (fingerprint / TOFU
 * pin), then chain through this to trust the ECDH half.
 */
export async function verifyX3DHBinding(identitySpki, x3dhPubSpki, bindingSig) {
  return verifyWithRemoteSpki(identitySpki, buildX3dhBindingBlob(x3dhPubSpki), bindingSig);
}

/** For tests: reset the in-memory cache so a fresh read from IDB happens. */
export function __resetCacheForTests() {
  cachedKeyPair = null;
  cachedPubSpki = null;
  cachedFingerprint = null;
  cachedX3dhKeyPair = null;
  cachedX3dhPubSpki = null;
  cachedX3dhBinding = null;
}

export { bytesToBase64, base64ToBytes };
