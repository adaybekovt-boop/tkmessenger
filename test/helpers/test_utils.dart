// Shared helpers for round-trip crypto tests.
//
// The fixture file (test/fixtures/crypto-fixtures.json) is produced by
// git_push/scripts/generate-crypto-fixtures.mjs. Both sides use the exact
// same inputs — a drift in the committed JSON means a real cross-runtime
// crypto regression, not test flake.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

Uint8List hexToBytes(String hex) {
  if (hex.isEmpty) return Uint8List(0);
  if (hex.length.isOdd) {
    throw ArgumentError('hex string must have even length: "$hex"');
  }
  final out = Uint8List(hex.length ~/ 2);
  for (var i = 0; i < out.length; i++) {
    out[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
  }
  return out;
}

String bytesToHex(List<int> bytes) {
  final sb = StringBuffer();
  for (final b in bytes) {
    sb.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return sb.toString();
}

Map<String, Object?> loadCryptoFixtures() {
  final f = File('test/fixtures/crypto-fixtures.json');
  if (!f.existsSync()) {
    throw StateError(
      'crypto-fixtures.json not found; run `node scripts/generate-crypto-fixtures.mjs` '
      'from git_push/ to regenerate it.',
    );
  }
  return jsonDecode(f.readAsStringSync()) as Map<String, Object?>;
}
