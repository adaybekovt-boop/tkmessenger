// Camera facing-mode switcher. Owns the sequence:
//   1. acquire a fresh stream with the opposite facingMode
//   2. replaceTrack on the active RTCRtpSender
//   3. update the local stream in the pool (which stops the old track)
//
// Anything that goes wrong (permission revoked mid-call, device yanked,
// old Android camera2 bugs) throws a typed CallError so the UI can decide
// what to show — we don't bury errors in console.warn.

import { acquireCameraStream } from './MediaAcquirer.js';
import { replaceVideoTrack } from './TrackReplacer.js';

export class CameraSwitcher {
  /** @param {import('./MediaStreamPool.js').MediaStreamPool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Toggle between front and back camera.
   *
   * @param {object} activeCall        — the live PeerJS call object
   * @param {'user'|'environment'} currentFacing
   * @returns {Promise<'user'|'environment'>} the new facingMode
   */
  async switch(activeCall, currentFacing) {
    const nextFacing = currentFacing === 'user' ? 'environment' : 'user';

    // Let errors bubble — callers (CallManager) wrap and emit them.
    const freshStream = await acquireCameraStream(nextFacing);
    const newTrack = freshStream.getVideoTracks()[0];
    if (!newTrack) {
      // Fresh stream had no video — kill it and keep current facing.
      try { freshStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return currentFacing;
    }

    const ok = await replaceVideoTrack(activeCall, newTrack);
    if (!ok) {
      // Sender replacement failed — drop the orphan track so we don't leak.
      try { newTrack.stop(); } catch (_) {}
      try { freshStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return currentFacing;
    }

    // Pool swaps the old local video track for the new one (also stops old).
    this.pool.replaceLocalVideoTrack(newTrack);
    return nextFacing;
  }
}
