// Factory for the initial call state snapshot. Used both by CallManager
// (starting state) and useCallSession (initial React state), so there's
// exactly one definition.

import { CallStatus } from './CallStatus.js';

export function createInitialCallState() {
  return {
    status: CallStatus.IDLE,
    remoteId: '',
    videoEnabled: true,
    audioEnabled: true,
    localStream: null,
    remoteStream: null,
    screenSharing: false,
    facingMode: 'user'
  };
}
