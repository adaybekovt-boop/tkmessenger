// Wire protocol for PvP Blackjack. Every message is a plain JSON object that
// rides inside the envelope `{ type: 'game', payload: ... }` of the encrypted
// reliable channel. The `game` kept here is 'bj21' so we never confuse
// messages meant for another mini-game sharing the same transport.

export const GAME_KEY = 'bj21';

/**
 * Invitation sent from initiator to invitee. Both peers derive the same
 * deck seed from `sessionId` — the initiator picks it.
 *
 * @param {object} p
 * @param {string} p.sessionId   — shared session id (also used as deck seed)
 * @param {number} p.bet         — opening bet (chips)
 * @param {string} p.fromName    — initiator display name (shown in lobby)
 */
export function inviteMsg({ sessionId, bet, fromName }) {
  return {
    game: GAME_KEY,
    kind: 'invite',
    sessionId,
    bet: Number(bet) || 0,
    fromName: String(fromName || ''),
  };
}

export function acceptMsg({ sessionId, fromName }) {
  return {
    game: GAME_KEY,
    kind: 'accept',
    sessionId,
    fromName: String(fromName || ''),
  };
}

export function declineMsg({ sessionId, reason = '' }) {
  return { game: GAME_KEY, kind: 'decline', sessionId, reason };
}

export function leaveMsg({ sessionId }) {
  return { game: GAME_KEY, kind: 'leave', sessionId };
}

export function actionMsg({ sessionId, round, action }) {
  return { game: GAME_KEY, kind: 'action', sessionId, round, action };
}

export function isBjMessage(payload) {
  return payload && typeof payload === 'object' && payload.game === GAME_KEY;
}
