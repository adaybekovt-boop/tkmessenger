// Chess engine — pure (no React, no DOM, no network).
//
// Board representation:
//   board: flat 64-element array, index 0 = a8, index 7 = h8, index 56 = a1,
//   index 63 = h1. Each cell is either '' (empty) or a 2-char string like
//   'wK' / 'bQ' (colour + piece type). Piece types: P,N,B,R,Q,K.
//
// State shape:
//   { board, turn: 'w'|'b', castling: {wK,wQ,bK,bQ}, enPassant: idx|null,
//     halfmove, fullmove, lastMove: {from, to, piece, captured?} | null }
//
// Moves are { from: idx, to: idx, promotion?: 'Q'|'R'|'B'|'N' }. The engine
// only ever exposes *legal* moves (i.e. that don't leave the mover's king in
// check); pseudo-legal generation is internal.

const FILES = 'abcdefgh';

export function idx(file, rank) { return (8 - rank) * 8 + file; }
export function fileOf(i) { return i & 7; }
export function rankOf(i) { return 8 - (i >> 3); }
export function squareName(i) { return `${FILES[fileOf(i)]}${rankOf(i)}`; }
export function colorOf(piece) { return piece ? piece[0] : ''; }
export function typeOf(piece) { return piece ? piece[1] : ''; }
export function opposite(c) { return c === 'w' ? 'b' : 'w'; }

const INITIAL_BOARD = (() => {
  const b = Array(64).fill('');
  const back = ['R','N','B','Q','K','B','N','R'];
  for (let f = 0; f < 8; f++) {
    b[f] = 'b' + back[f];
    b[8 + f] = 'bP';
    b[48 + f] = 'wP';
    b[56 + f] = 'w' + back[f];
  }
  return b;
})();

export function initialState() {
  return {
    board: INITIAL_BOARD.slice(),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
    lastMove: null,
  };
}

// Files are 0..7 (a..h), ranks are 1..8 — chess convention. Out-of-range
// targets must be rejected here, otherwise sliders happily run off the board
// and start synthesising bogus "rank 0" squares that map to undefined cells.
function inBounds(f, r) { return f >= 0 && f < 8 && r >= 1 && r <= 8; }

const KNIGHT_OFFSETS = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const KING_OFFSETS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const BISHOP_DIRS = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ROOK_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

// Find the king of the given colour. Returns its idx or -1 if absent
// (shouldn't happen in normal play but we guard anyway).
function findKing(board, color) {
  const target = color + 'K';
  for (let i = 0; i < 64; i++) if (board[i] === target) return i;
  return -1;
}

// True iff `color`'s pieces attack square `target`. Used both for check
// detection and for filtering castling paths.
export function isSquareAttacked(board, target, byColor) {
  const tf = fileOf(target), tr = rankOf(target);
  // Pawn attacks. White pawns attack diagonally upwards (towards rank 8),
  // black pawns downwards.
  const dir = byColor === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const f = tf + df, r = tr - dir;
    if (inBounds(f, r) && board[idx(f, r)] === byColor + 'P') return true;
  }
  // Knights.
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = tf + df, r = tr + dr;
    if (inBounds(f, r) && board[idx(f, r)] === byColor + 'N') return true;
  }
  // Sliders (B/Q on diagonals, R/Q on files/ranks) and king (one step).
  for (const [df, dr] of BISHOP_DIRS) {
    let f = tf + df, r = tr + dr, step = 1;
    while (inBounds(f, r)) {
      const p = board[idx(f, r)];
      if (p) {
        if (p === byColor + 'B' || p === byColor + 'Q') return true;
        if (step === 1 && p === byColor + 'K') return true;
        break;
      }
      f += df; r += dr; step++;
    }
  }
  for (const [df, dr] of ROOK_DIRS) {
    let f = tf + df, r = tr + dr, step = 1;
    while (inBounds(f, r)) {
      const p = board[idx(f, r)];
      if (p) {
        if (p === byColor + 'R' || p === byColor + 'Q') return true;
        if (step === 1 && p === byColor + 'K') return true;
        break;
      }
      f += df; r += dr; step++;
    }
  }
  return false;
}

