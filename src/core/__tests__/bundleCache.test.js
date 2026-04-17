import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheVerifiedBundle,
  getCachedBundle,
  deleteCachedBundle,
  acceptIncomingBundle,
  listCachedBundles
} from '../bundleCache.js';
import { buildLocalBundle, serializeBundle } from '../prekeyBundle.js';
import { __resetCacheForTests, getOrCreateSigningKey } from '../identityKey.js';
import { setPin, checkPin } from '../peerPins.js';

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

describe('cache read/write', () => {
  it('roundtrips a bundle through cacheVerifiedBundle + getCachedBundle', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    await cacheVerifiedBundle('ORBIT-AAAA', bundle);

    const got = await getCachedBundle('ORBIT-AAAA');
    expect(got).not.toBeNull();
    expect(got.peerId).toBe('ORBIT-AAAA');
    expect(got.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.from(got.bundle.identitySpki)).toEqual(Array.from(bundle.identitySpki));
    expect(got.bundle.spk.id).toBe(bundle.spk.id);
  });

  it('getCachedBundle returns null when no row', async () => {
    expect(await getCachedBundle('ORBIT-NONE')).toBeNull();
  });

  it('deleteCachedBundle removes the row', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    await cacheVerifiedBundle('ORBIT-AAAA', bundle);
    await deleteCachedBundle('ORBIT-AAAA');
    expect(await getCachedBundle('ORBIT-AAAA')).toBeNull();
  });

  it('listCachedBundles only returns bundle rows (not peerPins / other keys)', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    await cacheVerifiedBundle('ORBIT-AAAA', bundle);
    // setPin writes into the same keys store with a different prefix — must
    // not bleed into listCachedBundles.
    await setPin('ORBIT-OTHER', bundle.identitySpki);

    const list = await listCachedBundles();
    expect(list).toHaveLength(1);
    expect(list[0].peerId).toBe('ORBIT-AAAA');
  });
});

describe('acceptIncomingBundle', () => {
  it('accepts a valid bundle on first contact (new pin status)', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);

    const result = await acceptIncomingBundle({ senderPeerId: 'ORBIT-AAAA', wire });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('new');
    const cached = await getCachedBundle('ORBIT-AAAA');
    expect(cached).not.toBeNull();
  });

  it('accepts a valid bundle matching an existing pin', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    await setPin('ORBIT-AAAA', bundle.identitySpki);

    const result = await acceptIncomingBundle({
      senderPeerId: 'ORBIT-AAAA',
      wire: serializeBundle(bundle)
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('pinned');
  });

  it('rejects a bundle whose peerId does not match the sender', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const result = await acceptIncomingBundle({
      senderPeerId: 'ORBIT-BBBB',
      wire: serializeBundle(bundle)
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/peerId/i);
  });

  it('rejects a bundle with a tampered SPK', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const wire = serializeBundle(bundle);
    // Flip a byte in the base64 SPK pub — decoded bytes will differ, sig won't verify.
    const tamperedPubB64 = wire.spk.pub.slice(0, -4) + 'AAAA';
    wire.spk.pub = tamperedPubB64;

    const result = await acceptIncomingBundle({ senderPeerId: 'ORBIT-AAAA', wire });
    expect(result.ok).toBe(false);
  });

  it('refuses to store a bundle whose fingerprint mismatches an existing pin', async () => {
    // Pin the first identity under peerId ORBIT-AAAA.
    const first = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    await setPin('ORBIT-AAAA', first.identitySpki);

    // Now rotate identity and build a fresh bundle with the new key.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    await db.delete('keys', 'identity-signing-v1');
    await db.delete('keys', 'identity-x3dh-v1');
    // Also wipe existing prekeys so buildLocalBundle regenerates under the new identity.
    const tx = db.transaction('prekeys', 'readwrite');
    await tx.objectStore('prekeys').clear();
    await tx.done;
    __resetCacheForTests();
    await getOrCreateSigningKey();

    const second = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const result = await acceptIncomingBundle({
      senderPeerId: 'ORBIT-AAAA',
      wire: serializeBundle(second)
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('mismatch');
    // And we must NOT have overwritten the cache with the mismatched bundle.
    const cached = await getCachedBundle('ORBIT-AAAA');
    expect(cached).toBeNull();
  });

  it('rejects malformed wire input gracefully', async () => {
    const result = await acceptIncomingBundle({ senderPeerId: 'ORBIT-AAAA', wire: { v: 99 } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/parse|version/i);
  });

  it('rejects missing senderPeerId', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-AAAA' });
    const result = await acceptIncomingBundle({
      senderPeerId: '',
      wire: serializeBundle(bundle)
    });
    expect(result.ok).toBe(false);
  });
});

describe('cache corruption recovery', () => {
  it('getCachedBundle drops and returns null for corrupt rows', async () => {
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    await db.put('keys', {
      id: 'peer-bundle-ORBIT-AAAA',
      peerId: 'ORBIT-AAAA',
      wire: { v: 999, peerId: 'x' }, // invalid version
      storedAt: Date.now()
    });

    const got = await getCachedBundle('ORBIT-AAAA');
    expect(got).toBeNull();
    // And the row should have been deleted.
    expect(await db.get('keys', 'peer-bundle-ORBIT-AAAA')).toBeUndefined();
  });
});
