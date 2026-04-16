// DropError — typed error hierarchy for the Drop feature.
//
// The same rationale as call/errors/CallError.js: by tagging every failure
// with a specific class + stable `code`, the UI layer can localise messages
// and decide retry affordances without pattern-matching on raw strings.

export class DropError extends Error {
  constructor(message, { code = 'DROP_ERROR', cause } = {}) {
    super(message);
    this.name = 'DropError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Remote peer vanished from the network before we could talk to them. */
export class PeerOfflineError extends DropError {
  constructor(peerId) {
    super(`Peer ${peerId} is offline`, { code: 'PEER_OFFLINE' });
    this.name = 'PeerOfflineError';
    this.peerId = peerId;
  }
}

/** Remote peer explicitly declined the transfer (drop-rej packet). */
export class RejectedByPeerError extends DropError {
  constructor(peerId, reason) {
    super(`Peer ${peerId} rejected the transfer`, { code: 'REJECTED' });
    this.name = 'RejectedByPeerError';
    this.peerId = peerId;
    this.reason = reason || null;
  }
}

/** Transfer was cancelled (by us, by them, or by timeout). */
export class TransferAbortedError extends DropError {
  constructor(by = 'unknown') {
    super(`Transfer aborted by ${by}`, { code: 'ABORTED' });
    this.name = 'TransferAbortedError';
    this.by = by;
  }
}

/** SHA-256 of an assembled slot didn't match the manifest. */
export class IntegrityError extends DropError {
  constructor(slotId) {
    super(`Integrity check failed for slot ${slotId}`, { code: 'INTEGRITY' });
    this.name = 'IntegrityError';
    this.slotId = slotId;
  }
}

/** Not enough local storage to receive. `need` and `have` are bytes. */
export class QuotaExceededError extends DropError {
  constructor(need, have) {
    super(`Storage quota exceeded: need ${need}, have ${have}`, { code: 'QUOTA' });
    this.name = 'QuotaExceededError';
    this.need = need;
    this.have = have;
  }
}
