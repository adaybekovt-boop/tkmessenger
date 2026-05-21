// Web-side `applyUpdate` impl — clear the service-worker cache and
// reload the page so the browser pulls fresh files from origin.
//
// Flutter's auto-generated `flutter_service_worker.js` caches every
// asset under a versioned `flutter-app-cache` key. When the build
// changes, the SW eventually picks up the new hashes — but "eventually"
// here means "after one or two background reloads". To make the
// "Обновить" button feel instant we explicitly:
//
//   1. Purge every Cache Storage entry so the next request can't be
//      served from cache.
//   2. Unregister the SW so it doesn't immediately re-cache the old
//      bundle from its in-memory state during the page-reload sequence.
//   3. Reload via `location.reload()` — the browser refetches
//      `index.html`, then `flutter_bootstrap.js` re-registers a fresh
//      SW pointing at the new manifest.
//
// `dart:html` is deprecated in favour of `package:web`, but only the
// web build pulls this file in (conditional import in
// `update_applier.dart`) and Flutter still ships `dart:html` for
// backwards compat. Avoiding `package:web` keeps the dep tree slim.

// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:html' as html;
import 'dart:js_util' as js_util;

import 'update_checker.dart';

Future<bool> doApplyUpdate(UpdateInfo info) async {
  try {
    // Best-effort cache purge. If `caches` isn't available (very old
    // browsers without Cache API support), skip — the reload alone
    // will still pull a fresh index.html in most setups.
    final caches = js_util.getProperty(html.window, 'caches');
    if (caches != null) {
      final keysPromise = js_util.callMethod(caches, 'keys', const []);
      final keys = await js_util.promiseToFuture<List<dynamic>>(keysPromise);
      for (final key in keys) {
        final deletePromise =
            js_util.callMethod(caches, 'delete', <Object?>[key]);
        await js_util.promiseToFuture<dynamic>(deletePromise);
      }
    }

    // Unregister any active service worker so the next page load
    // starts from a clean slate.
    final sw = html.window.navigator.serviceWorker;
    if (sw != null) {
      final regs = await sw.getRegistrations();
      for (final reg in regs) {
        try {
          await reg.unregister();
        } catch (_) {
          // Best-effort — keep going even if one unregister throws.
        }
      }
    }

    // Hard reload. `reload()` re-validates against the origin; combined
    // with the cache purge above this guarantees the new index.html
    // (and the new build hashes inside it) is what the browser parses
    // next.
    html.window.location.reload();
    return true;
  } catch (_) {
    return false;
  }
}
