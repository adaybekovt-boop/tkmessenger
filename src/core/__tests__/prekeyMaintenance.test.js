import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  startPrekeyMaintenance,
  stopPrekeyMaintenance,
  __tickForTests,
  __isRunningForTests
} from '../prekeyMaintenance.js';
import {
  getActiveSignedPrekey,
  countFreshOPKs,
  generateOneTimePrekeys,
  rotateSignedPrekey
} from '../prekeyStore.js';
import { __resetCacheForTests } from '../identityKey.js';

async function wipeAllCryptoStores() {
  const { openDatabase } = await import('../db.js');
  const db = await openDatabase();
  const tx = db.transaction(['keys', 'prekeys'], 'readwrite');
  await tx.objectStore('keys').clear();
  await tx.objectStore('prekeys').clear();
  await tx.done;
}

beforeEach(async () => {
  __resetCacheForTests();
  await wipeAllCryptoStores();
  stopPrekeyMaintenance();
});

afterEach(() => {
  stopPrekeyMaintenance();
});

describe('startPrekeyMaintenance', () => {
  it('bootstraps an SPK and the OPK pool on the first tick', async () => {
    expect(await getActiveSignedPrekey()).toBeNull();
    expect(await countFreshOPKs()).toBe(0);

    // Large tickMs so the interval never fires during the test — only the
    // initial synchronous tick matters.
    await startPrekeyMaintenance({ tickMs: 60 * 60 * 1000 });

    const spk = await getActiveSignedPrekey();
    expect(spk).not.toBeNull();
    expect(await countFreshOPKs()).toBeGreaterThan(0);
    expect(__isRunningForTests()).toBe(true);
  });

  it('is idempotent — a second call is a no-op if already running', async () => {
    await startPrekeyMaintenance({ tickMs: 60 * 60 * 1000 });
    const countAfterFirst = await countFreshOPKs();

    await startPrekeyMaintenance({ tickMs: 60 * 60 * 1000 });
    expect(await countFreshOPKs()).toBe(countAfterFirst);
  });

  it('stop clears the interval', async () => {
    await startPrekeyMaintenance({ tickMs: 60 * 60 * 1000 });
    expect(__isRunningForTests()).toBe(true);
    stopPrekeyMaintenance();
    expect(__isRunningForTests()).toBe(false);
  });
});

describe('maintenance tick pruning', () => {
  it('tops the OPK pool back up when it falls below the floor', async () => {
    // Seed 5 OPKs — below the default minPool of 20 — and let the tick refill.
    await generateOneTimePrekeys(5);
    expect(await countFreshOPKs()).toBe(5);

    await __tickForTests();
    // ensurePrekeysReady targets 100 and refills to (target - count). After
    // a tick from 5 we should have well above the 20 floor.
    expect(await countFreshOPKs()).toBeGreaterThanOrEqual(20);
  });

  it('does not regenerate OPKs when the pool is already full', async () => {
    await rotateSignedPrekey();
    await generateOneTimePrekeys(100);
    const before = await countFreshOPKs();
    await __tickForTests();
    expect(await countFreshOPKs()).toBe(before);
  });
});
