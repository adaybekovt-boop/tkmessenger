import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveInitiatorBootstrap,
  deriveResponderBootstrap
} from '../x3dhSession.js';
import { setX3dhEnabled, __resetFlagsForTests } from '../featureFlags.js';
import { buildLocalBundle } from '../prekeyBundle.js';
import { cacheVerifiedBundle, getCachedBundle } from '../bundleCache.js';
import {
  __resetCacheForTests,
  exportIdentityPubSpki,
  exportX3DHIdentityPubSpki,
  getOrCreateX3DHIdentity,
  getOrCreateSigningKey
} from '../identityKey.js';
import {
  initiateHandshake,
  acceptHello,
  __sessions_for_test
} from '../wireSession.js';
import { ratchetEncrypt, ratchetDecrypt } from '../doubleRatchet.js';

// Alice and bob are simulated with the same local identity — the prekey
// math is symmetric, so this is sufficient to exercise the wire protocol.
// A real multi-identity integration test would need an isolated process.

async function wipeAllCryptoStores() {
  const { openDatabase } = await import('../db.js');
  const db = await openDatabase();
  const tx = db.transaction(['keys', 'prekeys', 'ratchet_state'], 'readwrite');
  await tx.objectStore('keys').clear();
  await tx.objectStore('prekeys').clear();
  await tx.objectStore('ratchet_state').clear();
  await tx.done;
}

function resetWireSessions() {
  const m = __sessions_for_test();
  m.clear();
}

beforeEach(async () => {
  __resetCacheForTests();
  await wipeAllCryptoStores();
  resetWireSessions();
  __resetFlagsForTests();
});

afterEach(() => {
  __resetFlagsForTests();
});

function bytesEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('deriveInitiatorBootstrap', () => {
  it('returns null when no cached bundle for peer', async () => {
    await getOrCreateSigningKey();
    await getOrCreateX3DHIdentity();
    const out = await deriveInitiatorBootstrap('ORBIT-UNKNOWN');
    expect(out).toBeNull();
  });

  it('produces sk + ek + spkId (and opkId) when bundle is cached', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);

    const out = await deriveInitiatorBootstrap('ORBIT-BOB');
    expect(out).not.toBeNull();
    expect(out.sk).toBeInstanceOf(Uint8Array);
    expect(out.sk.byteLength).toBe(32);
    expect(out.ekSpki.byteLength).toBeGreaterThan(0);
    expect(out.spkId).toBe(bundle.spk.id);
    expect(out.opkId).toBe(bundle.opk.id);
    expect(out.myX3dhIkSpki.byteLength).toBeGreaterThan(0);
    expect(out.myX3dhIkSig.byteLength).toBeGreaterThan(0);
  });

  it('deletes the cached bundle after successful bootstrap (one-shot)', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);
    expect(await getCachedBundle('ORBIT-BOB')).not.toBeNull();

    await deriveInitiatorBootstrap('ORBIT-BOB');
    expect(await getCachedBundle('ORBIT-BOB')).toBeNull();
  });
});

