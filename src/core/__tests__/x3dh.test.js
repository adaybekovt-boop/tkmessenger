import { describe, expect, it } from 'vitest';
import {
  deriveX3DHSecret,
  initiatorX3DH,
  responderX3DH,
  generateEphemeralECDHPair,
  exportECDHPubSpki
} from '../x3dh.js';

async function genECDH() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

describe('deriveX3DHSecret', () => {
  it('returns 32 bytes', async () => {
    const dh1 = new Uint8Array(32).fill(1);
    const dh2 = new Uint8Array(32).fill(2);
    const dh3 = new Uint8Array(32).fill(3);
    const sk = await deriveX3DHSecret({ dh1, dh2, dh3 });
    expect(sk.byteLength).toBe(32);
  });

  it('is deterministic for fixed inputs', async () => {
    const dh1 = new Uint8Array(32).fill(9);
    const dh2 = new Uint8Array(32).fill(8);
    const dh3 = new Uint8Array(32).fill(7);
    const a = await deriveX3DHSecret({ dh1, dh2, dh3 });
    const b = await deriveX3DHSecret({ dh1, dh2, dh3 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('differs when dh4 is included', async () => {
    const dh1 = new Uint8Array(32).fill(1);
    const dh2 = new Uint8Array(32).fill(2);
    const dh3 = new Uint8Array(32).fill(3);
    const dh4 = new Uint8Array(32).fill(4);
    const noOpk = await deriveX3DHSecret({ dh1, dh2, dh3 });
    const withOpk = await deriveX3DHSecret({ dh1, dh2, dh3, dh4 });
    expect(Array.from(noOpk)).not.toEqual(Array.from(withOpk));
  });

  it('differs from HKDF of the same IKM without the F-prefix (domain separation)', async () => {
    const dh1 = new Uint8Array(32).fill(5);
    const dh2 = new Uint8Array(32).fill(6);
    const dh3 = new Uint8Array(32).fill(7);
    const sk = await deriveX3DHSecret({ dh1, dh2, dh3 });
    // Recompute without F: concat only.
    const ikm = new Uint8Array(96);
    ikm.set(dh1, 0); ikm.set(dh2, 32); ikm.set(dh3, 64);
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const raw = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('orbits-x3dh-v1') },
        k,
        256
      )
    );
    expect(Array.from(sk)).not.toEqual(Array.from(raw));
  });
});

describe('X3DH round-trip', () => {
  it('initiator and responder derive the same SK (without OPK)', async () => {
    const IK_a = await genECDH();
    const IK_b = await genECDH();
    const SPK_b = await genECDH();
    const EK_a = await generateEphemeralECDHPair();

    const IK_a_spki = await exportECDHPubSpki(IK_a.publicKey);
    const IK_b_spki = await exportECDHPubSpki(IK_b.publicKey);
    const SPK_b_spki = await exportECDHPubSpki(SPK_b.publicKey);
    const EK_a_spki = await exportECDHPubSpki(EK_a.publicKey);

    const alice = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a.privateKey,
      IK_b_spki,
      SPK_b_spki
    });
    const bob = await responderX3DH({
      SPK_b_priv: SPK_b.privateKey,
      IK_b_priv: IK_b.privateKey,
      IK_a_spki,
      EK_a_spki
    });

    expect(alice.sk.byteLength).toBe(32);
    expect(Array.from(alice.sk)).toEqual(Array.from(bob.sk));
    expect(alice.usedOpk).toBe(false);
    expect(bob.usedOpk).toBe(false);
  });

  it('initiator and responder derive the same SK (with OPK)', async () => {
    const IK_a = await genECDH();
    const IK_b = await genECDH();
    const SPK_b = await genECDH();
    const OPK_b = await genECDH();
    const EK_a = await generateEphemeralECDHPair();

    const IK_a_spki = await exportECDHPubSpki(IK_a.publicKey);
    const IK_b_spki = await exportECDHPubSpki(IK_b.publicKey);
    const SPK_b_spki = await exportECDHPubSpki(SPK_b.publicKey);
    const OPK_b_spki = await exportECDHPubSpki(OPK_b.publicKey);
    const EK_a_spki = await exportECDHPubSpki(EK_a.publicKey);

    const alice = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a.privateKey,
      IK_b_spki,
      SPK_b_spki,
      OPK_b_spki
    });
    const bob = await responderX3DH({
      SPK_b_priv: SPK_b.privateKey,
      IK_b_priv: IK_b.privateKey,
      OPK_b_priv: OPK_b.privateKey,
      IK_a_spki,
      EK_a_spki
    });

    expect(Array.from(alice.sk)).toEqual(Array.from(bob.sk));
    expect(alice.usedOpk).toBe(true);
    expect(bob.usedOpk).toBe(true);
  });

  it('SK with OPK differs from SK without OPK (same long-term keys)', async () => {
    const IK_a = await genECDH();
    const IK_b = await genECDH();
    const SPK_b = await genECDH();
    const OPK_b = await genECDH();
    const EK_a = await generateEphemeralECDHPair();

    const IK_b_spki = await exportECDHPubSpki(IK_b.publicKey);
    const SPK_b_spki = await exportECDHPubSpki(SPK_b.publicKey);
    const OPK_b_spki = await exportECDHPubSpki(OPK_b.publicKey);

    const noOpk = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a.privateKey,
      IK_b_spki,
      SPK_b_spki
    });
    const withOpk = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a.privateKey,
      IK_b_spki,
      SPK_b_spki,
      OPK_b_spki
    });

    expect(Array.from(noOpk.sk)).not.toEqual(Array.from(withOpk.sk));
  });

  it('responder with wrong SPK private derives a different SK (fails silently, not throws)', async () => {
    const IK_a = await genECDH();
    const IK_b = await genECDH();
    const SPK_b = await genECDH();
    const SPK_b_wrong = await genECDH();
    const EK_a = await generateEphemeralECDHPair();

    const IK_a_spki = await exportECDHPubSpki(IK_a.publicKey);
    const IK_b_spki = await exportECDHPubSpki(IK_b.publicKey);
    const SPK_b_spki = await exportECDHPubSpki(SPK_b.publicKey);
    const EK_a_spki = await exportECDHPubSpki(EK_a.publicKey);

    const alice = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a.privateKey,
      IK_b_spki,
      SPK_b_spki
    });
    const bob = await responderX3DH({
      SPK_b_priv: SPK_b_wrong.privateKey,
      IK_b_priv: IK_b.privateKey,
      IK_a_spki,
      EK_a_spki
    });

    expect(Array.from(alice.sk)).not.toEqual(Array.from(bob.sk));
  });

  it('different ephemeral keys give different SKs even with same long-term keys', async () => {
    const IK_a = await genECDH();
    const IK_b = await genECDH();
    const SPK_b = await genECDH();
    const EK_a1 = await generateEphemeralECDHPair();
    const EK_a2 = await generateEphemeralECDHPair();

    const IK_b_spki = await exportECDHPubSpki(IK_b.publicKey);
    const SPK_b_spki = await exportECDHPubSpki(SPK_b.publicKey);

    const s1 = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a1.privateKey,
      IK_b_spki,
      SPK_b_spki
    });
    const s2 = await initiatorX3DH({
      IK_a_priv: IK_a.privateKey,
      EK_a_priv: EK_a2.privateKey,
      IK_b_spki,
      SPK_b_spki
    });

    expect(Array.from(s1.sk)).not.toEqual(Array.from(s2.sk));
  });
});
