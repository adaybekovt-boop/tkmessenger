// Web implementation of the conditional-import helper referenced from
// `file_tile.dart`. Builds a `Blob`, turns it into an object URL, spawns
// a hidden `<a download>` link, clicks it, and revokes the URL on the
// next microtask so the browser can release the underlying bytes.
import 'dart:html' as html;
import 'dart:typed_data';

void triggerBrowserDownload({
  required Uint8List bytes,
  required String filename,
  required String mime,
}) {
  final blob = html.Blob(<Object>[bytes], mime);
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..download = filename
    ..style.display = 'none';
  html.document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser one frame to kick off the download before we
  // revoke the URL. Revoking synchronously race-cancels the save on
  // some browsers (Safari).
  Future<void>.delayed(const Duration(milliseconds: 100), () {
    html.Url.revokeObjectUrl(url);
  });
}
