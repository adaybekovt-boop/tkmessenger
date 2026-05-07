// Native stub for the conditional-import trick in `file_tile.dart`. The
// web implementation lives in `web_download_html.dart` and uses the
// `dart:html` Blob + anchor-download pattern. On mobile/desktop we never
// reach this path — `file_tile.dart` branches on `kIsWeb` first — but
// Dart still needs a stub so the non-web build compiles.
import 'dart:typed_data';

/// Trigger a browser "Save As" dialog for [bytes] with the given
/// [filename] + [mime]. No-op on native targets.
void triggerBrowserDownload({
  required Uint8List bytes,
  required String filename,
  required String mime,
}) {
  // Intentionally empty. Callers must gate on `kIsWeb` before invoking.
}
