// MediaAcquirer — the *only* place in the call feature that calls
// `getUserMedia`. Centralising it means:
//   1. video→audio fallback logic lives exactly once
//   2. every DOMException gets translated into a typed CallError
//   3. tests can mock one module instead of a scattered API
//
// No state, no side effects beyond the browser permission prompt.

import { getAudioConstraints, getVideoConstraints } from './mediaConstraints.js';
import { mapMediaError } from '../errors/mapMediaError.js';
import { PermissionDeniedError } from '../errors/CallError.js';

function assertMediaSupport() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new PermissionDeniedError('media', {
      cause: new Error('navigator.mediaDevices.getUserMedia is unavailable (requires HTTPS)')
    });
  }
}

/**
 * Acquire a local MediaStream with graceful video→audio fallback.
 *
 * - If `videoEnabled` is true, tries audio+video first
 * - On *any* failure while video was requested, retries with audio-only
 * - If that still fails, rethrows the second error as a typed CallError
 *
 * @param {object} opts
 * @param {boolean} [opts.videoEnabled=true]
 * @param {'user'|'environment'} [opts.facingMode='user']
 * @returns {Promise<MediaStream>}
 */
export async function acquireLocalStream({ videoEnabled = true, facingMode = 'user' } = {}) {
  assertMediaSupport();
  const audio = getAudioConstraints();
  const video = getVideoConstraints(videoEnabled, facingMode);

  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video });
  } catch (firstErr) {
    // If the user explicitly didn't want video, don't silently swap to audio —
    // that would hide a real failure.
    if (!videoEnabled) throw mapMediaError(firstErr, 'microphone');

    // Video failed but audio-only might still work (camera busy, no permission
    // on video specifically, etc.). Try the degraded path.
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch (secondErr) {
      throw mapMediaError(secondErr, 'microphone');
    }
  }
}

/**
 * Acquire a camera-only stream for camera switch (no audio track — the
 * existing audio track stays live).
 */
export async function acquireCameraStream(facingMode) {
  assertMediaSupport();
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode } }
    });
  } catch (err) {
    throw mapMediaError(err, 'camera');
  }
}
