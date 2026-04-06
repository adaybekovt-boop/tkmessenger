import { describe, expect, it } from 'vitest';
import { derivePasswordRecord, verifyPasswordRecord } from '../passwordKdf.js';

describe('passwordKdf', () => {
  it('verifies derived record', async () => {
    const record = await derivePasswordRecord({ nickname: 'Tamer', password: 'pass1234', iterations: 100000 });
    const ok = await verifyPasswordRecord({ nickname: 'Tamer', password: 'pass1234', record });
    expect(ok).toBe(true);
    const bad = await verifyPasswordRecord({ nickname: 'Tamer', password: 'wrong', record });
    expect(bad).toBe(false);
  });
});

