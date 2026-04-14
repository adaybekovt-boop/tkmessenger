import { describe, expect, it } from 'vitest';
import { deriveScryptRecord, verifyScryptRecord } from '../scryptKdf.js';

describe('scryptKdf', () => {
  it('derives and verifies', async () => {
    const record = await deriveScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', params: { N: 8192, r: 8, p: 1, dkLen: 32 } });
    const ok = await verifyScryptRecord({ username: 'tamer_01', password: 'Passw0rd!!', record });
    expect(ok).toBe(true);
    const bad = await verifyScryptRecord({ username: 'tamer_01', password: 'wrong', record });
    expect(bad).toBe(false);
  });
});

