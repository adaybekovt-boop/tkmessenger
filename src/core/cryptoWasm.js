// cryptoWasm.js — JS обёртка для Rust крипто-ядра (WASM).
//
// Предоставляет единый API для:
//   - SHA-256 (строки, буферы)
//   - PBKDF2-SHA256
//   - AES-256-GCM (encrypt/decrypt с ключом)
//   - Scrypt KDF
//   - HMAC-SHA256 (sign/verify)
//   - Timing-safe compare
//
// Пытается использовать WASM; если недоступен — fallback на
// существующий JS (crypto.js, scryptKdf.js, authToken.js).

import { bytesToBase64, base64ToBytes } from './base64.js';
import { loadWasm, isWasmAvailable } from './ratchetWasm.js';

let wasmMod = null;

async function getWasm() {
  if (wasmMod) return wasmMod;
  const ok = await loadWasm();
  if (!ok) return null;
  try {
    const mod = await import('../../pkg/orbits_crypto.js');
    wasmMod = mod;
    return mod;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// SHA-256
// ─────────────────────────────────────────────────────────────

export async function sha256Hex(str) {
  const w = await getWasm();
  if (w?.sha256Hex) {
    return w.sha256Hex(str);
  }
  // JS fallback
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexBuffer(arrayBuffer) {
  const w = await getWasm();
  if (w?.sha256HexBuffer) {
    const b64 = bytesToBase64(new Uint8Array(arrayBuffer));
    return w.sha256HexBuffer(b64);
  }
  // JS fallback
  const buf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────
// PBKDF2
// ─────────────────────────────────────────────────────────────

export async function pbkdf2Bytes(password, saltB64, iterations, lengthBytes = 32) {
  const w = await getWasm();
  if (w?.pbkdf2Derive) {
    const dkB64 = w.pbkdf2Derive(password, saltB64, iterations, lengthBytes);
    return dkB64; // base64 string
  }
  // JS fallback
  const enc = new TextEncoder();
  const saltBytes = base64ToBytes(saltB64);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, baseKey, lengthBytes * 8);
  return bytesToBase64(new Uint8Array(bits));
}

// ─────────────────────────────────────────────────────────────
// AES-256-GCM (with raw key)
// ─────────────────────────────────────────────────────────────

export async function aesGcmEncryptWithKey(keyB64, plaintext) {
  const w = await getWasm();
  if (w?.aesGcmEncryptKey) {
    return w.aesGcmEncryptKey(keyB64, plaintext);
  }
  // JS fallback
  const keyBytes = base64ToBytes(keyB64);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function aesGcmDecryptWithKey(keyB64, encStr) {
  const w = await getWasm();
  if (w?.aesGcmDecryptKey) {
    return w.aesGcmDecryptKey(keyB64, encStr);
  }
  // JS fallback
  const [ivB64, dataB64] = String(encStr || '').split(':');
  const keyBytes = base64ToBytes(keyB64);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(dataB64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ─────────────────────────────────────────────────────────────
// Scrypt KDF
// ─────────────────────────────────────────────────────────────

export async function scryptDerive({ username, password, params }) {
  const u = String(username || '').trim();
  const p = String(password || '');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const N = Math.max(8192, Number(params?.N || 16384));
  const r = Math.max(8, Number(params?.r || 8));
  const P = Math.max(1, Number(params?.p || 1));
  const dkLen = Math.max(32, Number(params?.dkLen || 32));

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(`${u}:${p}:ORBITS_P2P`);

  const w = await getWasm();
  if (w?.scryptDerive) {
    const logN = Math.round(Math.log2(N));
    const kmB64 = bytesToBase64(keyMaterial);
    const saltB64 = bytesToBase64(salt);
    const dkB64 = w.scryptDerive(kmB64, saltB64, logN, r, P, dkLen);
    return {
      algo: 'scrypt', v: 1,
      saltB64: bytesToBase64(salt),
      N, r, p: P, dkLen,
      dkB64
    };
  }

  // JS fallback
  const { scrypt } = await import('scrypt-js');
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen);
  return {
    algo: 'scrypt', v: 1,
    saltB64: bytesToBase64(salt),
    N, r, p: P, dkLen,
    dkB64: bytesToBase64(new Uint8Array(dk))
  };
}

export async function scryptVerify({ username, password, record }) {
  if (!record || record.algo !== 'scrypt') return false;
  const u = String(username || '').trim();
  const p = String(password || '');
  const salt = base64ToBytes(record.saltB64);
  const N = Number(record.N);
  const r = Number(record.r);
  const P = Number(record.p);
  const dkLen = Number(record.dkLen);
  if (!N || !r || !P || !dkLen) return false;

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(`${u}:${p}:ORBITS_P2P`);

  const w = await getWasm();
  if (w?.scryptDerive && w?.timingSafeEqual) {
    const logN = Math.round(Math.log2(N));
    const kmB64 = bytesToBase64(keyMaterial);
    const saltB64 = bytesToBase64(salt);
    const dkB64 = w.scryptDerive(kmB64, saltB64, logN, r, P, dkLen);
    return w.timingSafeEqual(dkB64, record.dkB64);
  }

  // JS fallback
  const { scrypt } = await import('scrypt-js');
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen);
  const dkB64 = bytesToBase64(new Uint8Array(dk));
  return timingSafeEqualStr(dkB64, record.dkB64);
}

function timingSafeEqualStr(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

// ─────────────────────────────────────────────────────────────
// HMAC-SHA256
// ─────────────────────────────────────────────────────────────

export async function hmacSign(keyB64, dataB64) {
  const w = await getWasm();
  if (w?.hmacSign) {
    return w.hmacSign(keyB64, dataB64);
  }
  // JS fallback
  const key = await crypto.subtle.importKey('raw', base64ToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, base64ToBytes(dataB64));
  return bytesToBase64(new Uint8Array(sig));
}

export async function hmacVerify(keyB64, signatureB64, dataB64) {
  const w = await getWasm();
  if (w?.hmacVerify) {
    return w.hmacVerify(keyB64, signatureB64, dataB64);
  }
  // JS fallback
  const key = await crypto.subtle.importKey('raw', base64ToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, base64ToBytes(signatureB64), base64ToBytes(dataB64));
}
