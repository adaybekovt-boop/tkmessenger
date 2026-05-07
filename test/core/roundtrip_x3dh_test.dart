// Round-trip: X3DH shared-secret derivation (HKDF over F_PREFIX||DH1||DH2||DH3[||DH4]).
//
// Pins the exact byte layout the Dart and JS implementations feed into HKDF.
// The four DH inputs are arbitrary fixed 32-byte values — the test doesn't
// exercise ECDH itself (that lives in the separate x3dh_test), just the
// IKM concatenation + HKDF-SHA256 step.

import 'package:flutter_test/flutter_test.dart';

import 'package:orbits_flutter/core/x3dh.dart';

import '../helpers/test_utils.dart';

void main() {
  final fixtures = loadCryptoFixtures();
  final cases = (fixtures['x3dh_derive'] as List).cast<Map<String, Object?>>();

  group('X3DH deriveX3DHSecret round-trip', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i];
      test('case $i (dh4=${c['dh4'] == null ? 'none' : 'present'})', () async {
        final dh1 = hexToBytes(c['dh1'] as String);
        final dh2 = hexToBytes(c['dh2'] as String);
        final dh3 = hexToBytes(c['dh3'] as String);
        final dh4Hex = c['dh4'] as String?;
        final dh4 = dh4Hex == null ? null : hexToBytes(dh4Hex);

        final sk = await deriveX3DHSecret(
          dh1: dh1,
          dh2: dh2,
          dh3: dh3,
          dh4: dh4,
        );
        expect(bytesToHex(sk), c['sk']);
      });
    }
  });
}
