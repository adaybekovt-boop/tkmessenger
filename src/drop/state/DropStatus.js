// DropStatus — enum of top-level states the Drop feature can be in.
//
// IDLE              — Drop tab closed. No beacons, no listening.
// BEACON            — Drop tab open. Advertising presence + listening to others.
// REQUESTING        — We sent a drop-req and are waiting for accept/reject.
// AWAITING_CONSENT  — Someone sent us a drop-req; user is deciding.
// TRANSFERRING      — Handshake complete, bytes flowing.
// DONE              — Transfer finished successfully (transient, auto-returns).
// ERROR             — Something broke; error sits in state.error.

export const DropStatus = Object.freeze({
  IDLE: 'idle',
  BEACON: 'beacon',
  REQUESTING: 'requesting',
  AWAITING_CONSENT: 'awaiting-consent',
  TRANSFERRING: 'transferring',
  DONE: 'done',
  ERROR: 'error'
});
