// Round-trip: AES-GCM encrypt + decrypt interop with WebCrypto.
//
// WebCrypto concatenates ciphertext||tag in the encrypt() output; we split
// back into SecretBox cipherText + Mac so Dart's cryptography package can
// consume it. The second fixture is an empty-plaintext edge case to pin
// the tag-only output path.

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/test_utils.dart';

void main() {
  final fixtures = loadCryptoFixtures();
  final cases = (fixtures['aes_gcm'] as List).cast<Map<String, Object?>>();
  final aes = AesGcm.with256bits();

  group('AES-GCM-256 round-trip', () {
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i];
      test('case $i (len=${(c['plaintext_hex'] as String).length ~/ 2})',
          () async {
        final key = SecretKey(hexToBytes(c['key'] as String));
        final iv = hexToBytes(c['iv'] as String);
        final plaintext = hexToBytes(c['plaintext_hex'] as String);
        final ct = hexToBytes(c['ciphertext'] as String);
        final tag = hexToBytes(c['tag'] as String);

        // Dart encrypts → bytes must match WebCrypto output.
        final enc = await aes.encrypt(plaintext, secretKey: key, nonce: iv);
        expect(bytesToHex(enc.cipherText), c['ciphertext']);
        expect(bytesToHex(enc.mac.bytes), c['tag']);

        // Dart decrypts WebCrypto-produced ciphertext + tag.
        final box = SecretBox(ct, nonce: iv, mac: Mac(tag));
        final dec = await aes.decrypt(box, secretKey: key);
        expect(bytesToHex(dec), c['plaintext_hex']);
      });
    }
  });
}
