// Round-trip: HKDF-SHA256 output must match WebCrypto's deriveBits byte-for-byte.
//
// Fixture cases:
//   1. Non-zero salt + non-zero info (smoke test for the common path).
//   2. 32-byte zero salt + 'orbits-x3dh-v1' info (the exact config used by
//      lib/core/x3dh.dart — pins the Dart-cryptography #176 workaround).

import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/test_utils.dart';

void main() {
  final fixtures = loadCryptoFixtures();
  final cases = (fixtures['hkdf'] as List).cast<Map<String, Object?>>();

  group('HKDF-SHA256 round-trip', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i];
      test('case $i (${c['info_utf8']})', () async {
        final ikm = hexToBytes(c['ikm'] as String);
        final salt = hexToBytes(c['salt'] as String);
        final info = utf8.encode(c['info_utf8'] as String);
        final outLen = c['out_len'] as int;

        final hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: outLen);
        final derived = await hkdf.deriveKey(
          secretKey: SecretKey(ikm),
          nonce: salt,
          info: info,
        );
        final bytes = await derived.extractBytes();
        expect(bytesToHex(bytes), c['output']);
      });
    }
  });
}
