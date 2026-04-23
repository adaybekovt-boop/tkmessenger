import { beforeEach, describe, expect, it } from 'vitest';
import { getPin, setPin, deletePin, checkPin, pubSpkiBytesFromPin } from '../peerPins.js';
import { computeFingerprint } from '../identityKey.js';

const PEER_A = 'ORBIT-AAA111';
const PEER_B = 'ORBIT-BBB222';

const keyA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const keyA2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]); // rotated / MITM
const keyB = new Uint8Array([10, 20, 30, 40]);

beforeEach(async () => {
  // fake-indexeddb persists across tests in one file; clean slate per test.
  await deletePin(PEER_A);
  await deletePin(PEER_B);
});

describe('getPin', () => {
  it('returns null when no pin exists', async () => {
    expect(await getPin(PEER_A)).toBeNull();
  });

  it('returns null when peerId is falsy', async () => {
    expect(await getPin('')).toBeNull();
    expect(await getPin(null)).toBeNull();
  });
});

describe('setPin', () => {
  it('stores a pin with computed fingerprint and retrievable bytes', async () => {
    const { fingerprint } = await setPin(PEER_A, keyA);
    const expected = await computeFingerprint(keyA);
    expect(fingerprint).toBe(expected);

    const pin = await getPin(PEER_A);
    expect(pin).not.toBeNull();
    expect(pin.peerId).toBe(PEER_A);
    expect(pin.fingerprint).toBe(expected);
    expect(typeof pin.pinnedAt).toBe('number');
    expect(pin.pinnedAt).toBeGreaterThan(0);

    const bytes = pubSpkiBytesFromPin(pin);
    expect(Array.from(bytes)).toEqual(Array.from(keyA));
  });

  it('throws when inputs are missing', async () => {
    await expect(setPin('', keyA)).rejects.toThrow();
    await expect(setPin(PEER_A, null)).rejects.toThrow();
  });

  it('overwrites a prior pin when explicitly called (no auto-protection)', async () => {
    await setPin(PEER_A, keyA);
    await setPin(PEER_A, keyA2);
    const pin = await getPin(PEER_A);
    const expected = await computeFingerprint(keyA2);
    expect(pin.fingerprint).toBe(expected);
  });
});

describe('deletePin', () => {
  it('removes the stored pin', async () => {
    await setPin(PEER_A, keyA);
    expect(await getPin(PEER_A)).not.toBeNull();
    await deletePin(PEER_A);
    expect(await getPin(PEER_A)).toBeNull();
  });

  it('no-ops on missing peerId', async () => {
    expect(await deletePin('')).toBe(false);
  });
});

describe('checkPin', () => {
  it('returns "new" when no pin exists', async () => {
    const r = await checkPin(PEER_A, keyA);
    expect(r.status).toBe('new');
    expect(r.fingerprint).toBe(await computeFingerprint(keyA));
  });

  it('returns "pinned" when the remote key matches the stored pin', async () => {
    await setPin(PEER_A, keyA);
    const r = await checkPin(PEER_A, keyA);
    expect(r.status).toBe('pinned');
    expect(r.fingerprint).toBe(await computeFingerprint(keyA));
  });

  it('returns "mismatch" when the remote key differs from the stored pin', async () => {
    await setPin(PEER_A, keyA);
    const r = await checkPin(PEER_A, keyA2);
    expect(r.status).toBe('mismatch');
    expect(r.fingerprint).toBe(await computeFingerprint(keyA2));
    expect(r.expected).toBe(await computeFingerprint(keyA));
  });

  it('scopes pins per peer', async () => {
    await setPin(PEER_A, keyA);
    const r = await checkPin(PEER_B, keyB);
    expect(r.status).toBe('new');
  });
});

describe('pubSpkiBytesFromPin', () => {
  it('returns null for null/empty', () => {
    expect(pubSpkiBytesFromPin(null)).toBeNull();
    expect(pubSpkiBytesFromPin({})).toBeNull();
  });
});
