import { describe, expect, it } from 'vitest';
import { clearAuthToken, issueAuthToken, readAuthToken, verifyAuthToken } from '../authToken.js';

describe('authToken', () => {
  it('issues and verifies token', async () => {
    await clearAuthToken();
    await issueAuthToken({ nickname: 'Tamer', peerId: 'TAMER-AAAA' }, 60_000);
    const token = await readAuthToken();
    expect(typeof token).toBe('string');
    const body = await verifyAuthToken(token);
    expect(body.nickname).toBe('Tamer');
    expect(body.peerId).toBe('TAMER-AAAA');
  });
});

