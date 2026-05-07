// Port of src/core/avatarResize.js — normalise an uploaded image into a
// 256×256 JPEG suitable for use as an avatar.
//
// JS used <canvas>: read as data URL → draw onto a 256×256 canvas with
// cover-fit (scale so the shorter edge fills the square, then centre-
// crop) → export with `toDataURL('image/jpeg', 0.86)`. That stripped
// EXIF and re-encoded as JPEG.
//
// Flutter port uses `package:image` for decode → resize-cover → encode.
// The decode/resize/encode pipeline runs inside `Isolate.run` on native
// so the auth-onboarding spinner doesn't freeze the UI thread while a
// 12-MP phone selfie is being downsized. On web `Isolate.run` runs on
// the main thread (no real isolation in Dart-to-JS) which is identical
// to a synchronous call — fine, the same operation happens.

import 'dart:convert';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

const int defaultMaxBytes = 3 * 1024 * 1024; // 3 MB cap — same as JS.
const int defaultSize = 256;
const int defaultQuality = 86; // 0.86 * 100

/// Validation-only errors the JS version throws. Kept verbatim (Russian
/// copy) so the UI strings don't need retranslation.
class AvatarError implements Exception {
  const AvatarError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Resize [src] image bytes into a centre-cropped [size]×[size] JPEG.
/// Throws an [AvatarError] if the input fails the validation gates
/// (oversized, non-image MIME, undecodable).
Future<Uint8List> resizeAvatarBytes(
  Uint8List src, {
  String? mimeType,
  int maxBytes = defaultMaxBytes,
  int size = defaultSize,
  int quality = defaultQuality,
}) async {
  if (src.length > maxBytes) {
    final mb = (maxBytes / (1024 * 1024)).round();
    throw AvatarError('Аватар слишком большой (макс ${mb}MB)');
  }
  if (mimeType != null && !mimeType.toLowerCase().startsWith('image/')) {
    throw const AvatarError('Нужна картинка');
  }
  // Bundle the work into a single closure so we can run it in an isolate
  // — `image` ops are CPU-bound and 4-8 MP inputs visibly stall the UI
  // when run on the main thread.
  try {
    return await Isolate.run(
      () => _resizeAvatarSync(src, size: size, quality: quality),
    );
  } on AvatarError {
    rethrow;
  } catch (_) {
    throw const AvatarError('Не удалось обработать картинку');
  }
}

/// Convenience wrapper that returns the result as a `data:image/jpeg;base64,…`
/// URL — same shape as the JS `fileToAvatarDataUrl()`.
Future<String?> fileToAvatarDataUrl(
  Uint8List? bytes, {
  String? mimeType,
  int maxBytes = defaultMaxBytes,
  int size = defaultSize,
  int quality = defaultQuality,
}) async {
  if (bytes == null) return null;
  final resized = await resizeAvatarBytes(
    bytes,
    mimeType: mimeType,
    maxBytes: maxBytes,
    size: size,
    quality: quality,
  );
  return 'data:image/jpeg;base64,${base64Encode(resized)}';
}

/// CPU-bound part of the avatar pipeline. Pure top-level function so it
/// can ride into `Isolate.run` without dragging in any closure context.
Uint8List _resizeAvatarSync(
  Uint8List src, {
  required int size,
  required int quality,
}) {
  final decoded = img.decodeImage(src);
  if (decoded == null) {
    throw const AvatarError('Файл не похож на картинку');
  }

  // Cover-fit: scale so the shorter edge equals `size`, then centre-crop.
  final shorter = decoded.width < decoded.height ? decoded.width : decoded.height;
  // Scale ratio: target / shorter side. Apply to BOTH axes.
  final scale = size / shorter;
  final scaledW = (decoded.width * scale).round();
  final scaledH = (decoded.height * scale).round();
  final scaled = img.copyResize(
    decoded,
    width: scaledW,
    height: scaledH,
    interpolation: img.Interpolation.average,
  );

  // Centre-crop to size×size.
  final dx = ((scaled.width - size) / 2).round().clamp(0, scaled.width - size);
  final dy =
      ((scaled.height - size) / 2).round().clamp(0, scaled.height - size);
  final cropped = img.copyCrop(scaled, x: dx, y: dy, width: size, height: size);

  return Uint8List.fromList(img.encodeJpg(cropped, quality: quality));
}
