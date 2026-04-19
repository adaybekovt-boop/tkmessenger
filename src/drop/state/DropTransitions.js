// DropTransitions — state-machine guard.
//
// Same pattern as call/state/CallStatus.js: a static adjacency map that spells
// out which transitions are legal, plus a `canTransition` helper used by
// DropManager._transitionTo to refuse invalid state changes and warn loudly.
//
// Re-entering the same state is always allowed (patch-only updates).

import { DropStatus as S } from './DropStatus.js';

const TRANSITIONS = {
  [S.IDLE]:              [S.BEACON, S.AWAITING_CONSENT],
  [S.BEACON]:            [S.IDLE, S.REQUESTING, S.AWAITING_CONSENT],
  [S.REQUESTING]:        [S.TRANSFERRING, S.BEACON, S.ERROR],
  [S.AWAITING_CONSENT]:  [S.TRANSFERRING, S.BEACON, S.IDLE, S.ERROR],
  [S.TRANSFERRING]:      [S.DONE, S.ERROR, S.BEACON],
  [S.DONE]:              [S.BEACON, S.IDLE],
  [S.ERROR]:             [S.BEACON, S.IDLE]
};

export function canTransition(from, to) {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}
