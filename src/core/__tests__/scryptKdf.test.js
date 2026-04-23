import { describe, expect, it } from 'vitest';
import { scrypt } from 'scrypt-js';
import { deriveScryptRecord, verifyScryptRecord } from '../scryptKdf.js';
import { bytesToBase64 } from '../base64.js';

const fastParams = { N: 8192, r: 8, p: 1, dkLen: 32 };

describe('scryptKdf v2', () => {
  it('derives and verifies a correct password', async () => {
    const record = await deriveScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', params: fastParams });
    const ok = await verifyScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', record });
    expect(ok).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const record = await deriveScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', params: fastParams });
    const bad = await verifyScryptRecord({ username: 'tamer_01', password: 'wrong', record });
    expect(bad).toBe(false);
  });

  it('rejects a wrong username', async () => {
    const record = await deriveScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', params: fastParams });
    const bad = await verifyScryptRecord({ username: 'other', password: 'Passw0rd!!', record });
    expect(bad).toBe(false);
  });

  it('stores a verifier (HMAC image), never the raw derived key', async () => {
    const record = await deriveScryptRecord({ username: 'u', password: 'p', params: fastParams });
    expect(record.v).toBe(2);
    expect(typeof record.verifierB64).toBe('string');
    expect(record.verifierB64.length).toBeGreaterThan(0);
    expect(record.dkB64).toBeUndefined();
  });

  it('two records for the same password have different salt + verifier', async () => {
    const a = await deriveScryptRecord({ username: 'u', password: 'p', params: fastParams });
    const b = await deriveScryptRecord({ username: 'u', password: 'p', params: fastParams });
    expect(a.saltB64).not.toBe(b.saltB64);
    expect(a.verifierB64).not.toBe(b.verifierB64);
  });
});

describe('scryptKdf legacy v1 compatibility', () => {
  async function buildLegacyV1({ username, password }) {
    // Reproduce what the old (insecure) format looked like — raw dk in
    // dkB64. New verifyScryptRecord must still accept this so users with
    // stored v1 profiles can still unlock.
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const km = new TextEncoder().encode(`${username}:${password}:ORBITS_P2P`);
    const dk = await scrypt(km, salt, fastParams.N, fastParams.r, fastParams.p, fastParams.dkLen);
    return {
      algo: 'scrypt',
      v: 1,
      saltB64: bytesToBase64(salt),
      N: fastParams.N,
      r: fastParams.r,
      p: fastParams.p,
      dkLen: fastParams.dkLen,
      dkB64: bytesToBase64(new Uint8Array(dk))
    };
  }

  it('verifies a legacy v1 record with the correct password', async () => {
    const rec = await buildLegacyV1({ username: 'leg', password: 'oldpass' });
    const ok = await verifyScryptRecord({ username: 'leg', password: 'oldpass', record: rec });
    expect(ok).toBe(true);
  });

  it('rejects a legacy v1 record with wrong password', async () => {
    const rec = await buildLegacyV1({ username: 'leg', password: 'oldpass' });
    const bad = await verifyScryptRecord({ username: 'leg', password: 'nope', record: rec });
    expect(bad).toBe(false);
  });

  it('rejects a record with neither verifier nor dkB64', async () => {
    const rec = {
      algo: 'scrypt', v: 99,
      saltB64: bytesToBase64(new Uint8Array(16)),
      N: fastParams.N, r: fastParams.r, p: fastParams.p, dkLen: fastParams.dkLen
    };
    const bad = await verifyScryptRecord({ username: 'x', password: 'y', record: rec });
    expect(bad).toBe(false);
  });
});

