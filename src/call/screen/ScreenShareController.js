// ScreenShareController — handles the "share my screen" path and the
// automatic revert to camera when the user stops sharing (either via our
// UI button or the browser's native "Stop sharing" bar).
//
// Rules enforced here:
//   - the camera track that was active when share started is remembered so
//     stop() can restore it without re-prompting the user
//   - if the camera track was ended in the meantime (e.g. camera disabled),
//     stop() acquires a fresh one via MediaAcquirer
//   - `screenTrack.onended` is wired so the browser's native stop button
//     triggers the same teardown path

import { acquireCameraStream } from '../media/MediaAcquirer.js';
import { replaceVideoTrack } from '../media/TrackReplacer.js';
import { mapMediaError } from '../errors/mapMediaError.js';
import { ScreenShareNotSupportedError } from '../errors/CallError.js';

export class ScreenShareController {
  /** @param {import('../media/MediaStreamPool.js').MediaStreamPool} pool */
  constructor(pool) {
    this.pool = pool;
    /** @type {MediaStreamTrack|null} */
    this._savedCameraTrack = null;
  }

  get isSharing() {
    return Boolean(this.pool.screen);
  }

  /**
   * Start screen sharing. Returns true if share started, false otherwise.
   * Throws typed CallError on unsupported browsers or permission denial.
   *
   * @param {object} activeCall
   * @param {() => void} onNativeStop  — invoked if the browser's native stop
   *                                     button is pressed (so CallManager can
   *                                     react and update state).
   */
  async start(activeCall, onNativeStop) {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new ScreenShareNotSupportedError();
    }

    let screenStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 24 },
        audio: true
      });
    } catch (err) {
      throw mapMediaError(err, 'screen');
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      try { screenStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return false;
    }

    // Remember the camera track BEFORE we swap it out. Null is fine —
    // stop() will acquire a fresh camera stream if needed.
    const local = this.pool.local;
    this._savedCameraTrack = local?.getVideoTracks?.()[0] || null;

    // When the user clicks the browser's native "Stop sharing" bar, the
    // track emits `ended`. Forward that to the CallManager's stop path.
    screenTrack.onended = () => { onNativeStop?.(); };

    const replaced = await replaceVideoTrack(activeCall, screenTrack);
    if (!replaced) {
      try { screenStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      this._savedCameraTrack = null;
      return false;
    }

    this.pool.setScreen(screenStream);
    return true;
  }

  /**
   * Stop screen sharing and restore the camera track on the outbound sender.
   * Safe to call even if `start()` wasn't called (idempotent).
   *
   * @param {object} activeCall
   * @param {'user'|'environment'} [facingMode='user']
   */
  async stop(activeCall, facingMode = 'user') {
    // Releasing the screen stream also stops its tracks via the pool.
    this.pool.setScreen(null);

    const saved = this._savedCameraTrack;
    this._savedCameraTrack = null;

    // Fast path: saved camera track still alive — just put it back.
    if (saved && saved.readyState === 'live') {
      await replaceVideoTrack(activeCall, saved);
      return;
    }

    // Slow path: camera track had ended. Re-acquire.
    try {
      const fresh = await acquireCameraStream(facingMode);
      const track = fresh.getVideoTracks()[0];
      if (!track) {
        try { fresh.getTracks().forEach((t) => t.stop()); } catch (_) {}
        return;
      }
      await replaceVideoTrack(activeCall, track);
      this.pool.replaceLocalVideoTrack(track);
    } catch (_) {
      // Camera unavailable (permission revoked etc). UI will show the
      // remote stream only; CallManager stays in IN_CALL with no local video.
    }
  }
}
