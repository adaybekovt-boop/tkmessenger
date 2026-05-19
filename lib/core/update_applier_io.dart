// Native-side `applyUpdate` impl — opens the release page in the
// system browser. On iOS this lands on Safari (the user can download
// a TestFlight build or open a hosted IPA link), on Android it's the
// default browser (release page → APK), on desktop it's whatever
// handles HTTPS by default.
//
// We deliberately don't try to hot-swap the binary: iOS forbids
// self-update entirely, Android requires `REQUEST_INSTALL_PACKAGES`
// runtime permission + a versioned intent dance, and desktop self-
// update needs per-OS code-signed installers. The release page is the
// universal lowest-common-denominator and matches the user's mental
// model of "where the new build lives".

import 'package:url_launcher/url_launcher.dart';

import 'update_checker.dart';

Future<bool> doApplyUpdate(UpdateInfo info) async {
  final uri = Uri.tryParse(info.releaseUrl);
  if (uri == null) return false;
  try {
    return await launchUrl(
      uri,
      // `externalApplication` forces a hand-off to the system browser
      // instead of an in-app webview — we don't want the release page
      // to render inside the messenger.
      mode: LaunchMode.externalApplication,
    );
  } catch (_) {
    return false;
  }
}
