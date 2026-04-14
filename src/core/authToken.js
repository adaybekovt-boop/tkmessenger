import { idbDel, idbGet, idbSet } from './idbStore.js';
import { base64ToBytes, bytesToBase64 } from './base64.js';

const KEY_ID = 'auth_hmac_key_v1';
const TOKEN_ID = 'auth_token_v1';

function toBase64Url(b64) {
  return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(b64u) {
  let s = String(b64u).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  return s;
}

async function getOrCreateHmacKey() {
  const rawB64 = await idbGet(KEY_ID);
  if (rawB64) {
    const raw = base64ToBytes(fromBase64Url(rawB64));
    return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const b64u = toBase64Url(bytesToBase64(raw));
  await idbSet(KEY_ID, b64u);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function hmacSign(key, dataBytes) {
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

async function hmacVerify(key, sigBytes, dataBytes) {
  return crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
}

function encodeJson(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function decodeJson(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function issueAuthToken(payload, ttlMs) {
  const key = await getOrCreateHmacKey();
  const now = Date.now();
  const body = {
    ...payload,
    iat: now,
    exp: now + Math.max(60_000, Number(ttlMs) || 0),
    v: 1
  };
  const bodyBytes = encodeJson(body);
  const sigBytes = await hmacSign(key, bodyBytes);
  const token = `${toBase64Url(bytesToBase64(bodyBytes))}.${toBase64Url(bytesToBase64(sigBytes))}`;
  await idbSet(TOKEN_ID, token);
  return token;
}

export async function readAuthToken() {
  const token = await idbGet(TOKEN_ID);
  return token || null;
}

export async function clearAuthToken() {
  await idbDel(TOKEN_ID);
}

export async function verifyAuthToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [bodyB64u, sigB64u] = parts;
  const bodyBytes = base64ToBytes(fromBase64Url(bodyB64u));
  const sigBytes = base64ToBytes(fromBase64Url(sigB64u));
  const key = await getOrCreateHmacKey();
  const ok = await hmacVerify(key, sigBytes, bodyBytes);
  if (!ok) return null;
  const body = decodeJson(bodyBytes);
  if (!body || typeof body !== 'object') return null;
  if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
  return body;
}