export function isCheck(state) {
  const k = findKing(state.board, state.turn);
  if (k < 0) return false;
  return isSquareAttacked(state.board, k, opposite(state.turn));
}

// Pseudo-legal moves for the piece at `from`. Does not yet filter for
// self-check — callers in `legalMoves` do that by trying each move.
function pseudoMoves(state, from) {
  const piece = state.board[from];
  if (!piece) return [];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const f = fileOf(from), r = rankOf(from);
  const moves = [];

  const pushIfFreeOrEnemy = (tf, tr) => {
    if (!inBounds(tf, tr)) return false;
    const ti = idx(tf, tr);
    const tp = state.board[ti];
    if (!tp) { moves.push({ from, to: ti }); return true; }
    if (colorOf(tp) !== color) { moves.push({ from, to: ti }); return false; }
    return false;
  };

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 2 : 7;
    const promoRank = color === 'w' ? 8 : 1;
    const oneF = f, oneR = r + dir;
    if (inBounds(oneF, oneR) && !state.board[idx(oneF, oneR)]) {
      const to = idx(oneF, oneR);
      if (oneR === promoRank) for (const p of ['Q','R','B','N']) moves.push({ from, to, promotion: p });
      else moves.push({ from, to });
      // Two-square push from starting rank.
      if (r === startRank) {
        const twoR = r + 2 * dir;
        if (!state.board[idx(f, twoR)]) moves.push({ from, to: idx(f, twoR) });
      }
    }
    // Captures (incl. en passant). Pawns can never move/capture without a
    // diagonal target — empty diagonals are skipped here.
    for (const df of [-1, 1]) {
      const tf = f + df, tr = r + dir;
      if (!inBounds(tf, tr)) continue;
      const ti = idx(tf, tr);
      const tp = state.board[ti];
      if (tp && colorOf(tp) !== color) {
        if (tr === promoRank) for (const p of ['Q','R','B','N']) moves.push({ from, to: ti, promotion: p });
        else moves.push({ from, to: ti });
      } else if (state.enPassant === ti) {
        moves.push({ from, to: ti, enPassant: true });
      }
    }
  }

  if (type === 'N') {
    for (const [df, dr] of KNIGHT_OFFSETS) pushIfFreeOrEnemy(f + df, r + dr);
  }

  if (type === 'B' || type === 'Q') {
    for (const [df, dr] of BISHOP_DIRS) {
      let tf = f + df, tr = r + dr;
      while (pushIfFreeOrEnemy(tf, tr)) { tf += df; tr += dr; }
    }
  }

  if (type === 'R' || type === 'Q') {
    for (const [df, dr] of ROOK_DIRS) {
      let tf = f + df, tr = r + dr;
      while (pushIfFreeOrEnemy(tf, tr)) { tf += df; tr += dr; }
    }
  }

  if (type === 'K') {
    for (const [df, dr] of KING_OFFSETS) pushIfFreeOrEnemy(f + df, r + dr);
    // Castling. Only allowed when:
    //   - the king and the relevant rook haven't moved (tracked in castling)
    //   - all squares between them are empty
    //   - the king is not currently in check
    //   - the king's path doesn't pass through an attacked square
    const enemy = opposite(color);
    const homeRank = color === 'w' ? 1 : 8;
    if (r === homeRank && f === 4 && !isSquareAttacked(state.board, from, enemy)) {
      // King-side: f1/f8 + g1/g8 must be empty, neither attacked.
      if (state.castling[color + 'K']
          && !state.board[idx(5, homeRank)] && !state.board[idx(6, homeRank)]
          && !isSquareAttacked(state.board, idx(5, homeRank), enemy)
          && !isSquareAttacked(state.board, idx(6, homeRank), enemy)) {
        moves.push({ from, to: idx(6, homeRank), castle: 'K' });
      }
      // Queen-side: b/c/d files must be empty; only c & d need to be safe
      // for the king to traverse (b1/b8 isn't crossed by the king).
      if (state.castling[color + 'Q']
          && !state.board[idx(1, homeRank)] && !state.board[idx(2, homeRank)] && !state.board[idx(3, homeRank)]
          && !isSquareAttacked(state.board, idx(2, homeRank), enemy)
          && !isSquareAttacked(state.board, idx(3, homeRank), enemy)) {
        moves.push({ from, to: idx(2, homeRank), castle: 'Q' });
      }
    }
  }

  return moves;
}

