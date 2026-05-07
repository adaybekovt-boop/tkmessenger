// Port of src/core/haptics.js — vibration feedback helpers.
//
// JS used `navigator.vibrate(pattern)`. Flutter's `HapticFeedback` is higher
// level (named intensities, no custom patterns) so we map the two call sites
// to the closest Flutter counterparts:
//   hapticTap()      — a single light tap
//   hapticMessage()  — a buzzier medium impact (for incoming message)
//
// The throttle (minIntervalMs) is preserved so rapid calls don't buzz the
// device to death.

import 'package:flutter/services.dart';

int _lastVibrationAt = 0;

Future<bool> _vibrate(Future<void> Function() impl, {int minIntervalMs = 120}) async {
  final now = DateTime.now().millisecondsSinceEpoch;
  if (now - _lastVibrationAt < minIntervalMs) return false;
  _lastVibrationAt = now;
  try {
    await impl();
    return true;
  } catch (_) {
    return false;
  }
}

Future<bool> hapticTap() => _vibrate(HapticFeedback.selectionClick);

Future<bool> hapticMessage() =>
    _vibrate(HapticFeedback.mediumImpact, minIntervalMs: 450);
