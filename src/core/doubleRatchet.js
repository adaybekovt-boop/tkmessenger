// Signal-style Double Ratchet — pure crypto primitives.
//
// Provides forward secrecy (each message has an independent key derived from
// a one-way symmetric chain) and break-in recovery (on every new remote DH
// pubkey, the root key is advanced via ECDH → HKDF). Skipped-message keys
// are cached up to MAX_SKIPPED per receive chain so out-of-order delivery
// still decrypts.
//
// State shape (all Uint8Array unless noted):
//   {
//     rootKey:      Uint8Array(32),
//     sendCk:       Uint8Array(32) | null,    // sending chain key
//     recvCk:       Uint8Array(32) | null,    // receiving chain key
//     dhKeyPair:    CryptoKeyPair (ECDH P-256, extractable=false),
//     dhPubSpki:    Uint8Array (SPKI of dhKeyPair.publicKey),
//     remoteDhPub:  Uint8Array | null,         // SPKI of peer's current DH pub
//     Ns:           number,                    // messages sent in current chain
//     Nr:           number,                    // messages received in current chain
//     PN:           number,                    // previous send chain length
//     skipped:      Map<`${b64spki}|${n}`, Uint8Array(32)>  // out-of-order cache
//   }
//
// Wire header (JSON-encoded then base64):
//   { dh: base64(spki), n: number, pn: number }

import { base64ToBytes, bytesToBase64 } from './base64.js';

const MAX_SKIPPED = 64;
const MAX_SKIP_PER_STEP = 32;
const ROOT_INFO = 'orbits-ratchet-rk-v2';
const CHAIN_INFO = 'orbits-ratchet-ck-v2';

// ─────────────────────────────────────────────────────────────
// Low-level crypto helpers
// ─────────────────────────────────────────────────────────────

async function hkdfBits(ikm, salt, infoStr, lenBytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const info = new TextEncoder().encode(infoStr);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lenBytes * 8
  );
  return new Uint8Array(bits);
}

