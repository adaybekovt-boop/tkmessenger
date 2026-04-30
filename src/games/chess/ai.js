// Chess AI — depth-limited negamax with alpha-beta pruning.
//
// Eval is intentionally tiny: material values + a small central-control bonus
// for pawns and knights. That's enough to play a recognisable game (will grab
// hanging pieces, prefer good trades, avoid losing material) without burning
// CPU we don't have on a phone. Full piece-square tables and a transposition
// table can be layered on later — the public surface is just `pickAiMove`.

import { legalMoves, applyMove, inferStatus, colorOf, typeOf } from './engine.js';

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// 64-square central-control bonus. Only consulted for pawns/knights — the
// effect on heavier pieces is dominated by mobility, which we already get
// implicitly from search.
const CENTER_BONUS = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 5, 5, 5, 5, 0, 0,
  0, 0, 5,10,10, 5, 0, 0,
  0, 0, 5,10,10, 5, 0, 0,
  0, 0, 5, 5, 5, 5, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
];

// Static evaluation from white's perspective: positive = white better.
function evaluate(state) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const sign = colorOf(p) === 'w' ? 1 : -1;
    const ty = typeOf(p);
    score += sign * VALUE[ty];
    if (ty === 'P' || ty === 'N') score += sign * CENTER_BONUS[i];
  }
  return score;
}

// MVV-LVA-ish ordering: try high-value captures first to maximise the chance
// of beta cut-offs near the root. We don't track the moving piece's value
// here; the destination piece value alone is a decent proxy at this depth.
function orderMoves(state, moves) {
  return moves.slice().sort((a, b) => {
    const av = state.board[a.to] ? VALUE[typeOf(state.board[a.to])] : 0;
    const bv = state.board[b.to] ? VALUE[typeOf(state.board[b.to])] : 0;
    if (bv !== av) return bv - av;
    // Promotions next — chasing a queen is usually the right call.
    return (b.promotion ? 1 : 0) - (a.promotion ? 1 : 0);
  });
}

// Negamax with alpha-beta. Score is returned from the *side-to-move's*
// perspective at every node. Mate scores are scaled so the engine prefers
// shorter mates over longer ones.
function negamax(state, depth, alpha, beta) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return inferStatus(state) === 'checkmate' ? -100000 - depth : 0;
  }
  if (depth === 0) {
    const turnSign = state.turn === 'w' ? 1 : -1;
    return evaluate(state) * turnSign;
  }
  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const next = applyMove(state, m);
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Pick the best move for the side-to-move at the given search depth.
 * Returns `null` if the position has no legal moves (caller should already
 * have detected mate/stalemate before calling this).
 *
 * Difficulty mapping (depth):
 *   1 — easy:    1-ply lookahead, will hang pieces back occasionally.
 *   2 — medium:  2-ply, catches simple tactics.
 *   3 — hard:    3-ply, tactical at a club level.
 */
export function pickAiMove(state, depth = 2) {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const ordered = orderMoves(state, moves);
  let bestMove = ordered[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const m of ordered) {
    const next = applyMove(state, m);
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
      if (score > alpha) alpha = score;
    }
  }
  return bestMove;
}
