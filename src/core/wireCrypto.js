import { base64ToBytes, bytesToBase64 } from './base64.js';

const ORBIT_WIRE_VERSION = 2;
const ORBIT_WIRE_SALT_TAG = 'orbits-wire-v2';

const sessions = new Map();

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesLexCompare(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

async function sha256Bytes(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

async function sha256Hex(bytes) {
  const digest = await sha256Bytes(bytes);
  return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateEcdhKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function exportSpki(publicKey) {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(spki);
}

async function importRemoteSpki(spkiBytes) {
  return crypto.subtle.importKey(
    'spki',
    spkiBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function deriveAesKeyFromSharedSecret(sharedSecretBytes, saltBytes, infoBytes) {
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecretBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      localKeyPair: null,
      localSpki: null,
      remoteSpki: null,
      key: null,
      ready: null,
      readyResolve: null,
      readyReject: null,
      fingerprint: null
    });
  }
  return sessions.get(chatId);
}

async function ensureLocal(chatId) {
  const s = getSession(chatId);
  if (!s.ready) {
    s.ready = new Promise((resolve, reject) => {
      s.readyResolve = resolve;
      s.readyReject = reject;
    });
  }
  if (!s.localKeyPair) {
    s.localKeyPair = await generateEcdhKeyPair();
    s.localSpki = await exportSpki(s.localKeyPair.publicKey);
  }
  return s;
}

async function tryFinalize(chatId) {
  const s = getSession(chatId);
  if (!s.localKeyPair || !s.localSpki || !s.remoteSpki || s.key) return s;

  const remoteKey = await importRemoteSpki(s.remoteSpki);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteKey },
    s.localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const [a, b] = bytesLexCompare(s.localSpki, s.remoteSpki) <= 0 ? [s.localSpki, s.remoteSpki] : [s.remoteSpki, s.localSpki];
  const transcript = concatBytes(a, b);
  const salt = await sha256Bytes(concatBytes(new TextEncoder().encode(ORBIT_WIRE_SALT_TAG), transcript));
  const info = concatBytes(new TextEncoder().encode(`${ORBIT_WIRE_SALT_TAG}|${chatId}|v${ORBIT_WIRE_VERSION}|`), transcript);

  s.key = await deriveAesKeyFromSharedSecret(sharedSecret, salt, info);
  s.fingerprint = await sha256Hex(transcript);
  s.readyResolve?.({ fingerprint: s.fingerprint, version: ORBIT_WIRE_VERSION });
  return s;
}

export async function initWireSession(chatId) {
  const s = await ensureLocal(chatId);
  return { version: ORBIT_WIRE_VERSION, pubB64: bytesToBase64(s.localSpki) };
}

export async function acceptWireHello(chatId, remotePubB64) {
  const s = await ensureLocal(chatId);
  s.remoteSpki = base64ToBytes(String(remotePubB64 || ''));
  await tryFinalize(chatId);
  return s.ready;
}

export function getWireSessionStatus(chatId) {
  const s = sessions.get(chatId);
  return { ready: !!s?.key, fingerprint: s?.fingerprint || null, version: ORBIT_WIRE_VERSION };
}

export function waitForWireReady(chatId) {
  const s = sessions.get(chatId);
  if (!s?.ready) return Promise.reject(new Error('Wire session not initialized'));
  return s.ready;
}

export function teardownWireSession(chatId) {
  sessions.delete(chatId);
}

export async function encryptWirePayload(chatId, obj) {
  const s = getSession(chatId);
  if (!s.key) throw new Error('Wire key not ready');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const aad = new TextEncoder().encode(chatId);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, s.key, data);
  const ivB64 = bytesToBase64(iv);
  const ctB64 = bytesToBase64(new Uint8Array(encrypted));
  return `v${ORBIT_WIRE_VERSION}:${ivB64}:${ctB64}`;
}

export async function decryptWirePayload(chatId, encStr) {
  const s = getSession(chatId);
  if (!s.key) throw new Error('Wire key not ready');
  const parts = String(encStr || '').split(':');
  if (parts.length !== 3 || !parts[0].startsWith('v')) throw new Error('Bad wire payload');
  const iv = base64ToBytes(parts[1]);
  const ct = base64ToBytes(parts[2]);
  const aad = new TextEncoder().encode(chatId);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, s.key, ct);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