describe('deriveResponderBootstrap', () => {
  it('derives a matching SK for a fresh initiator bootstrap', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);

    const init = await deriveInitiatorBootstrap('ORBIT-BOB');
    expect(init).not.toBeNull();

    const senderIdSpki = await exportIdentityPubSpki();
    const resp = await deriveResponderBootstrap({
      senderIdSpki,
      senderX3dhIkSpki: init.myX3dhIkSpki,
      senderX3dhIkSig: init.myX3dhIkSig,
      ekSpki: init.ekSpki,
      spkId: init.spkId,
      opkId: init.opkId
    });
    expect(resp.ok).toBe(true);
    expect(bytesEq(resp.sk, init.sk)).toBe(true);
  });

  it('rejects reuse of an already-consumed OPK', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);
    const init = await deriveInitiatorBootstrap('ORBIT-BOB');
    const senderIdSpki = await exportIdentityPubSpki();

    const first = await deriveResponderBootstrap({
      senderIdSpki,
      senderX3dhIkSpki: init.myX3dhIkSpki,
      senderX3dhIkSig: init.myX3dhIkSig,
      ekSpki: init.ekSpki,
      spkId: init.spkId,
      opkId: init.opkId
    });
    expect(first.ok).toBe(true);

    const second = await deriveResponderBootstrap({
      senderIdSpki,
      senderX3dhIkSpki: init.myX3dhIkSpki,
      senderX3dhIkSig: init.myX3dhIkSig,
      ekSpki: init.ekSpki,
      spkId: init.spkId,
      opkId: init.opkId
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/opk/i);
  });

  it('rejects unknown spkId', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);
    const init = await deriveInitiatorBootstrap('ORBIT-BOB');
    const senderIdSpki = await exportIdentityPubSpki();

    const resp = await deriveResponderBootstrap({
      senderIdSpki,
      senderX3dhIkSpki: init.myX3dhIkSpki,
      senderX3dhIkSig: init.myX3dhIkSig,
      ekSpki: init.ekSpki,
      spkId: 'spk-deadbeef',
      opkId: init.opkId
    });
    expect(resp.ok).toBe(false);
    expect(resp.reason).toMatch(/spk/i);
  });

  it('rejects a forged x3dh identity binding', async () => {
    const bundle = await buildLocalBundle({ peerId: 'ORBIT-BOB' });
    await cacheVerifiedBundle('ORBIT-BOB', bundle);
    const init = await deriveInitiatorBootstrap('ORBIT-BOB');
    const senderIdSpki = await exportIdentityPubSpki();

    const forged = new Uint8Array(init.myX3dhIkSig.byteLength);
    crypto.getRandomValues(forged);

    const resp = await deriveResponderBootstrap({
      senderIdSpki,
      senderX3dhIkSpki: init.myX3dhIkSpki,
      senderX3dhIkSig: forged,
      ekSpki: init.ekSpki,
      spkId: init.spkId,
      opkId: init.opkId
    });
    expect(resp.ok).toBe(false);
    expect(resp.reason).toMatch(/binding/i);
  });

  it('rejects missing required fields', async () => {
    const r = await deriveResponderBootstrap({
      senderIdSpki: new Uint8Array([1]),
      senderX3dhIkSpki: new Uint8Array([1]),
      senderX3dhIkSig: new Uint8Array([1]),
      ekSpki: null,
      spkId: 'spk-x'
    });
    expect(r.ok).toBe(false);
  });
});

describe('wire handshake v3 / v4 selection', () => {
  const ALICE = 'ORBIT-AAAA';
  const BOB = 'ORBIT-BBBB';

  it('initiateHandshake emits v3 hello when no cached bundle exists', async () => {
    const hello = await initiateHandshake(BOB, ALICE); // role=alice
    expect(hello.v).toBe(3);
    expect(hello.type).toBe('wireHello');
    expect(hello.ek).toBeUndefined();
    expect(hello.spkId).toBeUndefined();
  });

  it('initiateHandshake emits v4 hello when a bundle is cached', async () => {
    const bundle = await buildLocalBundle({ peerId: BOB });
    await cacheVerifiedBundle(BOB, bundle);

    const hello = await initiateHandshake(BOB, ALICE);
    expect(hello.v).toBe(4);
    expect(hello.ek).toBeDefined();
    expect(hello.spkId).toBe(bundle.spk.id);
    expect(hello.opkId).toBe(bundle.opk.id);
    expect(hello.x3dhIk).toBeDefined();
    expect(hello.x3dhIkSig).toBeDefined();
  });

  it('bob (role=bob) never initiates X3DH — always emits v3', async () => {
    // Cache a (self) bundle under ALICE's peerId, then initiate as bob.
    const bundle = await buildLocalBundle({ peerId: ALICE });
    await cacheVerifiedBundle(ALICE, bundle);

    // We are bob, peer is alice. ALICE < BOB lexicographically, so our role
    // should be 'bob'.
    const hello = await initiateHandshake(ALICE, BOB);
    expect(hello.v).toBe(3);
  });
});

