// Port of src/core/base64.js.
//
// The JS version uses standard base64 (with '+/' alphabet and '=' padding)
// to match Web Crypto expectations for raw key material and ciphertext.

import 'dart:convert';
import 'dart:typed_data';

Uint8List base64ToBytes(String b64) => base64Decode(b64);

String bytesToBase64(Uint8List bytes) => base64Encode(bytes);