// Apply a move to the board, returning a fresh state. The caller is expected
// to have validated the move via `legalMoves`/`legalMovesFrom`, but we still
// resolve castling/en-passant/promotion side-effects here so wire-protocol
// messages from the network can reuse this path safely.
export function applyMove(state, move) {
  const board = state.board.slice();
  const piece = board[move.from];
  const color = colorOf(piece);
  const type = typeOf(piece);
  let captured = board[move.to] || null;

  // Move the piece.
  board[move.to] = piece;
  board[move.from] = '';

  // En passant capture: the captured pawn sits next to the destination, not on it.
  if (move.enPassant) {
    const dir = color === 'w' ? 1 : -1;
    const capIdx = idx(fileOf(move.to), rankOf(move.to) - dir);
    captured = board[capIdx];
    board[capIdx] = '';
  }

  // Promotion: replace the pawn with the chosen piece on the back rank.
  if (move.promotion) {
    board[move.to] = color + move.promotion;
  }

  // Castling: also move the rook over the king.
  if (move.castle) {
    const homeRank = color === 'w' ? 1 : 8;
    if (move.castle === 'K') {
      board[idx(5, homeRank)] = color + 'R';
      board[idx(7, homeRank)] = '';
    } else {
      board[idx(3, homeRank)] = color + 'R';
      board[idx(0, homeRank)] = '';
    }
  }

  // Update castling rights. King moves kill both sides; rook moves kill the
  // matching side; capturing a rook on its starting square also kills.
  const castling = { ...state.castling };
  if (type === 'K') { castling[color + 'K'] = false; castling[color + 'Q'] = false; }
  if (type === 'R') {
    if (move.from === idx(0, color === 'w' ? 1 : 8)) castling[color + 'Q'] = false;
    if (move.from === idx(7, color === 'w' ? 1 : 8)) castling[color + 'K'] = false;
  }
  // Rook captured on a corner — opposing side loses that castling right.
  const otherHome = color === 'w' ? 8 : 1;
  if (move.to === idx(0, otherHome)) castling[opposite(color) + 'Q'] = false;
  if (move.to === idx(7, otherHome)) castling[opposite(color) + 'K'] = false;

  // En passant target: only set when a pawn just moved two squares.
  let enPassant = null;
  if (type === 'P' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    const dir = color === 'w' ? 1 : -1;
    enPassant = idx(fileOf(move.from), rankOf(move.from) + dir);
  }

  // 50-move counter — resets on any pawn move or capture.
  const halfmove = (type === 'P' || captured) ? 0 : state.halfmove + 1;
  const fullmove = color === 'b' ? state.fullmove + 1 : state.fullmove;

  return {
    board,
    turn: opposite(state.turn),
    castling,
    enPassant,
    halfmove,
    fullmove,
    lastMove: { from: move.from, to: move.to, piece, captured, promotion: move.promotion || null, castle: move.castle || null },
  };
}

// All legal moves for the side-to-move. We generate pseudo-legal moves and
// drop the ones that leave the mover in check — the simplest correct approach
// for a UI-grade engine and fast enough for any reasonable mover frequency.
export function legalMoves(state) {
  const out = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p || colorOf(p) !== state.turn) continue;
    for (const m of pseudoMoves(state, i)) {
      const next = applyMove(state, m);
      // After applying, opponent is to move; we need to ensure *our* king
      // (the side that just moved) is not in check.
      const ourKing = findKing(next.board, state.turn);
      if (ourKing >= 0 && !isSquareAttacked(next.board, ourKing, opposite(state.turn))) {
        out.push(m);
      }
    }
  }
  return out;
}

export function legalMovesFrom(state, from) {
  return legalMoves(state).filter((m) => m.from === from);
}

export function inferStatus(state) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return isCheck(state) ? 'checkmate' : 'stalemate';
  }
  if (state.halfmove >= 100) return 'draw50';
  return isCheck(state) ? 'check' : 'playing';
}
