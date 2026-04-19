import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildLocalBundle,
  serializeBundle,
  parseBundle,
  verifyRemoteBundle,
  BUNDLE_VERSION
} from '../prekeyBundle.js';
import {
  __resetCacheForTests,
  getOrCreateSigningKey,
  getOrCreateX3DHIdentity,
  verifyX3DHBinding,
  exportIdentityPubSpki,
  exportX3DHIdentityPubSpki
} from '../identityKey.js';

async function wipeKeysAndPrekeys() {
  const { openDatabase } = await import('../db.js');
  const db = await openDatabase();
  const tx = db.transaction(['keys', 'prekeys'], 'readwrite');
  await tx.objectStore('keys').clear();
  await tx.objectStore('prekeys').clear();
  await tx.done;
}

beforeEach(async () => {
  __resetCacheForTests();
  await wipeKeysAndPrekeys();
});

describe('ECDH identity + binding', () => {
  it('getOrCreateX3DHIdentity returns a valid binding signature', async () => {
    const ecdh = await getOrCreateX3DHIdentity();
    expect(ecdh.privateKey).toBeDefined();
    expect(ecdh.bindingSig?.byteLength).toBeGreaterThan(0);

    const identitySpki = await exportIdentityPubSpki();
    const x3dhSpki = await exportX3DHIdentityPubSpki();
    const ok = await verifyX3DHBinding(identitySpki, x3dhSpki, ecdh.bindingSig);
    expect(ok).toBe(true);
  });

  it('verifyX3DHBinding rejects a forged binding', async () => {
    await getOrCreateX3DHIdentity();
    const identitySpki = await exportIdentityPubSpki();
    const x3dhSpki = await exportX3DHIdentityPubSpki();

    const forged = new Uint8Array(64);
    crypto.getRandomValues(forged);
    const ok = await verifyX3DHBinding(identitySpki, x3dhSpki, forged);
    expect(ok).toBe(false);
  });

  it('binding does not cross-verify with a different ECDSA identity', async () => {
    await getOrCreateSigningKey();
    const ecdh = await getOrCreateX3DHIdentity();
    const x3dhSpki = await exportX3DHIdentityPubSpki();

    // Swap in a different identity by wiping the ECDSA half and regenerating.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    await db.delete('keys', 'identity-signing-v1');
    __resetCacheForTests();
    await getOrCreateSigningKey();
    const otherIdentitySpki = await exportIdentityPubSpki();

    const ok = await verifyX3DHBinding(otherIdentitySpki, x3dhSpki, ecdh.bindingSig);
    expect(ok).toBe(false);
  });
});

describe('buildLocalBundle', () => {
  it('returns a bundle with identity, SPK, and OPK', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    expect(bundle.v).toBe(BUNDLE_VERSION);
    expect(bundle.peerId).toBe('ORBIT-AAAA');
    expect(bundle.identitySpki.byteLength).toBeGreaterThan(0);
    expect(bundle.x3dhIdentitySpki.byteLength).toBeGreaterThan(0);
    expect(bundle.x3dhIdentitySig.byteLength).toBeGreaterThan(0);
    expect(bundle.spk.id).toMatch(/^spk-/);
    expect(bundle.spk.pub.byteLength).toBeGreaterThan(0);
    expect(bundle.spk.sig.byteLength).toBeGreaterThan(0);
    expect(bundle.opk).not.toBeNull();
    expect(bundle.opk.id).toMatch(/^opk-/);
    expect(bundle.opk.pub.byteLength).toBeGreaterThan(0);
  });

  it('omits OPK when includeOpk is false', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA', includeOpk: false });
    expect(bundle.opk).toBeNull();
  });

  it('successive builds reuse the same long-term identity', async () => {
    const a = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const b = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    expect(Array.from(a.identitySpki)).toEqual(Array.from(b.identitySpki));
    expect(Array.from(a.x3dhIdentitySpki)).toEqual(Array.from(b.x3dhIdentitySpki));
    // SPK stays the same across successive calls (same rotation window).
    expect(a.spk.id).toBe(b.spk.id);
    // buildLocalBundle only peeks at the OPK pool — consumption happens on
    // the recipient side during X3DH, not on every bundle build.
    expect(a.opk.id).toBe(b.opk.id);
  });
});

describe('serialize / parse round-trip', () => {
  it('parse(serialize(bundle)) preserves every field', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    const json = JSON.stringify(wire);
    const parsed = parseBundle(JSON.parse(json));

    expect(parsed.v).toBe(bundle.v);
    expect(parsed.peerId).toBe(bundle.peerId);
    expect(Array.from(parsed.identitySpki)).toEqual(Array.from(bundle.identitySpki));
    expect(Array.from(parsed.x3dhIdentitySpki)).toEqual(Array.from(bundle.x3dhIdentitySpki));
    expect(Array.from(parsed.x3dhIdentitySig)).toEqual(Array.from(bundle.x3dhIdentitySig));
    expect(parsed.spk.id).toBe(bundle.spk.id);
    expect(Array.from(parsed.spk.pub)).toEqual(Array.from(bundle.spk.pub));
    expect(Array.from(parsed.spk.sig)).toEqual(Array.from(bundle.spk.sig));
    expect(parsed.opk.id).toBe(bundle.opk.id);
    expect(Array.from(parsed.opk.pub)).toEqual(Array.from(bundle.opk.pub));
  });

  it('parseBundle rejects bundles with a wrong version', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    expect(() => parseBundle({ ...wire, v: 99 })).toThrow(/version/);
  });

  it('parseBundle rejects bundles with missing peerId', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    expect(() => parseBundle({ ...wire, peerId: '' })).toThrow(/peerId/);
  });

  it('parseBundle rejects bundles with missing SPK', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    delete wire.spk;
    expect(() => parseBundle(wire)).toThrow(/spk/);
  });
});

describe('verifyRemoteBundle', () => {
  it('accepts a valid bundle', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const parsed = parseBundle(serializeBundle(bundle));
    const result = await verifyRemoteBundle(parsed);
    expect(result.ok).toBe(true);
  });

  it('rejects a bundle where SPK was tampered with', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    const parsed = parseBundle(wire);
    // Flip a byte in the SPK pub.
    parsed.spk.pub[0] = parsed.spk.pub[0] ^ 0xff;
    const result = await verifyRemoteBundle(parsed);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/spk/i);
  });

  it('rejects a bundle where the ECDH binding was tampered with', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const parsed = parseBundle(serializeBundle(bundle));
    parsed.x3dhIdentitySpki[0] = parsed.x3dhIdentitySpki[0] ^ 0xff;
    const result = await verifyRemoteBundle(parsed);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/binding/i);
  });

  it('rejects a bundle where the identity was swapped for a different one', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const parsed = parseBundle(serializeBundle(bundle));

    // Mint a second identity and substitute its public SPKI into the bundle.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    await db.delete('keys', 'identity-signing-v1');
    __resetCacheForTests();
    await getOrCreateSigningKey();
    const strangerSpki = await exportIdentityPubSpki();
    parsed.identitySpki = strangerSpki;

    const result = await verifyRemoteBundle(parsed);
    expect(result.ok).toBe(false);
  });
});
