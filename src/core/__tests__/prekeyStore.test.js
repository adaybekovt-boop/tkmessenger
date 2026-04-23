import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  rotateSignedPrekey,
  getActiveSignedPrekey,
  getSignedPrekeyById,
  pruneRetiredSPKs,
  generateOneTimePrekeys,
  countFreshOPKs,
  listFreshOPKs,
  consumeOPK,
  pruneUsedOPKs,
  ensurePrekeysReady
} from '../prekeyStore.js';
import { __resetCacheForTests, verifyWithRemoteSpki, exportIdentityPubSpki } from '../identityKey.js';

async function wipePrekeys() {
  const { openDatabase } = await import('../db.js');
  const db = await openDatabase();
  const tx = db.transaction('prekeys', 'readwrite');
  await tx.objectStore('prekeys').clear();
  await tx.done;
}

beforeEach(async () => {
  __resetCacheForTests();
  await wipePrekeys();
});

afterEach(() => {
  __resetCacheForTests();
});

describe('signed prekey', () => {
  it('rotateSignedPrekey creates an active SPK with a valid identity signature', async () => {
    const { id, pubSpki, sig } = await rotateSignedPrekey();
    expect(id).toMatch(/^spk-/);
    expect(pubSpki.byteLength).toBeGreaterThan(0);

    const idSpki = await exportIdentityPubSpki();
    const ok = await verifyWithRemoteSpki(idSpki, pubSpki, sig);
    expect(ok).toBe(true);
  });

  it('demotes previous active SPK on rotation', async () => {
    const first = await rotateSignedPrekey();
    const active1 = await getActiveSignedPrekey();
    expect(active1.id).toBe(first.id);
    expect(active1.status).toBe('active');

    const second = await rotateSignedPrekey();
    const active2 = await getActiveSignedPrekey();
    expect(active2.id).toBe(second.id);
    expect(active2.id).not.toBe(first.id);

    const oldRec = await getSignedPrekeyById(first.id);
    expect(oldRec.status).toBe('retired');
    expect(typeof oldRec.retiredAt).toBe('number');
  });

  it('pruneRetiredSPKs removes retired SPKs past the age cutoff', async () => {
    const first = await rotateSignedPrekey();
    await rotateSignedPrekey();

    // Nothing to prune yet — retired just now.
    let removed = await pruneRetiredSPKs(1000);
    expect(removed).toBe(0);

    // Force retiredAt into the past and prune.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    const rec = await db.get('prekeys', first.id);
    await db.put('prekeys', { ...rec, retiredAt: Date.now() - 10_000 });

    removed = await pruneRetiredSPKs(1000);
    expect(removed).toBe(1);
    expect(await getSignedPrekeyById(first.id)).toBeNull();
  });
});

describe('one-time prekeys', () => {
  it('generateOneTimePrekeys persists the requested count', async () => {
    const out = await generateOneTimePrekeys(5);
    expect(out).toHaveLength(5);
    expect(await countFreshOPKs()).toBe(5);
  });

  it('listFreshOPKs returns only fresh OPKs up to the limit', async () => {
    await generateOneTimePrekeys(10);
    const list = await listFreshOPKs(3);
    expect(list).toHaveLength(3);
    for (const o of list) {
      expect(o.id).toMatch(/^opk-/);
      expect(o.pubSpki.byteLength).toBeGreaterThan(0);
    }
  });

  it('consumeOPK marks the OPK used and returns the private material once', async () => {
    const [{ id }] = await generateOneTimePrekeys(1);
    const first = await consumeOPK(id);
    expect(first).not.toBeNull();
    expect(first.privateKey).toBeDefined();

    const second = await consumeOPK(id);
    expect(second).toBeNull();
    expect(await countFreshOPKs()).toBe(0);
  });

  it('consumeOPK on a non-existent id returns null', async () => {
    expect(await consumeOPK('opk-nope')).toBeNull();
  });

  it('pruneUsedOPKs removes only OPKs past the retention window', async () => {
    const [{ id: a }, { id: b }] = await generateOneTimePrekeys(2);
    await consumeOPK(a);
    await consumeOPK(b);

    // Just consumed — nothing removed.
    let removed = await pruneUsedOPKs(1000);
    expect(removed).toBe(0);

    // Push `a`'s usedAt into the past.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    const rec = await db.get('prekeys', a);
    await db.put('prekeys', { ...rec, usedAt: Date.now() - 10_000 });

    removed = await pruneUsedOPKs(1000);
    expect(removed).toBe(1);
    expect(await db.get('prekeys', a)).toBeUndefined();
    expect(await db.get('prekeys', b)).toBeDefined();
  });
});

describe('ensurePrekeysReady', () => {
  it('creates the active SPK and fills the OPK pool on first run', async () => {
    await ensurePrekeysReady({ targetPool: 8, minPool: 4 });
    const active = await getActiveSignedPrekey();
    expect(active).not.toBeNull();
    expect(await countFreshOPKs()).toBe(8);
  });

  it('does not rotate or top up when already satisfied', async () => {
    await ensurePrekeysReady({ targetPool: 10, minPool: 5 });
    const active1 = await getActiveSignedPrekey();
    await ensurePrekeysReady({ targetPool: 10, minPool: 5 });
    const active2 = await getActiveSignedPrekey();
    expect(active1.id).toBe(active2.id);
    expect(await countFreshOPKs()).toBe(10);
  });

  it('tops the pool back up when below minPool', async () => {
    await ensurePrekeysReady({ targetPool: 10, minPool: 5 });
    // Consume until below minPool.
    const fresh = await listFreshOPKs(10);
    for (let i = 0; i < 7; i++) await consumeOPK(fresh[i].id);
    expect(await countFreshOPKs()).toBe(3);

    await ensurePrekeysReady({ targetPool: 10, minPool: 5 });
    expect(await countFreshOPKs()).toBeGreaterThanOrEqual(5);
  });

  it('rotates SPK once the rotation window has elapsed', async () => {
    await ensurePrekeysReady({ targetPool: 4, minPool: 2, rotationMs: 1_000_000 });
    const first = await getActiveSignedPrekey();

    // Backdate the active SPK so the rotation cutoff has passed.
    const { openDatabase } = await import('../db.js');
    const db = await openDatabase();
    await db.put('prekeys', { ...first, createdAt: Date.now() - 2_000_000 });

    await ensurePrekeysReady({ targetPool: 4, minPool: 2, rotationMs: 1_000_000 });
    const second = await getActiveSignedPrekey();
    expect(second.id).not.toBe(first.id);
  });
});
