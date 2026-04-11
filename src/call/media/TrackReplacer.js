// Low-level helper around `RTCRtpSender.replaceTrack`. Extracted so both
// CameraSwitcher and ScreenShareController share one code path for finding
// the video sender on a PeerJS call's underlying RTCPeerConnection.

/**
 * Replace the video track on the active call's outbound RTP sender.
 *
 * @param {object} call          — PeerJS MediaConnection (has .peerConnection)
 * @param {MediaStreamTrack} newTrack
 * @returns {Promise<boolean>}   — true if replacement succeeded
 */
export async function replaceVideoTrack(call, newTrack) {
  const pc = call?.peerConnection;
  if (!pc || typeof pc.getSenders !== 'function') return false;
  const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  if (!sender) return false;
  try {
    await sender.replaceTrack(newTrack);
    return true;
  } catch (_) {
    return false;
  }
}
