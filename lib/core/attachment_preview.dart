// Port of src/core/attachmentPreview.js — thumbnail generation for chat
// attachments.
//
// JS behaviour:
//   image → small JPEG data-URL thumbnail (longest side <= 320px, ~24KB cap)
//   video → data-URL of the first frame (via <video> + <canvas>)
//   other → null
//
// Flutter equivalents require extra packages:
//   - image thumbnails:  package:image for decode + resize + re-encode JPEG.
//   - video thumbnails:  package:video_thumbnail (uses native decoders on
//     Android/iOS, not available on Web/Desktop).
// Neither is in pubspec.yaml yet, so this file ships an API surface compatible
// with the JS version, with stubbed thumbnail generation.
//
// [classifyFile] and [formatBytes] are full ports — they're pure and don't
// need any packages.
//
// TODO(port): add `image` + `video_thumbnail` deps, then fill in the real
// thumbnail pipeline in [buildImageThumbnail] / [buildVideoThumbnail].

import 'dart:typed_data';

const int maxThumbSide = 320;
const int maxThumbBytes = 24 * 1024; // ~24KB JPEG; stays under 32KB base64.

/// Kinds the preview pipeline can produce. Matches the JS string values.
enum AttachmentKind { image, video, audio, file }

String attachmentKindToString(AttachmentKind k) {
  switch (k) {
    case AttachmentKind.image:
      return 'image';
    case AttachmentKind.video:
      return 'video';
    case AttachmentKind.audio:
      return 'audio';
    case AttachmentKind.file:
      return 'file';
  }
}

/// Classify a file into one of four buckets based on its MIME type.
AttachmentKind classifyFile({String? mimeType}) {
  final mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return AttachmentKind.image;
  if (mime.startsWith('video/')) return AttachmentKind.video;
  if (mime.startsWith('audio/')) return AttachmentKind.audio;
  return AttachmentKind.file;
}

/// Human-readable byte count. Mirrors the JS unit labels (Б/КБ/МБ/ГБ).
String formatBytes(num? n) {
  final num num0 = n ?? 0;
  if (num0 < 1024) return '${num0.toInt()} Б';
  if (num0 < 1024 * 1024) return '${(num0 / 1024).toStringAsFixed(1)} КБ';
  if (num0 < 1024 * 1024 * 1024) {
    return '${(num0 / (1024 * 1024)).toStringAsFixed(1)} МБ';
  }
  return '${(num0 / (1024 * 1024 * 1024)).toStringAsFixed(2)} ГБ';
}

/// Output of the thumbnail builders — a subset of what the React side uses.
class AttachmentPreview {
  const AttachmentPreview({
    required this.kind,
    this.thumb,
    this.width = 0,
    this.height = 0,
    this.duration = 0,
  });

  final AttachmentKind kind;

  /// data:image/jpeg;base64,… URL, or null if thumbnail generation failed /
  /// isn't applicable for this kind.
  final String? thumb;
  final int width;
  final int height;

  /// Seconds, for video.
  final double duration;
}

/// Build an image thumbnail. Returns null on failure or when no decoder is
/// wired up yet.
///
/// TODO(port): decode with package:image, resize longest-side <= 320, then
/// iteratively re-encode JPEG with decreasing quality until size fits
/// [maxThumbBytes] (mirror the 0.72 → 0.60 → 0.48 → 0.36 loop in JS).
Future<AttachmentPreview?> buildImageThumbnail(Uint8List bytes) async {
  if (bytes.isEmpty) return null;
  return null;
}

/// Build a video thumbnail — the first frame as a JPEG. Returns null on
/// failure or when no decoder is wired up yet.
///
/// TODO(port): use package:video_thumbnail to extract frame at t=0.1s, then
/// run through the same JPEG size-iteration loop as [buildImageThumbnail].
Future<AttachmentPreview?> buildVideoThumbnail(Uint8List bytes) async {
  if (bytes.isEmpty) return null;
  return null;
}

/// Dispatch helper — mirror of the JS `buildAttachmentPreview(file)`.
Future<AttachmentPreview> buildAttachmentPreview(
  Uint8List bytes, {
  String? mimeType,
}) async {
  final kind = classifyFile(mimeType: mimeType);
  if (kind == AttachmentKind.image) {
    final t = await buildImageThumbnail(bytes);
    return AttachmentPreview(
      kind: kind,
      thumb: t?.thumb,
      width: t?.width ?? 0,
      height: t?.height ?? 0,
    );
  }
  if (kind == AttachmentKind.video) {
    final t = await buildVideoThumbnail(bytes);
    return AttachmentPreview(
      kind: kind,
      thumb: t?.thumb,
      width: t?.width ?? 0,
      height: t?.height ?? 0,
      duration: t?.duration ?? 0,
    );
  }
  return AttachmentPreview(kind: kind);
}
