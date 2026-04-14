// Media constraint resolvers — read user prefs from localStorage.
//
// Lives inside `call/` now (previously in `peer/`) because constraints only
// matter for calls. The peer/transport layer doesn't touch microphones.

import { STORAGE, safeJsonParse } from '../../peer/helpers.js';

export function getAudioConstraints() {
  try {
    const raw = localStorage.getItem(STORAGE.micSettings);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    if (parsed && typeof parsed === 'object') {
      return {
        deviceId: parsed.deviceId ? { exact: parsed.deviceId } : undefined,
        echoCancellation: parsed.echoCancellation !== false,
        noiseSuppression: parsed.noiseSuppression !== false,
        autoGainControl: parsed.autoGainControl !== false
      };
    }
  } catch (_) {
  }
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
}

export function getVideoConstraints(videoEnabled, facingMode = 'user') {
  if (!videoEnabled) return false;
  let saver = false;
  try {
    saver = localStorage.getItem(STORAGE.powerSaver) === '1';
  } catch (_) {
  }
  if (saver) {
    return {
      width: { ideal: 320, max: 426 },
      height: { ideal: 240, max: 240 },
      facingMode
    };
  }
  return { facingMode };
}
