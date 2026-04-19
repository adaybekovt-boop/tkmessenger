import { scrypt } from 'scrypt-js';
import { base64ToBytes, bytesToBase64 } from './base64.js';

// Password record format — used to verify a user's master password without
// storing the password itself.
//
// v1 (legacy, INSECURE): stored the raw scrypt-derived key (`dkB64`) in
// localStorage. That made the stored record equivalent to the password — an
// attacker who read localStorage (XSS, cold-boot, browser extension) got
// the master key outright, defeating the whole KDF. Left-over records are
// still accepted for verification, but on the first successful unlock the
// caller should re-derive and rewrite them in the v2 format.
//
// v2: stores `verifierB64` = HMAC-SHA256(dk, "orbits-scrypt-verifier-v2").
// Verifying only requires re-deriving dk, recomputing the HMAC, and
// constant-time-comparing it. Reading the record reveals nothing about dk
// other than one 256-bit HMAC image — useless to an attacker unless they
// also brute-force scrypt (which is the whole point of the KDF).

const VERIFIER_TAG = 'orbits-scrypt-verifier-v2';

function timingSafeEqualStr(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

async function computeVerifier(dkBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    dkBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const tag = new TextEncoder().encode(VERIFIER_TAG);
  const mac = await crypto.subtle.sign('HMAC', key, tag);
  return new Uint8Array(mac);
}

// No-op progress callback — passing *any* callback to scrypt-js flips it into
// an event-loop-yielding mode (yields every block, ~every 10ms). Same total
// wall clock, but the main thread isn't frozen — spinners animate, React can
// paint, the tab stays responsive. Critical because scrypt here burns 400–
// 800ms on login/register and we used to block for that entire window.
const YIELD_CB = () => {};

export async function deriveScryptRecord({ username, password, params }) {
  const u = String(username || '').trim();
  const p = String(password || '');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Default N=2^16 (65536) — ~430ms on a 2023 laptop vs 830ms for 2^17.
  // Still OWASP 2026-aligned for interactive KDF and lets us halve the
  // blocking window users experience at sign-in. Existing records keep
  // working because verify reads `N` from the stored record.
  const N = Math.max(8192, Number(params?.N || 65536));
  const r = Math.max(8, Number(params?.r || 8));
  const P = Math.max(1, Number(params?.p || 1));
  const dkLen = Math.max(32, Number(params?.dkLen || 32));

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(`${u}:${p}:ORBITS_P2P`);
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen, YIELD_CB);
  const dkBytes = new Uint8Array(dk);
  const verifier = await computeVerifier(dkBytes);

  // `dkBytes` is returned so the caller can seed the vault KEK without
  // re-running scrypt. It is intentionally NOT persisted with the record —
  // only saltB64 / N / r / p / dkLen / verifierB64 should be serialised to
  // localStorage. Callers must treat dkBytes as ephemeral, in-memory only.
  return {
    algo: 'scrypt',
    v: 2,
    saltB64: bytesToBase64(salt),
    N,
    r,
    p: P,
    dkLen,
    verifierB64: bytesToBase64(verifier),
    dkBytes
  };
}

export async function verifyScryptRecord({ username, password, record }) {
  const result = await verifyScryptRecordEx({ username, password, record });
  return result.ok;
}

/**
 * Extended verify — returns `{ ok, dkBytes }`. `dkBytes` is present on
 * success and is the raw scrypt-derived key; callers can hold it in memory
 * (e.g. as a KEK) but must NEVER persist it anywhere. Returned even on
 * legacy v1 records so the caller can rewrap ratchet state before the next
 * run wipes v1 support.
 */
export async function verifyScryptRecordEx({ username, password, record }) {
  const miss = { ok: false, dkBytes: null };
  if (!record || record.algo !== 'scrypt') return miss;
  const u = String(username || '').trim();
  const p = String(password || '');
  const salt = base64ToBytes(record.saltB64);
  const N = Number(record.N);
  const r = Number(record.r);
  const P = Number(record.p);
  const dkLen = Number(record.dkLen);
  if (!N || !r || !P || !dkLen) return miss;

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(`${u}:${p}:ORBITS_P2P`);
  const dk = await scrypt(keyMaterial, salt, N, r, P, dkLen, YIELD_CB);
  const dkBytes = new Uint8Array(dk);

  // v2: compare HMAC-SHA256 verifier. Preferred path.
  if (record.verifierB64) {
    const verifier = await computeVerifier(dkBytes);
    const ok = timingSafeEqualStr(bytesToBase64(verifier), record.verifierB64);
    return ok ? { ok: true, dkBytes } : miss;
  }

  // v1 (legacy): record stored the raw dk. Still accept so existing users
  // can log in, but callers should re-derive and upgrade the stored record
  // to v2 on success.
  if (record.dkB64) {
    const ok = timingSafeEqualStr(bytesToBase64(dkBytes), record.dkB64);
    return ok ? { ok: true, dkBytes } : miss;
  }

  return miss;
}