/** KDF_RK: advance root key using a fresh DH output. Returns { rk', ck }. */
export async function kdfRk(rootKey, dhOutput) {
  const out = await hkdfBits(dhOutput, rootKey, ROOT_INFO, 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

/** KDF_CK: advance a chain key. Returns { ck', mk } — message key is one-shot. */
export async function kdfCk(chainKey) {
  const out = await hkdfBits(chainKey, new Uint8Array(0), CHAIN_INFO, 64);
  return { chainKey: out.slice(0, 32), messageKey: out.slice(32, 64) };
}

export async function generateDhKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

export async function exportSpkiBytes(publicKey) {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(spki);
}

export async function importRemoteSpki(spkiBytes) {
  return crypto.subtle.importKey(
    'spki',
    spkiBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function dhShared(privateKey, remotePublicSpkiBytes) {
  const remote = await importRemoteSpki(remotePublicSpkiBytes);
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remote },
    privateKey,
    256
  );
  return new Uint8Array(bits);
}

async function importMessageKey(mk) {
  return crypto.subtle.importKey('raw', mk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Header encoding
// ─────────────────────────────────────────────────────────────

export function encodeHeader({ dhPubSpki, n, pn }) {
  const obj = { dh: bytesToBase64(dhPubSpki), n, pn };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(obj)));
}

export function decodeHeader(b64) {
  const json = new TextDecoder().decode(base64ToBytes(b64));
  const obj = JSON.parse(json);
  return {
    dhPubSpki: base64ToBytes(String(obj.dh || '')),
    n: Number(obj.n) || 0,
    pn: Number(obj.pn) || 0
  };
}

// ─────────────────────────────────────────────────────────────
// Initial state setup
// ─────────────────────────────────────────────────────────────

/**
 * Alice initializes knowing Bob's initial DH public key up front. She will
 * immediately derive a sending chain, so she can encrypt her first message.
 */
export async function ratchetInitAlice({ sharedSecret, remoteDhPubSpki }) {
  const dhKeyPair = await generateDhKeyPair();
  const dhPubSpki = await exportSpkiBytes(dhKeyPair.publicKey);
  const dh = await dhShared(dhKeyPair.privateKey, remoteDhPubSpki);
  const { rootKey, chainKey } = await kdfRk(sharedSecret, dh);
  return {
    rootKey,
    sendCk: chainKey,
    recvCk: null,
    dhKeyPair,
    dhPubSpki,
    remoteDhPub: remoteDhPubSpki,
    Ns: 0,
    Nr: 0,
    PN: 0,
    skipped: new Map()
  };
}

/**
 * Bob initializes with his own DH key pair already known to Alice. His first
 * receive on this session triggers a DH ratchet step and derives his first
 * receive chain.
 */
export async function ratchetInitBob({ sharedSecret, dhKeyPair, dhPubSpki }) {
  return {
    rootKey: sharedSecret,
    sendCk: null,
    recvCk: null,
    dhKeyPair,
    dhPubSpki,
    remoteDhPub: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    skipped: new Map()
  };
}

// ─────────────────────────────────────────────────────────────
// DH ratchet step (called when a new remote DH pub arrives)
// ─────────────────────────────────────────────────────────────

async function dhRatchetStep(state, newRemoteDhPubSpki) {
  const prevPN = state.Ns;

  const dhRecv = await dhShared(state.dhKeyPair.privateKey, newRemoteDhPubSpki);
  const a = await kdfRk(state.rootKey, dhRecv);

  const newDhKeyPair = await generateDhKeyPair();
  const newDhPubSpki = await exportSpkiBytes(newDhKeyPair.publicKey);
  const dhSend = await dhShared(newDhKeyPair.privateKey, newRemoteDhPubSpki);
  const b = await kdfRk(a.rootKey, dhSend);

  return {
    ...state,
    rootKey: b.rootKey,
    recvCk: a.chainKey,
    sendCk: b.chainKey,
    dhKeyPair: newDhKeyPair,
    dhPubSpki: newDhPubSpki,
    remoteDhPub: newRemoteDhPubSpki,
    Ns: 0,
    Nr: 0,
    PN: prevPN
    // skipped map is carried through by caller after skipping pre-step tail
  };
}

// ─────────────────────────────────────────────────────────────
// Encrypt / decrypt
// ─────────────────────────────────────────────────────────────

function totalSkipped(state) {
  return state.skipped.size;
}

function trimSkipped(state) {
  while (state.skipped.size > MAX_SKIPPED) {
    const first = state.skipped.keys().next().value;
    if (first === undefined) break;
    state.skipped.delete(first);
  }
}

async function skipRecvKeys(state, until) {
  if (state.recvCk == null) return;
  const canSkip = Math.min(MAX_SKIP_PER_STEP, until - state.Nr);
  if (canSkip < 0) throw new Error('Header.n is behind Nr — possible replay');
  if (until - state.Nr > MAX_SKIP_PER_STEP) {
    throw new Error('Too many skipped messages in one step');
  }
  const remoteKey = state.remoteDhPub ? bytesToBase64(state.remoteDhPub) : '';
  let ck = state.recvCk;
  while (state.Nr < until) {
    const { chainKey, messageKey } = await kdfCk(ck);
    state.skipped.set(`${remoteKey}|${state.Nr}`, messageKey);
    ck = chainKey;
    state.Nr += 1;
    if (totalSkipped(state) > MAX_SKIPPED) trimSkipped(state);
  }
  state.recvCk = ck;
}

/**
 * Encrypt one plaintext. Mutates a copy of state and returns the new state
 * along with the wire envelope. Plaintext may be a Uint8Array or a string
 * (it gets UTF-8 encoded). AAD binds the header to the ciphertext.
 */
export async function ratchetEncrypt(state, plaintext) {
  if (!state.sendCk) {
    throw new Error('Ratchet sendCk missing — need a DH ratchet step first');
  }
  const { chainKey, messageKey } = await kdfCk(state.sendCk);
  const nextState = { ...state, sendCk: chainKey, Ns: state.Ns + 1, skipped: state.skipped };

  const headerB64 = encodeHeader({
    dhPubSpki: state.dhPubSpki,
    n: state.Ns,
    pn: state.PN
  });

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importMessageKey(messageKey);
  const aad = new TextEncoder().encode(headerB64);
  const pt = plaintext instanceof Uint8Array
    ? plaintext
    : new TextEncoder().encode(String(plaintext));
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    pt
  );
  return {
    state: nextState,
    envelope: {
      headerB64,
      ivB64: bytesToBase64(iv),
      ctB64: bytesToBase64(new Uint8Array(ctBuf))
    }
  };
}

async function decryptWithMessageKey(messageKey, ivB64, ctB64, headerB64Aad) {
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ctB64);
  const key = await importMessageKey(messageKey);
  const aad = new TextEncoder().encode(headerB64Aad);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    ct
  );
  return new Uint8Array(ptBuf);
}

