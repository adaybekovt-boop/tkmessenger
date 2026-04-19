// X3DH — Extended Triple Diffie-Hellman key agreement.
//
// Derives a shared secret SK between an initiator (Alice) and a responder
// (Bob) using Bob's published prekey bundle. Alice doesn't need Bob online —
// that's the whole point.
//
// Inputs (initiator side):
//   IK_a  — Alice's long-term identity key (ECDH pair)
//   EK_a  — a fresh ephemeral ECDH key Alice generates per session
//   IK_b  — Bob's identity public (SPKI bytes)
//   SPK_b — Bob's signed prekey public (SPKI bytes)
//   OPK_b — optional one-time prekey public (SPKI bytes)
//
// Four DHs:
//   DH1 = DH(IK_a,  SPK_b)   — binds initiator identity to Bob's SPK
//   DH2 = DH(EK_a,  IK_b)    — binds ephemeral to Bob's identity
//   DH3 = DH(EK_a,  SPK_b)   — ephemeral ⇄ SPK
//   DH4 = DH(EK_a,  OPK_b)   — only if an OPK was used; gives forward secrecy
//                              against compromise of SPK
//
// SK = HKDF-SHA256(salt=F || DH1 || DH2 || DH3 [|| DH4], info="orbits-x3dh-v1")
// where F is 32 null bytes (spec-mandated domain separation prefix).
//
// NOTE: the project's identity key is currently ECDSA, not ECDH — the caller
// that wires this up will need a parallel long-term ECDH identity (or migrate
// the identity to ECDH and derive an ECDSA signing key from the same seed).
// This module accepts the ECDH IK as an input; key-management choices are out
// of scope here.
//
// Curve: ECDH P-256 (Web Crypto native). Signal's reference uses X25519 but
// the protocol is curve-agnostic provided both sides agree.

const CURVE = { name: 'ECDH', namedCurve: 'P-256' };
const DH_BITS = 256; // P-256 shared secret is 32 bytes

async function importSpki(spkiBytes) {
  return crypto.subtle.importKey('spki', spkiBytes, CURVE, false, []);
}

async function dh(privateKey, remotePubSpki) {
  const remote = await importSpki(remotePubSpki);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: remote }, privateKey, DH_BITS);
  return new Uint8Array(bits);
}

function concat(...arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function hkdfSha256(ikm, { salt, info, length = 32 }) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

// Signal X3DH prepends 32 0xFF bytes to the IKM for domain separation from
// earlier protocol versions. We keep the same constant so the derivation is
// interoperable with any reference implementation that picks P-256.
const F_PREFIX = new Uint8Array(32).fill(0xff);
const INFO = new TextEncoder().encode('orbits-x3dh-v1');

/**
 * Derive SK from the four raw DH outputs. Pure function — same inputs always
 * give same output, which is what the tests pin.
 */
export async function deriveX3DHSecret({ dh1, dh2, dh3, dh4 = null }) {
  const parts = [F_PREFIX, dh1, dh2, dh3];
  if (dh4) parts.push(dh4);
  const ikm = concat(...parts);
  const salt = new Uint8Array(32);
  return hkdfSha256(ikm, { salt, info: INFO, length: 32 });
}

/**
 * Initiator side. Performs all DHs and derives SK. Returns `{ sk, usedOpk }`
 * so the caller knows whether to include the OPK id in the outgoing hello.
 */
export async function initiatorX3DH({ IK_a_priv, EK_a_priv, IK_b_spki, SPK_b_spki, OPK_b_spki = null }) {
  const dh1 = await dh(IK_a_priv, SPK_b_spki);
  const dh2 = await dh(EK_a_priv, IK_b_spki);
  const dh3 = await dh(EK_a_priv, SPK_b_spki);
  const dh4 = OPK_b_spki ? await dh(EK_a_priv, OPK_b_spki) : null;
  const sk = await deriveX3DHSecret({ dh1, dh2, dh3, dh4 });
  return { sk, usedOpk: !!OPK_b_spki };
}

/**
 * Responder side. Bob receives the hello with Alice's IK_a + EK_a publics
 * and (optionally) the id of the OPK she used. He looks up the matching
 * private halves and mirrors the four DHs — the SK must match.
 */
export async function responderX3DH({ SPK_b_priv, IK_b_priv, OPK_b_priv = null, IK_a_spki, EK_a_spki }) {
  const dh1 = await dh(SPK_b_priv, IK_a_spki);
  const dh2 = await dh(IK_b_priv, EK_a_spki);
  const dh3 = await dh(SPK_b_priv, EK_a_spki);
  const dh4 = OPK_b_priv ? await dh(OPK_b_priv, EK_a_spki) : null;
  const sk = await deriveX3DHSecret({ dh1, dh2, dh3, dh4 });
  return { sk, usedOpk: !!OPK_b_priv };
}

/**
 * Helper to mint a one-shot ephemeral ECDH pair. Used by the initiator
 * exactly once per new session.
 */
export async function generateEphemeralECDHPair() {
  return crypto.subtle.generateKey(CURVE, false, ['deriveBits']);
}

/**
 * Export an ECDH public key to SPKI bytes — what goes on the wire.
 */
export async function exportECDHPubSpki(publicKey) {
  const buf = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(buf);
}
