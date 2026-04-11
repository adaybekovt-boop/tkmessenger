import { base64ToBytes, bytesToBase64 } from './base64.js';

function timingSafeEqualStr(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

async function pbkdf2Bytes(password, saltBytes, iterations, lengthBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, baseKey, lengthBytes * 8);
  return new Uint8Array(bits);
}

export async function derivePasswordRecord({ nickname, password, iterations = 200000 }) {
  const nick = String(nickname || '').trim();
  const pass = String(password || '');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const it = Math.max(100000, Number(iterations) || 0);
  const keyMaterial = `${nick}:${pass}:ORBITS_P2P`;
  const bytes = await pbkdf2Bytes(keyMaterial, salt, it, 32);
  return {
    v: 1,
    saltB64: bytesToBase64(salt),
    iters: it,
    verifierB64: bytesToBase64(bytes)
  };
}

export async function verifyPasswordRecord({ nickname, password, record }) {
  if (!record) return false;
  if (record.passHash) {
    const legacy = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${nickname}:${password}:ORBITS_P2P`));
    const hex = Array.from(new Uint8Array(legacy)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return timingSafeEqualStr(hex, record.passHash);
  }
  if (record.v !== 1 || !record.saltB64 || !record.iters || !record.verifierB64) return false;
  const salt = base64ToBytes(record.saltB64);
  const it = Math.max(100000, Number(record.iters) || 0);
  const keyMaterial = `${String(nickname || '').trim()}:${String(password || '')}:ORBITS_P2P`;
  const bytes = await pbkdf2Bytes(keyMaterial, salt, it, 32);
  const verifierB64 = bytesToBase64(bytes);
  return timingSafeEqualStr(verifierB64, record.verifierB64);
}

