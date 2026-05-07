// Round-trip: Scrypt KDF output matches scrypt-js byte-for-byte.
//
// Both sides implement RFC 7914; divergence here would indicate a cost
// parameter mismatch or a bug in pointycastle's ScryptKeyDerivator. We use
// N=16384 for CI speed — the production default (N=65536) uses the same
// code path, tested indirectly by the module-level scrypt_kdf_test.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:pointycastle/export.dart' as pc;

import '../helpers/test_utils.dart';

Uint8List _scrypt({
  required Uint8List password,
  required Uint8List salt,
  required int N,
  required int r,
  required int p,
  required int dkLen,
}) {
  final kdf = pc.Scrypt()
    ..init(pc.ScryptParameters(N, r, p, dkLen, salt));
  return kdf.process(password);
}

void main() {
  final fixtures = loadCryptoFixtures();
  final cases = (fixtures['scrypt'] as List).cast<Map<String, Object?>>();

  group('Scrypt round-trip', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i];
      test('case $i (N=${c['N']})', () {
        final pw = utf8.encode(c['password_utf8'] as String);
        final salt = hexToBytes(c['salt'] as String);
        final dk = _scrypt(
          password: Uint8List.fromList(pw),
          salt: salt,
          N: c['N'] as int,
          r: c['r'] as int,
          p: c['p'] as int,
          dkLen: c['dk_len'] as int,
        );
        expect(bytesToHex(dk), c['output']);
      });
    }
  });
}
