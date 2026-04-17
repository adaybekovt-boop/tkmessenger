import { afterEach, describe, expect, it } from 'vitest';
import { setVaultKek, clearVaultKek, hasVaultKek, wrapBytes, unwrapBytes, isWrapped } from '../vaultKek.js';

afterEach(() => {
  clearVaultKek();
});

describe('vaultKek', () => {
  it('has no KEK before setVaultKek', () => {
    expect(hasVaultKek()).toBe(false);
  });

  it('sets and clears the KEK', async () => {
    const kek = new Uint8Array(32).fill(7);
    await setVaultKek(kek);
    expect(hasVaultKek()).toBe(true);
    clearVaultKek();
    expect(hasVaultKek()).toBe(false);
  });

  it('rejects KEKs shorter than 32 bytes', async () => {
    await expect(setVaultKek(new Uint8Array(16))).rejects.toThrow();
  });

  it('wrapBytes returns plaintext unchanged when no KEK is set', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const out = await wrapBytes(data);
    expect(out).toBe(data);
  });

  it('wrapBytes produces the orb-wrap-v1 string when KEK is set', async () => {
    const kek = new Uint8Array(32).fill(1);
    await setVaultKek(kek);
    const data = new Uint8Array([9, 8, 7, 6, 5]);
    const wrapped = await wrapBytes(data);
    expect(typeof wrapped).toBe('string');
    expect(wrapped.startsWith('orb-wrap-v1:')).toBe(true);
    expect(isWrapped(wrapped)).toBe(true);
  });

  it('round-trips bytes through wrap+unwrap', async () => {
    const kek = new Uint8Array(32).fill(42);
    await setVaultKek(kek);
    const data = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const wrapped = await wrapBytes(data);
    const unwrapped = await unwrapBytes(wrapped);
    expect(Array.from(unwrapped)).toEqual(Array.from(data));
  });

  it('produces different ciphertexts for the same plaintext (fresh IV each call)', async () => {
    const kek = new Uint8Array(32).fill(7);
    await setVaultKek(kek);
    const data = new Uint8Array([1, 2, 3, 4]);
    const a = await wrapBytes(data);
    const b = await wrapBytes(data);
    expect(a).not.toBe(b);
  });

  it('unwrap throws when vault is locked', async () => {
    const kek = new Uint8Array(32).fill(5);
    await setVaultKek(kek);
    const wrapped = await wrapBytes(new Uint8Array([1, 2, 3]));
    clearVaultKek();
    await expect(unwrapBytes(wrapped)).rejects.toThrow(/locked/);
  });

  it('unwrap passes non-wrapped values through unchanged (legacy Uint8Array rows)', async () => {
    const raw = new Uint8Array([1, 2, 3]);
    const out = await unwrapBytes(raw);
    expect(out).toBe(raw);
  });

  it('unwrap with a different KEK fails authentication', async () => {
    await setVaultKek(new Uint8Array(32).fill(1));
    const wrapped = await wrapBytes(new Uint8Array([1, 2, 3]));
    await setVaultKek(new Uint8Array(32).fill(2));
    await expect(unwrapBytes(wrapped)).rejects.toThrow();
  });
});