describe('full self-handshake ratchet through wireSession', () => {
  const ALICE = 'ORBIT-AAAA';
  const BOB = 'ORBIT-BBBB';

  async function runHandshake({ x3dh }) {
    if (x3dh) {
      const bundle = await buildLocalBundle({ peerId: BOB });
      await cacheVerifiedBundle(BOB, bundle);
    }

    // Alice opens her side first.
    const aliceHello = await initiateHandshake(BOB, ALICE);
    // Bob opens — no bundle of alice cached, so plain v3.
    const bobHello = await initiateHandshake(ALICE, BOB);

    // Alice receives bob's hello.
    const aliceAccept = await acceptHello(BOB, ALICE, bobHello);
    // Bob receives alice's hello.
    const bobAccept = await acceptHello(ALICE, BOB, aliceHello);

    return { aliceHello, bobHello, aliceAccept, bobAccept };
  }

  it('v3 path establishes matching ratchet state on both sides', async () => {
    await runHandshake({ x3dh: false });
    const sessions = __sessions_for_test();
    const aliceSide = sessions.get(BOB);
    const bobSide = sessions.get(ALICE);
    expect(aliceSide.ready).toBe(true);
    expect(bobSide.ready).toBe(true);
    expect(aliceSide.bootstrapSK).toBeNull();
    expect(bobSide.bootstrapSK).toBeNull();
    // Alice has a send chain; bob waits for alice's first message to bootstrap his.
    expect(aliceSide.state.sendCk).toBeTruthy();
    expect(bobSide.state.sendCk).toBeNull();

    // Drive one round-trip through the ratchet primitives directly — avoids a
    // jsdom-specific Uint8Array-realm edge case in wireSession.encryptOutbound
    // that does not occur in production.
    const enc = await ratchetEncrypt(aliceSide.state, 'hello from alice');
    const dec = await ratchetDecrypt(bobSide.state, enc.envelope);
    expect(new TextDecoder().decode(dec.plaintext)).toBe('hello from alice');
  });

  it('v4 path bootstraps both sides with a shared X3DH SK', async () => {
    const { aliceHello, bobHello } = await runHandshake({ x3dh: true });
    expect(aliceHello.v).toBe(4);
    expect(bobHello.v).toBe(3);

    const sessions = __sessions_for_test();
    const aliceSide = sessions.get(BOB);
    const bobSide = sessions.get(ALICE);
    expect(aliceSide.bootstrapSK).toBeTruthy();
    expect(bobSide.bootstrapSK).toBeTruthy();
    expect(bytesEq(aliceSide.bootstrapSK, bobSide.bootstrapSK)).toBe(true);
    expect(aliceSide.protocolVersion).toBe(3); // alice classifies bob's reply as v3
    expect(bobSide.protocolVersion).toBe(4);

    const enc = await ratchetEncrypt(aliceSide.state, 'x3dh bootstrapped');
    const dec = await ratchetDecrypt(bobSide.state, enc.envelope);
    expect(new TextDecoder().decode(dec.plaintext)).toBe('x3dh bootstrapped');
  });

  it('feature flag off: alice emits v3 hello even with cached bundle', async () => {
    const bundle = await buildLocalBundle({ peerId: BOB });
    await cacheVerifiedBundle(BOB, bundle);

    setX3dhEnabled(false);
    const hello = await initiateHandshake(BOB, ALICE);
    expect(hello.v).toBe(3);
    expect(hello.ek).toBeUndefined();
    expect(hello.spkId).toBeUndefined();
    // Bundle must stay cached — we did not consume it.
    expect(await getCachedBundle(BOB)).not.toBeNull();
  });

  it('feature flag off: responder still accepts incoming v4 hellos', async () => {
    // Alice (flag on) produces a v4 hello.
    const bundle = await buildLocalBundle({ peerId: BOB });
    await cacheVerifiedBundle(BOB, bundle);
    const aliceHello = await initiateHandshake(BOB, ALICE);
    expect(aliceHello.v).toBe(4);

    // Bob flips his flag off and accepts — flag is initiator-only, so accept still works.
    setX3dhEnabled(false);
    await acceptHello(ALICE, BOB, aliceHello);

    const bobSide = __sessions_for_test().get(ALICE);
    expect(bobSide.ready).toBe(true);
    expect(bobSide.bootstrapSK).toBeTruthy();
    expect(bobSide.protocolVersion).toBe(4);
  });

  it('tampering with v4 ek field invalidates the hello signature', async () => {
    const bundle = await buildLocalBundle({ peerId: BOB });
    await cacheVerifiedBundle(BOB, bundle);

    const aliceHello = await initiateHandshake(BOB, ALICE);
    // Flip a character deep inside ek so the base64 still decodes but bytes differ.
    const tampered = { ...aliceHello, ek: aliceHello.ek.slice(0, -4) + 'AAAA' };

    await expect(acceptHello(ALICE, BOB, tampered)).rejects.toThrow();
  });
});
