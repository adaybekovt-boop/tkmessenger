// Glare resolution — decides what to do when a call comes in while we're
// in a state that's already call-related.
//
// "Glare" = both peers dial each other at the same instant. Without a rule,
// both sides end up ringing simultaneously and neither picks up.
//
// The rule: the peer with the lexicographically smaller id keeps its outgoing
// call; the other side cancels its outgoing and accepts the incoming. This is
// deterministic and symmetric — both sides arrive at the same conclusion.
//
// Pure function, no side effects, no dependencies. Trivially unit-testable.

import { CallStatus } from './CallStatus.js';

/** @typedef {'accept-incoming'|'keep-outgoing'|'reject-busy'|'reject-blocked'|'reject-self'|'accept-fresh'} GlareDecision */

/**
 * @param {object} args
 * @param {string} args.myPeerId
 * @param {string} args.callerId
 * @param {string} args.currentStatus     — current CallStatus
 * @param {string} args.currentRemoteId
 * @param {boolean} [args.isBlocked]
 * @returns {GlareDecision}
 */
export function resolveGlare({
  myPeerId,
  callerId,
  currentStatus,
  currentRemoteId,
  isBlocked = false
}) {
  if (!callerId) return 'reject-busy';
  if (isBlocked) return 'reject-blocked';
  if (callerId === myPeerId) return 'reject-self';

  // Already talking to someone — drop the new one.
  if (currentStatus === CallStatus.IN_CALL) return 'reject-busy';

  // Glare: we are dialing the exact peer who is now dialing us.
  if (currentStatus === CallStatus.CALLING && currentRemoteId === callerId) {
    const keepOutgoing = Boolean(myPeerId) && myPeerId.localeCompare(String(callerId)) < 0;
    return keepOutgoing ? 'keep-outgoing' : 'accept-incoming';
  }

  // Normal incoming.
  return 'accept-fresh';
}
