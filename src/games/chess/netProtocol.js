// Wire protocol for PvP Chess. Messages ride inside { type: 'game', payload }
// of the encrypted reliable channel, same transport that Blackjack uses.

export const GAME_KEY = 'chess';

export function inviteMsg({ sessionId, color, fromName }) {
  return { game: GAME_KEY, kind: 'invite', sessionId, color, fromName: String(fromName || '') };
}

export function acceptMsg({ sessionId, fromName }) {
  return { game: GAME_KEY, kind: 'accept', sessionId, fromName: String(fromName || '') };
}

export function declineMsg({ sessionId, reason = '' }) {
  return { game: GAME_KEY, kind: 'decline', sessionId, reason };
}

export function leaveMsg({ sessionId }) {
  return { game: GAME_KEY, kind: 'leave', sessionId };
}

// `move` is the same { from, to, promotion?, castle?, enPassant? } shape the
// engine consumes. `ply` lets the receiver detect/ignore replays.
export function moveMsg({ sessionId, ply, move }) {
  return { game: GAME_KEY, kind: 'move', sessionId, ply, move };
}

export function resignMsg({ sessionId }) {
  return { game: GAME_KEY, kind: 'resign', sessionId };
}

export function isChessMessage(payload) {
  return payload && typeof payload === 'object' && payload.game === GAME_KEY;
}
