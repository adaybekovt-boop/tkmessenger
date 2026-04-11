// Single source of truth for the call state machine statuses.
// Any code that compares against a literal 'idle' / 'in-call' should import
// from here instead.

export const CallStatus = Object.freeze({
  IDLE: 'idle',
  CALLING: 'calling',   // we dialed out, awaiting answer
  RINGING: 'ringing',   // incoming call, waiting for accept/reject
  IN_CALL: 'in-call',   // media flowing in both directions
  ENDING: 'ending'      // teardown in progress
});

/** Valid state transitions. Centralised so CallManager stays honest. */
export const CALL_TRANSITIONS = Object.freeze({
  [CallStatus.IDLE]:    [CallStatus.CALLING, CallStatus.RINGING],
  [CallStatus.CALLING]: [CallStatus.IN_CALL, CallStatus.ENDING, CallStatus.IDLE],
  [CallStatus.RINGING]: [CallStatus.IN_CALL, CallStatus.ENDING, CallStatus.IDLE],
  [CallStatus.IN_CALL]: [CallStatus.ENDING, CallStatus.IDLE],
  [CallStatus.ENDING]:  [CallStatus.IDLE]
});

export function canTransition(from, to) {
  const allowed = CALL_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}
