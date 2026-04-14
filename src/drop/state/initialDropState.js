// initialDropState — factory for a fresh Drop state snapshot.
//
// Kept as a factory (not a frozen constant) so every `setState(() => …)` call
// gets its own object and there's no accidental shared-reference drift.

import { DropStatus } from './DropStatus.js';

export function createInitialDropState() {
  return {
    status: DropStatus.IDLE,
    /** True whenever BeaconListener is running — even if publishing is off. */
    beaconActive: false,
    /** User toggle: "can others see me in their radar". */
    visibilityEnabled: true,
    /** Sorted-by-proximity list of peers currently advertising Drop. */
    presence: [],
    /** Placeholder for an active send/receive session (chunk #3 populates it). */
    activeSession: null,
    /** Last DropError, if any. Cleared on next successful transition. */
    error: null
  };
}
