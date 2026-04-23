// Generate cross-runtime crypto fixtures for the Flutter round-trip tests.
//
// Usage (from git_push/):
//   node scripts/generate-crypto-fixtures.mjs
//
// Output: ../git_push_flutter/test/fixtures/crypto-fixtures.json
//
// Each fixture pins inputs AND expected outputs so the Dart side can verify
// byte-identical behavior without needing a live JS runtime. The inputs are
// themselves fixed (no randomness) so re-running this script produces the
// same file — diffs in the committed JSON mean a real interop regression.

import { webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import scryptPkg from 'scrypt-js';
const { syncScrypt } = scryptPkg;

const subtle = webcrypto.subtle;

const bufToHex = (buf) =>
  Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString(
    'hex',
  );

const hexToBuf = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));

const encoder = new TextEncoder();

async function hkdfCase({ ikmHex, saltHex, infoUtf8, outLen }) {
  const ikm = hexToBuf(ikmHex);
  const salt = hexToBuf(saltHex);
  const info = encoder.encode(infoUtf8);
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    outLen * 8,
  );
  return {
    ikm: ikmHex,
    salt: saltHex,
    info_utf8: infoUtf8,
    out_len: outLen,
    output: bufToHex(bits),
  };
}

async function aesGcmCase({ keyHex, ivHex, plaintextUtf8 }) {
  const key = await subtle.importKey(
    'raw',
    hexToBuf(keyHex),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  const plaintext = encoder.encode(plaintextUtf8);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv: hexToBuf(ivHex), tagLength: 128 },
    key,
    plaintext,
  );
  const ctBytes = new Uint8Array(ct);
  // WebCrypto produces ciphertext||tag concatenated; split for clarity so the
  // Dart side can verify the tag separately.
  const tag = ctBytes.slice(ctBytes.length - 16);
  const body = ctBytes.slice(0, ctBytes.length - 16);
  return {
    key: keyHex,
    iv: ivHex,
    plaintext_utf8: plaintextUtf8,
    plaintext_hex: bufToHex(plaintext),
    ciphertext: bufToHex(body),
    tag: bufToHex(tag),
    ciphertext_with_tag: bufToHex(ctBytes),
  };
}

async function scryptCase({ passwordUtf8, saltHex, N, r, p, dkLen }) {
  const pw = encoder.encode(passwordUtf8);
  const salt = hexToBuf(saltHex);
  const dk = syncScrypt(pw, salt, N, r, p, dkLen);
  return {
    password_utf8: passwordUtf8,
    salt: saltHex,
    N,
    r,
    p,
    dk_len: dkLen,
    output: bufToHex(dk),
  };
}

async function x3dhDeriveCase({ dh1Hex, dh2Hex, dh3Hex, dh4Hex }) {
  // Mirror src/core/x3dh.js `deriveX3DHSecret`: HKDF-SHA256(salt=32 zeros,
  // ikm = F_PREFIX || DH1 || DH2 || DH3 [|| DH4], info = 'orbits-x3dh-v1').
  const fPrefix = new Uint8Array(32).fill(0xff);
  const parts = [fPrefix, hexToBuf(dh1Hex), hexToBuf(dh2Hex), hexToBuf(dh3Hex)];
  if (dh4Hex) parts.push(hexToBuf(dh4Hex));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const ikm = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    ikm.set(p, off);
    off += p.length;
  }
  const salt = new Uint8Array(32);
  const info = encoder.encode('orbits-x3dh-v1');
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    32 * 8,
  );
  return {
    dh1: dh1Hex,
    dh2: dh2Hex,
    dh3: dh3Hex,
    dh4: dh4Hex ?? null,
    sk: bufToHex(bits),
  };
}

const fixtures = {
  // HKDF test vectors — two cases. Second uses the 32-byte zero salt the
  // Double Ratchet KDF relies on (see git_push_flutter/lib/core/x3dh.dart).
  hkdf: [
    await hkdfCase({
      ikmHex:
        '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
      saltHex: '000102030405060708090a0b0c',
      infoUtf8: 'f0f1f2f3f4f5f6f7f8f9',
      outLen: 42,
    }),
    await hkdfCase({
      ikmHex:
        'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      saltHex:
        '0000000000000000000000000000000000000000000000000000000000000000',
      infoUtf8: 'orbits-x3dh-v1',
      outLen: 32,
    }),
  ],
  aes_gcm: [
    await aesGcmCase({
      keyHex:
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      ivHex: '0102030405060708090a0b0c',
      plaintextUtf8: 'hello from orbits round-trip',
    }),
    await aesGcmCase({
      keyHex:
        '0000000000000000000000000000000000000000000000000000000000000000',
      ivHex: '000000000000000000000000',
      plaintextUtf8: '',
    }),
  ],
  scrypt: [
    await scryptCase({
      passwordUtf8: 'alice:hunter2:ORBITS_P2P',
      saltHex: 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
      N: 16384,
      r: 8,
      p: 1,
      dkLen: 32,
    }),
    // Don't run N=65536 here — 400ms on CI is fine but on a cold box it can
    // stretch. The N=16384 case is enough to pin determinism; the Dart and
    // JS implementations share the RFC 7914 spec and scale identically.
  ],
  x3dh_derive: [
    await x3dhDeriveCase({
      // Four arbitrary 32-byte inputs that mimic what the four ECDHs produce.
      dh1Hex:
        '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      dh2Hex:
        '2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40',
      dh3Hex:
        '4142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f60',
      dh4Hex:
        '6162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f80',
    }),
    await x3dhDeriveCase({
      // Without OPK (three DHs only) — the common "Bob has no one-time prekey
      // available" bootstrap path.
      dh1Hex:
        'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
      dh2Hex:
        'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1',
      dh3Hex:
        'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
      dh4Hex: null,
    }),
  ],
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  __dirname,
  '..',
  '..',
  'git_push_flutter',
  'test',
  'fixtures',
  'crypto-fixtures.json',
);
await writeFile(outPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
