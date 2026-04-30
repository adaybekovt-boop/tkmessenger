import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Flag, RotateCcw, Users as UsersIcon, User, Trophy } from 'lucide-react';
import { hapticTap } from '../../core/haptics.js';
import { cx } from '../../utils/common.js';
import { t, useLang } from '../../core/i18n.js';
import {
  initialState,
  legalMovesFrom,
  applyMove,
  inferStatus,
  fileOf,
  rankOf,
  squareName,
  colorOf,
  typeOf,
} from './engine.js';

// Unicode glyphs — keeps the bundle tiny vs shipping piece SVGs. The same
// glyphs render fine on every platform (system fonts ship outlines).
const GLYPHS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

// Reducer keeps the game state immutable so the board re-render is just a
// reference comparison. Actions are { type, payload? }.
function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { state: initialState(), history: [], promotion: null, ended: null };
    case 'select':
      return { ...state, selected: action.from };
    case 'clearSelect':
      return { ...state, selected: null };
    case 'apply': {
      const next = applyMove(state.state, action.move);
      const status = inferStatus(next);
      const ended = status === 'checkmate' || status === 'stalemate' || status === 'draw50'
        ? { status, winner: status === 'checkmate' ? state.state.turn : null }
        : state.ended;
      return {
        ...state,
        state: next,
        history: state.history.concat({ move: action.move, before: state.state }),
        selected: null,
        promotion: null,
        ended,
      };
    }
    case 'promotionPrompt':
      return { ...state, promotion: action.payload };
    case 'cancelPromotion':
      return { ...state, promotion: null };
    case 'resign': {
      // Whoever resigned loses; if `by` not provided we default to side-to-move.
      const loser = action.by || state.state.turn;
      return { ...state, ended: { status: 'resigned', winner: loser === 'w' ? 'b' : 'w' } };
    }
    default:
      return state;
  }
}

function freshGame() {
  return { state: initialState(), history: [], selected: null, promotion: null, ended: null };
}

function statusLine(state, ended) {
  if (ended) {
    if (ended.status === 'checkmate') {
      return `${t('chess.checkmate')} · ${ended.winner === 'w' ? t('chess.win.white') : t('chess.win.black')}`;
    }
    if (ended.status === 'resigned') {
      return ended.winner === 'w' ? t('chess.win.white') : t('chess.win.black');
    }
    if (ended.status === 'stalemate') return t('chess.stalemate');
    if (ended.status === 'draw50') return t('chess.draw50');
  }
  const status = inferStatus(state);
  const turn = state.turn === 'w' ? t('chess.turn.white') : t('chess.turn.black');
  if (status === 'check') return `${turn} · ${t('chess.check')}`;
  return turn;
}

function CapturedRow({ board, color }) {
  // Captured pieces = full set − pieces on board. We display them as glyphs in
  // a compact strip so the player can see material balance at a glance.
  const STARTING = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const counts = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
  for (const sq of board) {
    if (sq && colorOf(sq) === color) {
      const ty = typeOf(sq);
      if (counts[ty] !== undefined) counts[ty]++;
    }
  }
  const captured = [];
  for (const ty of ['Q','R','B','N','P']) {
    const missing = STARTING[ty] - counts[ty];
    for (let i = 0; i < missing; i++) captured.push(color + ty);
  }
  if (captured.length === 0) {
    return <div className="h-6 text-[11px] text-[rgb(var(--orb-muted-rgb))]/60">—</div>;
  }
  return (
    <div className="flex h-6 flex-wrap items-center gap-0.5 text-base leading-none">
      {captured.map((p, i) => <span key={i}>{GLYPHS[p]}</span>)}
    </div>
  );
}

