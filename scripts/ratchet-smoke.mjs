// One-off Node smoke test for doubleRatchet.js. Not part of CI — just a
// quick runtime check until vitest is reinstalled.

import {
  generateDhKeyPair,
  exportSpkiBytes,
  ratchetInitAlice,
  ratchetInitBob,
  ratchetEncrypt,
  ratchetDecrypt,
  encodeWire,
  decodeWire
} from '../src/core/doubleRatchet.js';

function seedSecret() {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (i * 7 + 3) & 0xff;
  return bytes;
}

const dec = (u8) => new TextDecoder().decode(u8);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function setupAliceBob() {
  const shared = seedSecret();
  const bobKp = await generateDhKeyPair();
  const bobPub = await exportSpkiBytes(bobKp.publicKey);
  const alice = await ratchetInitAlice({ sharedSecret: shared, remoteDhPubSpki: bobPub });
  const bob = await ratchetInitBob({ sharedSecret: shared, dhKeyPair: bobKp, dhPubSpki: bobPub });
  return { alice, bob };
}

async function test_inOrder() {
  const { alice, bob } = await setupAliceBob();
  const e1 = await ratchetEncrypt(alice, 'hello bob');
  const d1 = await ratchetDecrypt(bob, e1.envelope);
  assert(dec(d1.plaintext) === 'hello bob', 'first message');
  console.log('✓ in-order first message');
}

async function test_longSequence() {
  let { alice, bob } = await setupAliceBob();
  for (let i = 0; i < 10; i++) {
    const s = await ratchetEncrypt(alice, `a${i}`);
    alice = s.state;
    const r = await ratchetDecrypt(bob, s.envelope);
    bob = r.state;
    assert(dec(r.plaintext) === `a${i}`, `alice->bob ${i}`);
  }
  for (let i = 0; i < 10; i++) {
    const s = await ratchetEncrypt(bob, `b${i}`);
    bob = s.state;
    const r = await ratchetDecrypt(alice, s.envelope);
    alice = r.state;
    assert(dec(r.plaintext) === `b${i}`, `bob->alice ${i}`);
  }
  console.log('✓ long bidirectional sequence (20 msgs)');
}

async function test_outOfOrder() {
  const { alice, bob } = await setupAliceBob();
  const a1 = await ratchetEncrypt(alice, 'one');
  const a2 = await ratchetEncrypt(a1.state, 'two');
  const a3 = await ratchetEncrypt(a2.state, 'three');

  // Bob receives #3, then #1, then #2.
  const d3 = await ratchetDecrypt(bob, a3.envelope);
  assert(dec(d3.plaintext) === 'three', 'ooo 3');
  const d1 = await ratchetDecrypt(d3.state, a1.envelope);
  assert(dec(d1.plaintext) === 'one', 'ooo 1');
  const d2 = await ratchetDecrypt(d1.state, a2.envelope);
  assert(dec(d2.plaintext) === 'two', 'ooo 2');
  console.log('✓ out-of-order delivery (3,1,2)');
}

async function test_tamper() {
  const { alice, bob } = await setupAliceBob();
  const e = await ratchetEncrypt(alice, 'tamper me');
  const bad = {
    ...e.envelope,
    ctB64: e.envelope.ctB64[0] === 'A'
      ? 'B' + e.envelope.ctB64.slice(1)
      : 'A' + e.envelope.ctB64.slice(1)
  };
  let threw = false;
  try { await ratchetDecrypt(bob, bad); } catch (_) { threw = true; }
  assert(threw, 'flipped ciphertext must throw');
  console.log('✓ tamper detection (ct flip)');
}

async function test_headerBinding() {
  const { alice, bob } = await setupAliceBob();
  const e = await ratchetEncrypt(alice, 'binding');
  const bad = { ...e.envelope, headerB64: e.envelope.headerB64.slice(0, -2) + 'AA' };
  let threw = false;
  try { await ratchetDecrypt(bob, bad); } catch (_) { threw = true; }
  assert(threw, 'mutated header must throw');
  console.log('✓ header AAD binding');
}

async function test_wireFormat() {
  const { alice, bob } = await setupAliceBob();
  const e = await ratchetEncrypt(alice, 'wire test');
  const wire = encodeWire(e.envelope);
  assert(wire.startsWith('v2:'), 'wire prefix v2');
  assert(wire.split(':').length === 4, 'wire has 4 parts');
  const decoded = decodeWire(wire);
  assert(decoded.headerB64 === e.envelope.headerB64, 'roundtrip header');
  const d = await ratchetDecrypt(bob, decoded);
  assert(dec(d.plaintext) === 'wire test', 'roundtrip decrypt');
  console.log('✓ wire format roundtrip');
}

(async () => {
  try {
    await test_inOrder();
    await test_longSequence();
    await test_outOfOrder();
    await test_tamper();
    await test_headerBinding();
    await test_wireFormat();
    console.log('\nall ratchet tests passed');
  } catch (err) {
    console.error('test crashed', err);
    process.exit(1);
  }
})();
