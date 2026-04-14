import { scrypt } from 'scrypt-js';
import { base64ToBytes, bytesToBase64 } from './base64.js';

function timingSafeEqualStr(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

export async function deriveScryptRecord({ username, password, params }) {
  const u = String(username || '').trim();
  const p = String(password || '');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const N = Math.max(8192, Number(params?.N || 16384));
  const r = Math.max(8, Number(params?.r || 8));
  const P = Math.max(1, Number(params?.p || 1));
  const dkLen = Math.max(32, Number(params?.dkLen || 32));

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(`${u}:${p}:ORBITS_P2P`);
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen);

  return {
    algo: 'scrypt',
    v: 1,
    saltB64: bytesToBase64(salt),
    N,
    r,
    p: P,
    dkLen,
    dkB64: bytesToBase64(new Uint8Array(dk))
  };
}

export async function verifyScryptRecord({ username, password, record }) {
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
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen);
  const dkB64 = bytesToBase64(new Uint8Array(dk));
  return timingSafeEqualStr(dkB64, record.dkB64);
}

