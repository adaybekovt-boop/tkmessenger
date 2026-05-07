// Port of src/core/platform.js — platform detection adapter.
//
// The JS version distinguishes Tauri / Capacitor / plain Web by probing
// `window.__TAURI__` and `window.Capacitor`. In Flutter there is no browser
// globals to probe — the app ships as a native binary — so the equivalent
// split is "which host OS are we running on?". We use `dart:io`'s `Platform`.
//
// The `getIdentity()` helper in the JS source dynamically imports either
// `@tauri-apps/api/core` or `./idbStore.js`. In Flutter the identity always
// lives in the local Drift database / secure storage, so we expose a stub
// that the main agent can wire up to the real keystore once the call-sites
// are ported. The API signature is kept so downstream code compiles.

import 'dart:io' show Platform;

/// Snapshot of which host platform we're running on. Analogous to the
/// `platform` export in the JS source.
class PlatformInfo {
  const PlatformInfo({
    required this.isAndroid,
    required this.isIOS,
    required this.isMacOS,
    required this.isWindows,
    required this.isLinux,
    required this.isFuchsia,
  });

  final bool isAndroid;
  final bool isIOS;
  final bool isMacOS;
  final bool isWindows;
  final bool isLinux;
  final bool isFuchsia;

  /// True when running on a phone/tablet OS.
  bool get isMobile => isAndroid || isIOS;

  /// True when running on a traditional desktop OS.
  bool get isDesktop => isMacOS || isWindows || isLinux;
}

final PlatformInfo platform = PlatformInfo(
  isAndroid: Platform.isAndroid,
  isIOS: Platform.isIOS,
  isMacOS: Platform.isMacOS,
  isWindows: Platform.isWindows,
  isLinux: Platform.isLinux,
  isFuchsia: Platform.isFuchsia,
);

bool isAndroid() => Platform.isAndroid;
bool isIOS() => Platform.isIOS;
bool isMacOS() => Platform.isMacOS;
bool isWindows() => Platform.isWindows;
bool isLinux() => Platform.isLinux;
bool isMobile() => platform.isMobile;
bool isDesktop() => platform.isDesktop;

/// Load the local identity record.
///
/// TODO(port): wire this to the real key store once `key_store.dart` /
/// `identity_key.dart` expose a flat "load identity" call. In the JS source
/// this either hits Tauri's invoke() or the IndexedDB helper.
Future<Map<String, Object?>?> getIdentity() async {
  return null;
}
