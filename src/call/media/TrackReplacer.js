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

  // Try to find existing video sender (even if its track is null/ended)
  let sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  if (!sender) {
    // Fallback: look for senders with a null track that originally had video
    sender = pc.getSenders().find((s) => !s.track || s.track.kind === 'video');
  }
  if (!sender) {
    // Last resort: add a new transceiver with the video track
    try {
      if (typeof pc.addTrack === 'function') {
        const localStream = pc.getLocalStreams?.()[0];
        if (localStream) {
          localStream.addTrack(newTrack);
          pc.addTrack(newTrack, localStream);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  try {
    await sender.replaceTrack(newTrack);
    return true;
  } catch (_) {
    return false;
  }
}
