// Port of src/core/storageCheck.js — storage quota monitoring.
//
// The JS version targets iOS Safari PWAs (~50MB quota) via
// `navigator.storage.estimate()`. Flutter apps don't have a quota-limited
// sandbox in the same way — on Android/iOS the app directory is effectively
// free-storage-bounded, on desktop it's bounded by the disk. The equivalent
// health-check is "how big is our app directory vs how much free space is
// left on the device".
//
// We ship a working-ish version:
//   - [checkStorageUsage] sums file sizes inside the app-support directory
//     (what Drift / attachments use) and compares against available disk
//     space via `File(...).statSync().size` and a platform call when we get
//     one. Since `dart:io` has no cross-platform "free disk" primitive, the
//     free-space side is a stub for now.
//   - [startStorageMonitor] reproduces the throttled timer (check every 5
//     minutes, warn no more than once every 30).
//   - [requestPersistentStorage] has no desktop/mobile analogue; returns
//     true because the app's documents directory is already persistent.
//
// TODO(port): for an accurate free-space reading, add `disk_space_plus` (or
// a platform-channel `statvfs`) to the pubspec.

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:path_provider/path_provider.dart';

const double _thresholdRatio = 0.85;
const Duration _checkInterval = Duration(minutes: 5);
const Duration _warnCooldown = Duration(minutes: 30);

int _lastWarningAt = 0;
Timer? _checkTimer;

/// A single storage-check snapshot — shape matches the JS return value so
/// UI code reading {usage, quota, ratio, warning, usageMB, quotaMB} keeps
/// working.
class StorageUsage {
  const StorageUsage({
    required this.usage,
    required this.quota,
    required this.ratio,
    required this.warning,
    required this.usageMB,
    required this.quotaMB,
  });

  final int usage;
  final int quota;
  final double ratio;
  final bool warning;
  final int usageMB;
  final int quotaMB;
}

Future<int> _dirSize(Directory dir) async {
  if (!await dir.exists()) return 0;
  var total = 0;
  try {
    await for (final entity in dir.list(recursive: true, followLinks: false)) {
      if (entity is File) {
        try {
          total += await entity.length();
        } catch (_) {}
      }
    }
  } catch (_) {}
  return total;
}

/// Returns a [StorageUsage] snapshot, or null if the info cannot be read.
Future<StorageUsage?> checkStorageUsage() async {
  try {
    final supportDir = await getApplicationSupportDirectory();
    final docsDir = await getApplicationDocumentsDirectory();
    final usage = await _dirSize(supportDir) + await _dirSize(docsDir);

    // TODO(port): replace the 0 with a real free-space reading from a
    // platform channel (e.g. disk_space_plus) once wired into pubspec.
    // Without that, we can't compute a meaningful ratio, so report warning=false
    // and leave quota=0. The fields still match the JS shape.
    const quota = 0;
    final ratio = quota > 0 ? usage / quota : 0.0;
    final warning = ratio >= _thresholdRatio;
    return StorageUsage(
      usage: usage,
      quota: quota,
      ratio: ratio,
      warning: warning,
      usageMB: (usage / 1024 / 1024).round(),
      quotaMB: (quota / 1024 / 1024).round(),
    );
  } catch (_) {
    return null;
  }
}

/// True on iOS. The JS helper also returns true on iPadOS desktop-mode
/// Safari; `Platform.isIOS` covers both device types in Flutter. Guarded
/// by `kIsWeb` because `dart:io` `Platform` throws on web builds.
bool isIOSSafari() => !kIsWeb && Platform.isIOS;

/// True when the app is running as a "standalone" installed PWA. In Flutter
/// there's no PWA concept — the app is always native — so this is always
/// true on mobile. On desktop we return true as well (the user installed it).
bool isStandalone() => true;

/// Start a periodic storage check. Returns a cancel function.
void Function() startStorageMonitor(void Function(StorageUsage) onWarning) {
  _checkTimer?.cancel();

  Future<void> run() async {
    final result = await checkStorageUsage();
    if (result == null) return;
    if (!result.warning) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _lastWarningAt < _warnCooldown.inMilliseconds) return;
    _lastWarningAt = now;
    try {
      onWarning(result);
    } catch (_) {}
  }

  // First check after 10s — matches the JS setTimeout(run, 10_000).
  Timer(const Duration(seconds: 10), run);
  _checkTimer = Timer.periodic(_checkInterval, (_) => run());
  return () {
    _checkTimer?.cancel();
    _checkTimer = null;
  };
}

/// In the browser this asks the UA to mark our origin as persistent so the
/// OS won't GC the IDB bytes. In Flutter the app's docs directory is always
/// persistent, so this is a trivially-true no-op.
Future<bool> requestPersistentStorage() async => true;
