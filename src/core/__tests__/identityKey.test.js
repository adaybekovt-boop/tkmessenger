import { beforeEach, describe, expect, it } from 'vitest';
import {
  getOrCreateSigningKey,
  exportIdentityPubSpki,
  computeFingerprint,
  getLocalIdentityFingerprint,
  shortFingerprint,
  signBytes,
  verifyWithRemoteSpki,
  buildSignedHelloBlob,
  __resetCacheForTests
} from '../identityKey.js';

// fake-indexeddb is reset per test file via vitest.setup.js side-effects +
// structured-clone via the shim. But CryptoKey structured-clone through
// fake-indexeddb is unreliable across environments, so most tests below
// avoid round-tripping through IDB and rely on the in-memory cache only.
beforeEach(() => {
  __resetCacheForTests();
});

describe('getOrCreateSigningKey', () => {
  it('returns a usable ECDSA key pair with non-extractable private half', async () => {
    const pair = await getOrCreateSigningKey();
    expect(pair.privateKey).toBeDefined();
    expect(pair.publicKey).toBeDefined();
    expect(pair.privateKey.algorithm.name).toBe('ECDSA');
    expect(pair.publicKey.algorithm.name).toBe('ECDSA');
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.publicKey.extractable).toBe(true);
  });

  it('returns the cached pair on subsequent calls in one process', async () => {
    const a = await getOrCreateSigningKey();
    const b = await getOrCreateSigningKey();
    expect(b).toBe(a);
  });
});

describe('exportIdentityPubSpki', () => {
  it('returns a non-empty Uint8Array', async () => {
    const spki = await exportIdentityPubSpki();
    expect(spki).toBeInstanceOf(Uint8Array);
    expect(spki.length).toBeGreaterThan(0);
  });

  it('caches the export', async () => {
    const a = await exportIdentityPubSpki();
    const b = await exportIdentityPubSpki();
    expect(b).toBe(a);
  });
});

describe('computeFingerprint', () => {
  it('returns 64 lowercase hex chars (SHA-256)', async () => {
    const fp = await computeFingerprint(new Uint8Array([1, 2, 3]));
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for identical input', async () => {
    const a = await computeFingerprint(new Uint8Array([1, 2, 3, 4]));
    const b = await computeFingerprint(new Uint8Array([1, 2, 3, 4]));
    expect(a).toBe(b);
  });

  it('differs for different input', async () => {
    const a = await computeFingerprint(new Uint8Array([1, 2, 3, 4]));
    const b = await computeFingerprint(new Uint8Array([1, 2, 3, 5]));
    expect(a).not.toBe(b);
  });
});

describe('getLocalIdentityFingerprint', () => {
  it('matches computeFingerprint(exportIdentityPubSpki())', async () => {
    const spki = await exportIdentityPubSpki();
    const direct = await computeFingerprint(spki);
    const cached = await getLocalIdentityFingerprint();
    expect(cached).toBe(direct);
  });
});

describe('shortFingerprint', () => {
  it('slices to 16 chars', () => {
    const fp = 'a'.repeat(64);
    expect(shortFingerprint(fp)).toBe('a'.repeat(16));
  });

  it('handles null / undefined safely', () => {
    expect(shortFingerprint(null)).toBe('');
    expect(shortFingerprint(undefined)).toBe('');
  });
});

describe('signBytes + verifyWithRemoteSpki round-trip', () => {
  it('verifies a signature produced by the local key against the exported SPKI', async () => {
    const data = new TextEncoder().encode('hello orbits');
    const sig = await signBytes(data);
    const spki = await exportIdentityPubSpki();
    const ok = await verifyWithRemoteSpki(spki, data, sig);
    expect(ok).toBe(true);
  });

  it('rejects a signature when the data is tampered', async () => {
    const data = new TextEncoder().encode('hello orbits');
    const sig = await signBytes(data);
    const spki = await exportIdentityPubSpki();
    const tampered = new TextEncoder().encode('hello orbitz');
    const ok = await verifyWithRemoteSpki(spki, tampered, sig);
    expect(ok).toBe(false);
  });

  it('rejects a signature when the signature is tampered', async () => {
    const data = new TextEncoder().encode('x');
    const sig = await signBytes(data);
    const spki = await exportIdentityPubSpki();
    const bad = new Uint8Array(sig);
    bad[0] ^= 0xff;
    const ok = await verifyWithRemoteSpki(spki, data, bad);
    expect(ok).toBe(false);
  });

  it('returns false (does not throw) on malformed SPKI', async () => {
    const data = new TextEncoder().encode('x');
    const sig = await signBytes(data);
    const ok = await verifyWithRemoteSpki(new Uint8Array([1, 2, 3]), data, sig);
    expect(ok).toBe(false);
  });

  it('returns false on missing inputs', async () => {
    expect(await verifyWithRemoteSpki(null, new Uint8Array(1), new Uint8Array(1))).toBe(false);
    expect(await verifyWithRemoteSpki(new Uint8Array(1), null, new Uint8Array(1))).toBe(false);
    expect(await verifyWithRemoteSpki(new Uint8Array(1), new Uint8Array(1), null)).toBe(false);
  });
});

describe('buildSignedHelloBlob', () => {
  const sample = {
    senderPeerId: 'ORBIT-AAA',
    receiverPeerId: 'ORBIT-BBB',
    senderDhSpki: new Uint8Array([1, 2, 3]),
    senderIdSpki: new Uint8Array([4, 5, 6])
  };

  it('returns deterministic bytes for identical inputs', () => {
    const a = buildSignedHelloBlob(sample);
    const b = buildSignedHelloBlob(sample);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('starts with the v3 protocol tag', () => {
    const blob = buildSignedHelloBlob(sample);
    const s = new TextDecoder().decode(blob);
    expect(s.startsWith('orbits-wire-v3\n')).toBe(true);
  });

  it('differs when sender / receiver are swapped (replay protection)', () => {
    const a = buildSignedHelloBlob(sample);
    const b = buildSignedHelloBlob({
      ...sample,
      senderPeerId: sample.receiverPeerId,
      receiverPeerId: sample.senderPeerId
    });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('differs when DH SPKI differs', () => {
    const a = buildSignedHelloBlob(sample);
    const b = buildSignedHelloBlob({ ...sample, senderDhSpki: new Uint8Array([9, 9, 9]) });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('differs when ID SPKI differs', () => {
    const a = buildSignedHelloBlob(sample);
    const b = buildSignedHelloBlob({ ...sample, senderIdSpki: new Uint8Array([9, 9, 9]) });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});
