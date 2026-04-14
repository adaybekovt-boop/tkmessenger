function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

let lastVibrationAt = 0;

export function vibrate(pattern, { minIntervalMs = 120 } = {}) {
  if (!canVibrate()) return false;
  const now = Date.now();
  if (now - lastVibrationAt < minIntervalMs) return false;
  lastVibrationAt = now;
  try {
    return navigator.vibrate(pattern);
  } catch (_) {
    return false;
  }
}

export function hapticTap() {
  return vibrate(12);
}

export function hapticMessage() {
  return vibrate([18, 24, 18], { minIntervalMs: 450 });
}