/**
 * Decrypt one wire envelope. Returns { state, plaintext } where plaintext is
 * a Uint8Array. Throws on tamper, replay, or too-many-skipped.
 */
export async function ratchetDecrypt(state, envelope) {
  const header = decodeHeader(envelope.headerB64);

  // 1. Check skipped keys first (out-of-order from an old chain).
  const remoteKey = bytesToBase64(header.dhPubSpki);
  const skKey = `${remoteKey}|${header.n}`;
  if (state.skipped.has(skKey)) {
    const mk = state.skipped.get(skKey);
    state.skipped.delete(skKey);
    const pt = await decryptWithMessageKey(mk, envelope.ivB64, envelope.ctB64, envelope.headerB64);
    return { state: { ...state }, plaintext: pt };
  }

  // 2. If the sender's DH pub changed, run a DH ratchet step.
  let next = state;
  if (!bytesEqual(state.remoteDhPub, header.dhPubSpki)) {
    // Skip tail of the outgoing receive chain up to header.pn.
    if (state.recvCk) {
      const tmp = { ...state, skipped: new Map(state.skipped) };
      await skipRecvKeys(tmp, header.pn);
      next = tmp;
    } else {
      next = { ...state, skipped: new Map(state.skipped) };
    }
    next = await dhRatchetStep(next, header.dhPubSpki);
    // Restore the skipped map (dhRatchetStep does not copy it).
    next.skipped = state.skipped;
  } else {
    next = { ...state, skipped: new Map(state.skipped) };
  }

  // 3. Skip forward within the current receive chain up to header.n.
  await skipRecvKeys(next, header.n);

  // 4. Derive the expected message key and advance the chain.
  const { chainKey, messageKey } = await kdfCk(next.recvCk);
  next.recvCk = chainKey;
  next.Nr += 1;

  const pt = await decryptWithMessageKey(messageKey, envelope.ivB64, envelope.ctB64, envelope.headerB64);
  return { state: next, plaintext: pt };
}

// ─────────────────────────────────────────────────────────────
// Wire format helpers (v2:header:iv:ct)
// ─────────────────────────────────────────────────────────────

export const WIRE_VERSION = 'v2';

export function encodeWire(envelope) {
  return `${WIRE_VERSION}:${envelope.headerB64}:${envelope.ivB64}:${envelope.ctB64}`;
}

export function decodeWire(str) {
  const s = String(str || '');
  if (!s.startsWith(`${WIRE_VERSION}:`)) return null;
  const parts = s.split(':');
  if (parts.length !== 4) return null;
  return { headerB64: parts[1], ivB64: parts[2], ctB64: parts[3] };
}

export function isWireCiphertext(value) {
  return typeof value === 'string' && value.startsWith(`${WIRE_VERSION}:`);
}
