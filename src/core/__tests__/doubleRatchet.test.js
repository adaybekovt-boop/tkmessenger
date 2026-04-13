import { describe, expect, it } from 'vitest';
import {
  generateDhKeyPair,
  exportSpkiBytes,
  ratchetInitAlice,
  ratchetInitBob,
  ratchetEncrypt,
  ratchetDecrypt,
  kdfRk,
  kdfCk
} from '../doubleRatchet.js';

// Shared "initial" secret — in production this comes from ECDH(hello_a, hello_b).
function seedSecret() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = i * 7 + 3;
  return bytes;
}

function dec(u8) {
  return new TextDecoder().decode(u8);
}

async function setupAliceBob() {
  const shared = seedSecret();
  // Bob publishes his initial DH pair first; Alice derives her sending chain
  // against Bob's pub immediately.
  const bobKp = await generateDhKeyPair();
  const bobPub = await exportSpkiBytes(bobKp.publicKey);

  const aliceState = await ratchetInitAlice({ sharedSecret: shared, remoteDhPubSpki: bobPub });
  const bobState = await ratchetInitBob({
    sharedSecret: shared,
    dhKeyPair: bobKp,
    dhPubSpki: bobPub
  });
  return { aliceState, bobState };
}

describe('doubleRatchet — KDF primitives', () => {
  it('kdfCk produces distinct chain key and message key', async () => {
    const ck0 = new Uint8Array(32).fill(9);
    const { chainKey: ck1, messageKey: mk } = await kdfCk(ck0);
    expect(ck1.length).toBe(32);
    expect(mk.length).toBe(32);
    // Not equal to each other, not equal to the seed.
    let same = true;
    for (let i = 0; i < 32; i++) if (ck1[i] !== mk[i]) { same = false; break; }
    expect(same).toBe(false);
  });

  it('kdfRk mixes root key with dh output deterministically', async () => {
    const rk = new Uint8Array(32).fill(1);
    const dh = new Uint8Array(32).fill(2);
    const a = await kdfRk(rk, dh);
    const b = await kdfRk(rk, dh);
    expect(Array.from(a.rootKey)).toEqual(Array.from(b.rootKey));
    expect(Array.from(a.chainKey)).toEqual(Array.from(b.chainKey));
  });
});

describe('doubleRatchet — in-order messaging', () => {
  it('alice encrypts → bob decrypts the first message', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    const enc = await ratchetEncrypt(aliceState, 'hello bob');
    const dec1 = await ratchetDecrypt(bobState, enc.envelope);
    expect(dec(dec1.plaintext)).toBe('hello bob');
  });

  it('bob replies after receiving, alice decrypts', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    const enc1 = await ratchetEncrypt(aliceState, 'hi 1');
    const dec1 = await ratchetDecrypt(bobState, enc1.envelope);

    const enc2 = await ratchetEncrypt(dec1.state, 'hi 2 from bob');
    const dec2 = await ratchetDecrypt(enc1.state, enc2.envelope);
    expect(dec(dec2.plaintext)).toBe('hi 2 from bob');
  });

  it('long sequence in both directions', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    let a = aliceState;
    let b = bobState;
    for (let i = 0; i < 10; i++) {
      const sent = await ratchetEncrypt(a, `a${i}`);
      a = sent.state;
      const got = await ratchetDecrypt(b, sent.envelope);
      b = got.state;
      expect(dec(got.plaintext)).toBe(`a${i}`);
    }
    for (let i = 0; i < 10; i++) {
      const sent = await ratchetEncrypt(b, `b${i}`);
      b = sent.state;
      const got = await ratchetDecrypt(a, sent.envelope);
      a = got.state;
      expect(dec(got.plaintext)).toBe(`b${i}`);
    }
  });
});

describe('doubleRatchet — out-of-order delivery', () => {
  it('decrypts a later message before an earlier one (same chain)', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    const a1 = await ratchetEncrypt(aliceState, 'one');
    const a2 = await ratchetEncrypt(a1.state, 'two');
    const a3 = await ratchetEncrypt(a2.state, 'three');

    // Bob gets msg #3 first, then #1, then #2.
    const d3 = await ratchetDecrypt(bobState, a3.envelope);
    expect(dec(d3.plaintext)).toBe('three');
    const d1 = await ratchetDecrypt(d3.state, a1.envelope);
    expect(dec(d1.plaintext)).toBe('one');
    const d2 = await ratchetDecrypt(d1.state, a2.envelope);
    expect(dec(d2.plaintext)).toBe('two');
  });
});

describe('doubleRatchet — tamper detection', () => {
  it('throws when ciphertext is flipped', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    const enc = await ratchetEncrypt(aliceState, 'tamper me');
    // Flip one base64 char of the ciphertext.
    const bad = {
      ...enc.envelope,
      ctB64: enc.envelope.ctB64[0] === 'A'
        ? 'B' + enc.envelope.ctB64.slice(1)
        : 'A' + enc.envelope.ctB64.slice(1)
    };
    let threw = false;
    try {
      await ratchetDecrypt(bobState, bad);
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('throws when header is mutated', async () => {
    const { aliceState, bobState } = await setupAliceBob();
    const enc = await ratchetEncrypt(aliceState, 'binding');
    // Header is AAD, so any change invalidates the GCM tag.
    const bad = {
      ...enc.envelope,
      headerB64: enc.envelope.headerB64.slice(0, -2) + 'AA'
    };
    let threw = false;
    try {
      await ratchetDecrypt(bobState, bad);
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