function Board({ game, dispatch, viewColor = 'w', locked }) {
  const { state, selected, ended } = game;
  // When the player picks a square: if a piece of the side-to-move sits there,
  // select it (or unselect on second tap). If a square highlighted as a legal
  // move target is tapped, we apply the move (handling promotion specially).
  const onSquare = (i) => {
    if (locked || ended) return;
    const piece = state.board[i];
    if (selected === i) { dispatch({ type: 'clearSelect' }); return; }
    if (selected != null) {
      const moves = legalMovesFrom(state, selected);
      const candidates = moves.filter((m) => m.to === i);
      if (candidates.length === 0) {
        // Re-select if the user clicked another of their pieces.
        if (piece && colorOf(piece) === state.turn) {
          hapticTap();
          dispatch({ type: 'select', from: i });
        } else {
          dispatch({ type: 'clearSelect' });
        }
        return;
      }
      hapticTap();
      // Promotion path: ask which piece to promote to before applying.
      if (candidates.some((m) => m.promotion)) {
        dispatch({ type: 'promotionPrompt', payload: { from: selected, to: i, color: state.turn, candidates } });
        return;
      }
      dispatch({ type: 'apply', move: candidates[0] });
      return;
    }
    if (piece && colorOf(piece) === state.turn) {
      hapticTap();
      dispatch({ type: 'select', from: i });
    }
  };

  const legalTargets = useMemo(() => {
    if (selected == null) return new Set();
    return new Set(legalMovesFrom(state, selected).map((m) => m.to));
  }, [state, selected]);

  // Build the indices in display order. White's view shows a1 at bottom-left
  // (idx 56), so we list ranks 8 → 1 top-down; black's view flips both axes.
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let f = 0; f < 8; f++) {
      const file = viewColor === 'w' ? f : 7 - f;
      const rank = viewColor === 'w' ? r : 7 - r;
      row.push(rank * 8 + file);
    }
    rows.push(row);
  }

  const lastMove = state.lastMove;

  return (
    <div className="aspect-square w-full max-w-[440px] rounded-2xl bg-[rgb(var(--orb-surface-rgb))] p-1.5 ring-1 ring-[rgb(var(--orb-border-rgb))] shadow-lg">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl">
        {rows.flat().map((i) => {
          const isDark = (fileOf(i) + rankOf(i)) % 2 === 0;
          const piece = state.board[i];
          const isSelected = selected === i;
          const isTarget = legalTargets.has(i);
          const isLastFrom = lastMove && lastMove.from === i;
          const isLastTo = lastMove && lastMove.to === i;
          const fileLabel = fileOf(i) === (viewColor === 'w' ? 0 : 7) ? rankOf(i) : null;
          const rankLabel = rankOf(i) === (viewColor === 'w' ? 1 : 8) ? 'abcdefgh'[fileOf(i)] : null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              className={cx(
                'relative flex select-none items-center justify-center text-[clamp(22px,7vw,40px)] leading-none transition-colors',
                isDark ? 'bg-[#769656]' : 'bg-[#eeeed2]',
                isSelected && 'ring-2 ring-inset ring-[rgb(var(--orb-accent-rgb))]',
                (isLastFrom || isLastTo) && !isSelected && 'ring-2 ring-inset ring-yellow-400/40',
              )}
              aria-label={squareName(i) + (piece ? ' ' + piece : '')}
            >
              {fileLabel != null ? (
                <span className={cx('absolute left-0.5 top-0 text-[9px] font-semibold', isDark ? 'text-[#eeeed2]' : 'text-[#769656]')}>{fileLabel}</span>
              ) : null}
              {rankLabel != null ? (
                <span className={cx('absolute bottom-0 right-0.5 text-[9px] font-semibold', isDark ? 'text-[#eeeed2]' : 'text-[#769656]')}>{rankLabel}</span>
              ) : null}
              {piece ? (
                <span className={cx('drop-shadow-sm', colorOf(piece) === 'w' ? 'text-white' : 'text-black')}>
                  {GLYPHS[piece]}
                </span>
              ) : null}
              {isTarget ? (
                <span className={cx(
                  'pointer-events-none absolute',
                  piece
                    ? 'inset-1 rounded-full ring-4 ring-[rgb(var(--orb-accent-rgb))]/55'
                    : 'h-1/4 w-1/4 rounded-full bg-[rgb(var(--orb-accent-rgb))]/45'
                )} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PromotionPicker({ promotion, onPick, onCancel }) {
  if (!promotion) return null;
  const color = promotion.color;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={onCancel}>
      <div className="rounded-2xl bg-[rgb(var(--orb-surface-rgb))] p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{t('chess.promotion')}</div>
        <div className="flex items-center gap-2">
          {['Q','R','B','N'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={cx(
                'grid h-14 w-14 place-items-center rounded-xl text-[36px] leading-none ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all active:scale-95',
                'bg-[rgb(var(--orb-bg-rgb))]/60 hover:bg-[rgb(var(--orb-accent-rgb))]/15',
                color === 'w' ? 'text-white' : 'text-black'
              )}
              aria-label={p}
            >
              {GLYPHS[color + p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameOverOverlay({ ended, onNewGame, onExit }) {
  if (!ended) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm"
    >
      <div className="w-[280px] max-w-[88%] rounded-3xl bg-[rgb(var(--orb-surface-rgb))] p-5 text-center ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgb(var(--orb-accent-rgb))]/20 ring-1 ring-[rgb(var(--orb-accent-rgb))]/30">
          <Trophy className="h-6 w-6 text-[rgb(var(--orb-accent-rgb))]" />
        </div>
        <div className="mt-3 text-base font-bold text-[rgb(var(--orb-text-rgb))]">
          {ended.status === 'checkmate' && t('chess.checkmate')}
          {ended.status === 'resigned' && (ended.winner === 'w' ? t('chess.win.white') : t('chess.win.black'))}
          {ended.status === 'stalemate' && t('chess.stalemate')}
          {ended.status === 'draw50' && t('chess.draw50')}
        </div>
        {ended.status === 'checkmate' && ended.winner ? (
          <div className="mt-1 text-xs text-[rgb(var(--orb-muted-rgb))]">
            {ended.winner === 'w' ? t('chess.win.white') : t('chess.win.black')}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { hapticTap(); onNewGame(); }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl orb-gradient text-sm font-semibold text-white shadow active:scale-95 transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            {t('chess.new_game')}
          </button>
          <button
            type="button"
            onClick={() => { hapticTap(); onExit(); }}
            className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 text-sm font-medium text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] active:scale-95 transition-all"
          >
            {t('chess.exit')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function GameView({ onExit, mode = 'solo' }) {
  useLang();
  const [game, dispatch] = useReducer(reducer, undefined, freshGame);
  const viewColor = 'w';

  const handleResign = () => {
    if (game.ended) return;
    if (typeof window !== 'undefined' && !window.confirm(t('chess.resign.confirm'))) return;
    hapticTap();
    dispatch({ type: 'resign' });
  };

  const handleNewGame = () => { hapticTap(); dispatch({ type: 'reset' }); };

  return (
    <div className="orb-page-bg relative flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))] px-4 pb-4 pt-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => { hapticTap(); onExit(); }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all active:scale-95"
          aria-label={t('common.back')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">
          {statusLine(game.state, game.ended)}
        </div>
        <button
          type="button"
          onClick={handleResign}
          disabled={!!game.ended}
          className={cx(
            'inline-flex h-9 items-center gap-1.5 rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/10 px-3 text-xs font-medium text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/20 transition-all active:scale-95',
            game.ended && 'opacity-40'
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          {t('chess.resign')}
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--orb-muted-rgb))]">{t('chess.captured')}</div>
        <CapturedRow board={game.state.board} color="b" />
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <Board game={game} dispatch={dispatch} viewColor={viewColor} locked={!!game.ended} />
        <PromotionPicker
          promotion={game.promotion}
          onPick={(p) => {
            const m = game.promotion.candidates.find((mm) => mm.promotion === p);
            if (m) dispatch({ type: 'apply', move: m });
          }}
          onCancel={() => dispatch({ type: 'cancelPromotion' })}
        />
        <AnimatePresence>
          {game.ended ? (
            <GameOverOverlay ended={game.ended} onNewGame={handleNewGame} onExit={onExit} />
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--orb-muted-rgb))]">{t('chess.captured')}</div>
        <CapturedRow board={game.state.board} color="w" />
      </div>
    </div>
  );
}

function ModePicker({ onPick, onExit }) {
  useLang();
  return (
    <div className="orb-page-bg flex h-full w-full flex-col bg-[rgb(var(--orb-bg-rgb))] px-4 pb-6 pt-3">
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { hapticTap(); onExit(); }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all active:scale-95"
          aria-label={t('common.back')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-base font-bold text-[rgb(var(--orb-text-rgb))]">{t('games.chess.title')}</div>
      </div>

      <button
        type="button"
        onClick={() => { hapticTap(); onPick('solo'); }}
        className="flex w-full items-center gap-3 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 p-4 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all active:scale-[0.99] hover:ring-[rgb(var(--orb-accent-rgb))]/40"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--orb-accent-rgb))]/15 ring-1 ring-[rgb(var(--orb-accent-rgb))]/25">
          <UsersIcon className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{t('chess.solo')}</div>
          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{t('chess.solo.sub')}</div>
        </div>
      </button>

      {/* Online (P2P) mode is wired to the existing peer.sendGame transport.
          Hidden behind a separate button so the demo path (solo) is one tap. */}
      <button
        type="button"
        disabled
        className="mt-3 flex w-full cursor-not-allowed items-center gap-3 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/30 p-4 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] opacity-60"
        title={t('chess.online.sub')}
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--orb-muted-rgb))]/10 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <User className="h-5 w-5 text-[rgb(var(--orb-muted-rgb))]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{t('chess.online')}</div>
          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{t('chess.online.sub')} · {t('games.soon')}</div>
        </div>
      </button>
    </div>
  );
}

export default function Chess({ onExit }) {
  useLang();
  const [mode, setMode] = useState(null);
  if (!mode) {
    return <ModePicker onPick={(m) => setMode(m)} onExit={onExit} />;
  }
  return <GameView onExit={onExit} mode={mode} />;
}
