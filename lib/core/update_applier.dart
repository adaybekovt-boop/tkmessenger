// "Apply this update" entry point. Splits across platforms via
// conditional import:
//
//   • web (`dart.library.html` available)  → drop the service-worker
//     cache + reload the page. The reload re-fetches `index.html`,
//     `flutter_bootstrap.js`, and the new `main.dart.js_*.part.js`
//     chunks from origin — exactly the "файлы обновляются" UX the
//     spec asks for, with no platform store round-trip.
//
//   • native (default branch — `dart:io` is available)  → open the
//     release page in the system browser via `url_launcher`. We can't
//     literally hot-swap an iOS/Android/desktop binary from inside the
//     running process, so the best we can do is hand the user off to
//     the release page where they can grab the new build.
//
// Returns `true` if we successfully kicked off the update flow (page
// is about to reload on web, browser tab opened on native) and
// `false` if something went wrong — the dialog reads this and shows
// an error toast on failure instead of silently dismissing.

import 'update_checker.dart';

import 'update_applier_io.dart'
    if (dart.library.html) 'update_applier_web.dart';

Future<bool> applyUpdate(UpdateInfo info) => doApplyUpdate(info);
