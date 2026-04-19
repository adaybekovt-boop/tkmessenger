// Blackjack-21 — solo vs bot or PvP 1v1 over P2P.
//
// Visual language from the 2026-04 "21 — minimal" mockup: monochrome card
// faces, single big score number, mono-font meta strip, bet stepper + 4-slot
// action grid (Hit primary · Stand · ×2 · Split). Every colour rides theme
// tokens so all four skins (Graphite, Paper, Matrix, Sakura Zen) stay
// readable — per-theme overrides live in src/styles/theme-skins.css via
// [data-orb-bj-*] hooks.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bot, Minus, Plus, RotateCcw, Users, Volume2, VolumeX,
} from 'lucide-react';
import { createEngine, createPvpEngine, BLACKJACK_CONSTANTS } from './engine.js';
import { sfx, setSoundEnabled, isSoundEnabled } from './sound.js';
import { hapticTap } from '../../core/haptics.js';
import { cx } from '../../utils/common.js';
import { usePeerContext } from '../../context/PeerContext.jsx';
import {
  GAME_KEY, inviteMsg, acceptMsg, declineMsg, leaveMsg, actionMsg, isBjMessage,
} from './netProtocol.js';

const { MIN_BET, BET_STEP } = BLACKJACK_CONSTANTS;
const BALANCE_KEY = 'orbits_blackjack21_balance_v2';

// Red suits ride --orb-danger so the tint stays consistent across themes.
// Black suits use --orb-text so they pick up light-on-dark / dark-on-light
// automatically.
function suitColor(suit) {
  if (suit === '♥' || suit === '♦') return 'rgb(var(--orb-danger-rgb))';
  return 'rgb(var(--orb-text-rgb))';
}

function CornerMarks({ rank, suit, color }) {
  return (
    <>
      <div className="flex flex-col items-start leading-none" data-orb-bj-corner="top">
        <span className="text-[22px] font-medium tracking-[-0.03em]" style={{ color }}>{rank}</span>
        <span className="mt-[3px] text-[14px] leading-none" style={{ color }}>{suit}</span>
      </div>
      <div className="flex rotate-180 flex-col items-start self-end leading-none" data-orb-bj-corner="bottom">
        <span className="text-[22px] font-medium tracking-[-0.03em]" style={{ color }}>{rank}</span>
        <span className="mt-[3px] text-[14px] leading-none" style={{ color }}>{suit}</span>
      </div>
    </>
  );
}

function PlayingCard({ card, hidden, index }) {
  // Dealing stagger: first card lands instantly, following cards ride a short
  // delay so the dealer → player → dealer → player feel is preserved without
  // blocking the UI thread.
  const dealDelay = Math.min(index, 6) * 0.07;
  const color = card ? suitColor(card.suit) : 'rgb(var(--orb-text-rgb))';
  return (
    <motion.div
      layout
      initial={{ y: -50, opacity: 0, rotate: -8, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: dealDelay }}
      className="relative h-[92px] w-[66px] shrink-0"
      style={{ perspective: 900 }}
      data-orb-bj-card
      data-orb-bj-suit={card ? (card.suit === '♥' || card.suit === '♦' ? 'red' : 'black') : 'none'}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ rotateY: hidden ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Face */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-[10px] bg-[rgb(var(--orb-surface-rgb))] px-[10px] py-2 ring-1 ring-[rgb(var(--orb-border-rgb))]"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          data-orb-bj-card-face
        >
          {card ? <CornerMarks rank={card.rank} suit={card.suit} color={color} /> : null}
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 rounded-[10px] ring-1 ring-[rgb(var(--orb-border-rgb))]"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'rgb(var(--orb-text-rgb))',
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 6px, transparent 6px 12px)',
          }}
          data-orb-bj-card-back
        >
          <div className="absolute inset-[6px] rounded-[6px] ring-1 ring-white/15" />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Hand({ cards, hideHoleIndex = -1 }) {
  return (
    <div className="flex h-[96px] items-center justify-center gap-[6px]" data-orb-bj-hand>
      <AnimatePresence initial={false}>
        {cards.map((c, i) => (
          <PlayingCard key={c.id} card={c} hidden={i === hideHoleIndex} index={i} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Score readout — single big number, light weight, tabular mono digits so
// values don't jitter when a total changes from 7 → 17 → 21.
function Score({ value, dim, aux, hidden }) {
  return (
    <div className="flex flex-col items-center" data-orb-bj-score>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={cx(
          'text-[56px] font-light leading-none tracking-[-0.04em]',
          dim ? 'text-[rgb(var(--orb-muted-rgb))]' : 'text-[rgb(var(--orb-text-rgb))]'
        )}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
        {hidden ? <span className="text-[30px] opacity-40">+?</span> : null}
      </motion.div>
      {aux ? (
        <div
          className="mt-[6px] text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]"
          style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
        >
          {aux}
        </div>
      ) : null}
    </div>
  );
}

function ResultPill({ result, variant }) {
  if (!result) return null;
  const map = {
    blackjack: { label: 'блэкджек',      tone: 'win' },
    player:    { label: 'победа',         tone: 'win' },
    dealerBust:{ label: 'дилер перебрал', tone: 'win' },
    you:       { label: 'ты выиграл',     tone: 'win' },
    opp:       { label: variant === 'solo' ? 'дилер выиграл' : 'соперник выиграл', tone: 'lose' },
    dealer:    { label: 'дилер выиграл',  tone: 'lose' },
    bust:      { label: 'перебор',         tone: 'lose' },
    push:      { label: 'ничья',           tone: 'push' },
  };
  const meta = map[result];
  if (!meta) return null;
  const tone =
    meta.tone === 'win'
      ? 'text-[rgb(var(--orb-success-rgb))] ring-[rgb(var(--orb-success-rgb))]/40'
      : meta.tone === 'lose'
        ? 'text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/40'
        : 'text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))]';
  return (
    <motion.div
      key={result}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 20 }}
      className={cx(
        'inline-flex items-center gap-2 rounded-full bg-[rgb(var(--orb-surface-rgb))]/50 px-3 py-1 ring-1',
        tone
      )}
      style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
      data-orb-bj-pill
    >
      <span className="text-[10px] uppercase tracking-[0.15em]">{meta.label}</span>
    </motion.div>
  );
}

function StepButton({ children, onClick, disabled }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      className={cx(
        'flex h-[28px] w-[28px] items-center justify-center rounded-full ring-1 transition-colors',
        'bg-[rgb(var(--orb-surface-rgb))] text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-[rgb(var(--orb-surface-rgb))]/60'
      )}
      data-orb-bj-step
    >
      {children}
    </motion.button>
  );
}

function ActionBtn({ children, onClick, primary, disabled, variant = 'wide' }) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'h-[46px] rounded-[12px] text-[13px] font-medium transition-colors ring-1',
        primary
          ? 'bg-[rgb(var(--orb-text-rgb))] text-[rgb(var(--orb-bg-rgb))] ring-[rgb(var(--orb-text-rgb))]'
          : 'bg-[rgb(var(--orb-surface-rgb))] text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]',
        !primary && !disabled && 'hover:bg-[rgb(var(--orb-surface-rgb))]/70',
        disabled && 'cursor-not-allowed text-[rgb(var(--orb-muted-rgb))]'
      )}
      data-orb-bj-action
      data-orb-bj-action-variant={variant}
      data-orb-bj-action-primary={primary ? 'true' : 'false'}
    >
      {children}
    </motion.button>
  );
}

// Little stat badge for the round-meta strip.
function MetaCell({ label, value }) {
  return (
    <span
      className="inline-flex items-center gap-[6px] text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]"
      style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
    >
      {label}
      <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{value}</strong>
    </span>
  );
}


// ─── Lobby ────────────────────────────────────────────────────────────────

function Lobby({ onSolo, onPvp, onExit, peer }) {
  const [pick, setPick] = useState(false);
  const peers = (peer?.peers || []).filter((p) => p && p.id && p.id !== peer.peerId);

  return (
    <div
      className="flex h-full w-full flex-col bg-[rgb(var(--orb-bg-rgb))] text-[rgb(var(--orb-text-rgb))]"
      style={{ fontFamily: 'var(--orb-font-body, system-ui, sans-serif)' }}
    >
      <header className="flex items-center gap-3 border-b border-[rgb(var(--orb-border-rgb))] px-3 py-2.5" data-orb-bj-header>
        <button
          type="button"
          onClick={() => { hapticTap(); onExit(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--orb-text-rgb))]"
          aria-label="Назад"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.6} />
        </button>
        <div className="flex-1">
          <div className="text-[14px] font-medium">21 — minimal</div>
          <div
            className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-[rgb(var(--orb-muted-rgb))]"
            style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
          >
            Orbits
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
        <AnimatePresence mode="wait">
          {!pick ? (
            <motion.div
              key="root"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto flex w-full max-w-[360px] flex-col gap-4"
            >
              <div
                className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--orb-muted-rgb))]"
                style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
              >
                режим
              </div>

              <button
                type="button"
                onClick={() => { hapticTap(); onSolo(); }}
                className="flex items-center gap-3 rounded-[14px] bg-[rgb(var(--orb-surface-rgb))] p-4 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] transition-colors hover:bg-[rgb(var(--orb-surface-rgb))]/70"
                data-orb-bj-lobby-card
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[rgb(var(--orb-bg-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                  <Bot className="h-5 w-5 text-[rgb(var(--orb-text-rgb))]" strokeWidth={1.6} />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-medium">Против бота</div>
                  <div className="mt-0.5 text-[12px] text-[rgb(var(--orb-muted-rgb))]">
                    Соло — деньги на домашнем балансе
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { hapticTap(); setPick(true); }}
                className="flex items-center gap-3 rounded-[14px] bg-[rgb(var(--orb-surface-rgb))] p-4 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] transition-colors hover:bg-[rgb(var(--orb-surface-rgb))]/70"
                data-orb-bj-lobby-card
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[rgb(var(--orb-bg-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                  <Users className="h-5 w-5 text-[rgb(var(--orb-text-rgb))]" strokeWidth={1.6} />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-medium">С другом (P2P)</div>
                  <div className="mt-0.5 text-[12px] text-[rgb(var(--orb-muted-rgb))]">
                    1×1 — ходы идут напрямую, выигравший забирает банк
                  </div>
                </div>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto flex w-full max-w-[360px] flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div
                  className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--orb-muted-rgb))]"
                  style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                >
                  выбери соперника
                </div>
                <button
                  type="button"
                  onClick={() => { hapticTap(); setPick(false); }}
                  className="text-[11px] text-[rgb(var(--orb-muted-rgb))] underline decoration-dotted underline-offset-2 hover:text-[rgb(var(--orb-text-rgb))]"
                >
                  назад
                </button>
              </div>

              {peers.length === 0 ? (
                <div
                  className="rounded-[14px] bg-[rgb(var(--orb-surface-rgb))] p-4 text-[12px] text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                >
                  Пока нет подключённых собеседников. Открой чат, свяжись с другом, и он появится здесь.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {peers.map((p) => {
                    const profile = peer.profilesByPeer?.[p.id];
                    const name = profile?.displayName || p.displayName || p.id.slice(0, 8);
                    const online = p.status === 'online' || peer.connectionStatusByPeer?.[p.id] === 'online';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { hapticTap(); onPvp(p.id, name); }}
                        className="flex items-center gap-3 rounded-[14px] bg-[rgb(var(--orb-surface-rgb))] p-3 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] transition-colors hover:bg-[rgb(var(--orb-surface-rgb))]/70"
                        data-orb-bj-peer-row
                      >
                        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgb(var(--orb-bg-rgb))] text-[14px] font-medium ring-1 ring-[rgb(var(--orb-border-rgb))]">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 leading-tight">
                          <div className="text-[14px] font-medium">{name}</div>
                          <div
                            className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[rgb(var(--orb-muted-rgb))]"
                            style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                          >
                            <span
                              className="h-[5px] w-[5px] rounded-full"
                              style={{
                                background: online
                                  ? 'rgb(var(--orb-success-rgb))'
                                  : 'rgb(var(--orb-muted-rgb))',
                              }}
                            />
                            {online ? 'онлайн' : 'офлайн'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


// ─── Solo mode ────────────────────────────────────────────────────────────

function SoloGame({ onExit, initialBalance, onBalanceChange, soundOn, onToggleSound }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = createEngine({ startingBalance: initialBalance });

  const [snap, setSnap] = useState(() => engineRef.current.snapshot());

  const commit = useCallback(() => {
    const s = engineRef.current.snapshot();
    setSnap(s);
    onBalanceChange?.(s.balance);
    const events = engineRef.current.drainEvents();
    for (const ev of events) {
      switch (ev.type) {
        case 'deal':       sfx.deal(); break;
        case 'hit':        sfx.hit(); break;
        case 'reveal':     sfx.flip(); break;
        case 'dealerHit':  sfx.hit(); break;
        case 'double':     sfx.deal(); break;
        case 'bust':       sfx.bust(); break;
        case 'blackjack':  sfx.blackjack(); break;
        case 'win':        sfx.win(); break;
        case 'lose':       sfx.lose(); break;
        case 'push':       sfx.push(); break;
        default: break;
      }
    }
  }, [onBalanceChange]);

  useEffect(() => {
    if (snap.phase === 'dealerReveal') {
      const t = setTimeout(() => {
        engineRef.current.startDealerTurn();
        commit();
      }, 700);
      return () => clearTimeout(t);
    }
    if (snap.phase === 'dealer') {
      const t = setTimeout(() => {
        const drew = engineRef.current.dealerStep();
        if (!drew) engineRef.current.resolve();
        commit();
      }, 550);
      return () => clearTimeout(t);
    }
  }, [snap.phase, snap.dealer.length, commit]);

  const handleDeal = () => {
    if (snap.phase !== 'idle' && snap.phase !== 'done') return;
    hapticTap();
    engineRef.current.deal();
    commit();
  };
  const handleHit = () => {
    if (snap.phase !== 'player') return;
    hapticTap();
    engineRef.current.hit();
    commit();
  };
  const handleStand = () => {
    if (snap.phase !== 'player') return;
    hapticTap();
    engineRef.current.stand();
    commit();
  };
  const handleDouble = () => {
    if (!snap.canDouble) return;
    hapticTap();
    engineRef.current.doubleDown();
    commit();
  };
  const handleBet = (next) => {
    if (engineRef.current.setBet(next)) {
      hapticTap();
      setSnap(engineRef.current.snapshot());
    }
  };
  const handleReset = () => {
    hapticTap();
    engineRef.current.reset();
    commit();
  };

  return (
    <GameView
      variant="solo"
      snap={snap}
      oppName="Бот"
      oppStatusText="ai · local"
      onExit={onExit}
      onDeal={handleDeal}
      onHit={handleHit}
      onStand={handleStand}
      onDouble={handleDouble}
      onBetChange={handleBet}
      onReset={handleReset}
      soundOn={soundOn}
      onToggleSound={onToggleSound}
    />
  );
}


// ─── PvP mode ─────────────────────────────────────────────────────────────

function VsGame({ onExit, oppId, oppName, initialBalance, onBalanceChange, role, sessionId, soundOn, onToggleSound }) {
  const peer = usePeerContext();
  const engineRef = useRef(null);
  if (!engineRef.current) {
    // Host goes first; pulled deterministically so both sides agree.
    engineRef.current = createPvpEngine({
      seed: sessionId,
      youId: peer.peerId,
      oppId,
      youName: peer.profilesByPeer?.[peer.peerId]?.displayName || 'Ты',
      oppName,
      startingBalance: initialBalance,
      firstTurn: role === 'host' ? 'you' : 'opp',
    });
  }

  const [snap, setSnap] = useState(() => engineRef.current.snapshot());
  const [connLost, setConnLost] = useState(false);

  const commit = useCallback(() => {
    const s = engineRef.current.snapshot();
    setSnap(s);
    onBalanceChange?.(s.youBalance);
    const events = engineRef.current.drainEvents();
    for (const ev of events) {
      switch (ev.type) {
        case 'deal':   sfx.deal(); break;
        case 'hit':    sfx.hit(); break;
        case 'reveal': sfx.flip(); break;
        case 'bust':   sfx.bust(); break;
        case 'win':    sfx.win(); break;
        case 'lose':   sfx.lose(); break;
        case 'push':   sfx.push(); break;
        case 'double': sfx.deal(); break;
        default: break;
      }
    }
  }, [onBalanceChange]);

  // After both players lock in, resolve after a short pause so the reveal has
  // visible weight.
  useEffect(() => {
    if (snap.phase !== 'reveal') return;
    const t = setTimeout(() => {
      engineRef.current.doReveal();
      commit();
    }, 700);
    return () => clearTimeout(t);
  }, [snap.phase, commit]);

  // Wire up P2P: listen for opponent actions/invitations.
  useEffect(() => {
    const unsubscribe = peer.subscribeGame((rid, payload) => {
      if (!isBjMessage(payload)) return;
      if (rid !== oppId) return;
      if (payload.sessionId !== sessionId) return;
      if (payload.kind === 'action') {
        engineRef.current.applyRemoteAction(payload.action);
        commit();
      } else if (payload.kind === 'leave') {
        setConnLost(true);
      }
    });
    return unsubscribe;
  }, [peer, oppId, sessionId, commit]);

  // Emit our action to the peer. Used for every local move.
  const emitAction = useCallback((action) => {
    peer.sendGame(oppId, actionMsg({ sessionId, round: snap.round, action }));
  }, [peer, oppId, sessionId, snap.round]);

  // Clean up if component unmounts / user leaves.
  useEffect(() => {
    return () => {
      try { peer.sendGame(oppId, leaveMsg({ sessionId })); } catch (_) {}
    };
  }, [peer, oppId, sessionId]);

  const canAct = snap.phase === 'you' && snap.youStatus === 'playing';

  const handleDeal = () => {
    if (snap.phase !== 'idle' && snap.phase !== 'done') return;
    hapticTap();
    if (engineRef.current.deal()) {
      commit();
      emitAction({ kind: 'deal' });
    }
  };
  const handleHit = () => {
    if (!canAct) return;
    hapticTap();
    if (engineRef.current.hit('you')) {
      commit();
      emitAction({ kind: 'hit' });
    }
  };
  const handleStand = () => {
    if (!canAct) return;
    hapticTap();
    if (engineRef.current.stand('you')) {
      commit();
      emitAction({ kind: 'stand' });
    }
  };
  const handleDouble = () => {
    if (!canAct || !snap.canDouble) return;
    hapticTap();
    if (engineRef.current.doubleDown('you')) {
      commit();
      emitAction({ kind: 'double' });
    }
  };
  const handleBet = (next) => {
    if (!(snap.phase === 'idle' || snap.phase === 'done')) return;
    if (engineRef.current.setBet(next)) {
      hapticTap();
      setSnap(engineRef.current.snapshot());
      emitAction({ kind: 'bet', value: next });
    }
  };

  return (
    <GameView
      variant="versus"
      snap={snap}
      oppName={oppName}
      oppStatusText={connLost ? 'offline · пир' : (role === 'host' ? 'peer · host' : 'peer · guest')}
      canAct={canAct}
      onExit={onExit}
      onDeal={handleDeal}
      onHit={handleHit}
      onStand={handleStand}
      onDouble={handleDouble}
      onBetChange={handleBet}
      soundOn={soundOn}
      onToggleSound={onToggleSound}
    />
  );
}


// ─── Shared game view ─────────────────────────────────────────────────────

function GameView({
  variant, snap, oppName, oppStatusText, canAct, onExit,
  onDeal, onHit, onStand, onDouble, onBetChange, onReset,
  soundOn, onToggleSound,
}) {
  const isSolo = variant === 'solo';

  const isIdle = snap.phase === 'idle';
  const isDone = snap.phase === 'done';
  // For solo, 'player' means it's your turn. For PvP, it's canAct.
  const canPlay = isSolo ? snap.phase === 'player' : !!canAct;
  const hideHoleSolo = isSolo && snap.phase === 'player';

  const roundLabel = snap.round ? String(snap.round).padStart(2, '0') : '01';
  const playerValue = isSolo ? snap.playerValue : snap.youValue;
  const dealerDisplay = isSolo
    ? (hideHoleSolo ? snap.dealerVisibleValue : snap.dealerValue)
    : snap.oppValue;
  const dealerDim = isSolo ? hideHoleSolo : (snap.phase !== 'done' && snap.phase !== 'reveal' && snap.oppStatus === 'playing');
  const youBalance = isSolo ? snap.balance : snap.youBalance;
  const oppBalance = isSolo ? null : snap.oppBalance;
  const opponentHand = isSolo ? snap.dealer : snap.opp;
  const youHand = isSolo ? snap.player : snap.you;

  // In PvP, the status tag under each side helps see who's stood/busted.
  const oppStatusBadge = !isSolo && snap.oppStatus !== 'playing'
    ? (snap.oppStatus === 'bust' ? 'перебор' : snap.oppStatus === 'stand' ? 'хватит' : snap.oppStatus === 'blackjack' ? 'блэкджек' : '')
    : '';
  const youStatusBadge = !isSolo && snap.youStatus !== 'playing'
    ? (snap.youStatus === 'bust' ? 'перебор' : snap.youStatus === 'stand' ? 'хватит' : snap.youStatus === 'blackjack' ? 'блэкджек' : '')
    : '';

  return (
    <div
      className="flex h-full w-full flex-col bg-[rgb(var(--orb-bg-rgb))] text-[rgb(var(--orb-text-rgb))]"
      style={{ fontFamily: 'var(--orb-font-body, system-ui, sans-serif)' }}
      data-orb-bj-root
      data-orb-bj-variant={variant}
    >
      {/* Chat-style header */}
      <header
        className="flex items-center gap-3 border-b border-[rgb(var(--orb-border-rgb))] px-3 py-2.5"
        data-orb-bj-header
      >
        <button
          type="button"
          onClick={() => { hapticTap(); onExit(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--orb-text-rgb))]"
          aria-label="Назад"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.6} />
        </button>
        <div className="flex flex-1 items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgb(var(--orb-surface-rgb))] text-[14px] font-medium ring-1 ring-[rgb(var(--orb-border-rgb))]"
            data-orb-bj-avatar
          >
            {oppName.slice(0, 1).toUpperCase()}
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-medium">{oppName}</div>
            <div
              className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[rgb(var(--orb-muted-rgb))]"
              style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
            >
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'rgb(var(--orb-success-rgb))' }}
                data-orb-bj-dot
              />
              {oppStatusText}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSound}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--orb-text-rgb))]"
          aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
        >
          {soundOn ? <Volume2 className="h-4 w-4" strokeWidth={1.6} /> : <VolumeX className="h-4 w-4" strokeWidth={1.6} />}
        </button>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--orb-text-rgb))]"
            aria-label="Сбросить счёт"
            title="Сбросить счёт"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
          </button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Round meta strip */}
        <div className="flex items-center justify-between px-6 py-3" data-orb-bj-round-meta>
          <MetaCell label="раунд" value={roundLabel} />
          <MetaCell label="цель —" value="21" />
        </div>

        {isIdle ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-6 text-center" data-orb-bj-intro>
            <div
              className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--orb-muted-rgb))]"
              style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
            >
              Orbits
            </div>
            <div className="text-[28px] font-light tracking-[-0.02em]">21 — minimal</div>
            <div className="max-w-[280px] text-[12px] leading-relaxed text-[rgb(var(--orb-muted-rgb))]">
              {isSolo
                ? 'Набери больше очков, чем дилер, но не больше 21. Туз — 1 или 11, картинки — 10.'
                : `Оба делают ставку, тянут карты, выигравший забирает банк. Твой баланс и баланс соперника синхронизированы.`}
            </div>

            <div className="mt-2 flex items-center gap-5" data-orb-bj-bet-intro>
              <div className="text-[11px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]" style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}>
                ставка
              </div>
              <div className="flex items-center gap-3">
                <StepButton onClick={() => onBetChange(snap.bet - BET_STEP)} disabled={snap.bet <= MIN_BET}>
                  <Minus className="h-3.5 w-3.5" strokeWidth={1.8} />
                </StepButton>
                <div
                  className="min-w-[50px] text-center text-[18px] font-medium"
                  style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                >
                  {snap.bet}
                </div>
                <StepButton onClick={() => onBetChange(snap.bet + BET_STEP)} disabled={snap.bet + BET_STEP > (isSolo ? snap.balance : Math.min(snap.youBalance, snap.oppBalance))}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                </StepButton>
              </div>
            </div>

            <motion.button
              type="button"
              onClick={onDeal}
              whileTap={{ scale: 0.97 }}
              className="mt-2 inline-flex h-12 items-center gap-2 rounded-[12px] bg-[rgb(var(--orb-text-rgb))] px-6 text-[13px] font-medium text-[rgb(var(--orb-bg-rgb))]"
              data-orb-bj-intro-cta
            >
              Начать раунд
            </motion.button>

            <div
              className="mt-1 flex items-center gap-4 text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]"
              style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
            >
              {isSolo ? (
                <>
                  <span>баланс <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{youBalance.toLocaleString('ru-RU')}</strong></span>
                  <span>·</span>
                  <span>побед {snap.wins} · пораж. {snap.losses}</span>
                </>
              ) : (
                <>
                  <span>ты <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{snap.youBalance.toLocaleString('ru-RU')}</strong></span>
                  <span>·</span>
                  <span>{oppName} <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{snap.oppBalance.toLocaleString('ru-RU')}</strong></span>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Opponent area */}
            <div className="flex flex-col items-center gap-[14px] px-6 pb-2 pt-1" data-orb-bj-area="opponent">
              <div className="flex w-full items-baseline justify-between">
                <span className="text-[13px] text-[rgb(var(--orb-muted-rgb))]">
                  <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{oppName}</strong>
                </span>
                <span
                  className="text-[11px] text-[rgb(var(--orb-muted-rgb))]"
                  style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                >
                  ставка <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{snap.bet}</strong>
                </span>
              </div>
              <Hand
                cards={opponentHand}
                hideHoleIndex={isSolo && hideHoleSolo && opponentHand.length > 1 ? 1 : -1}
              />
              <Score
                value={dealerDisplay}
                dim={dealerDim}
                hidden={isSolo && hideHoleSolo && opponentHand.length > 0}
                aux={oppStatusBadge || undefined}
              />
            </div>

            {/* Divider with pot */}
            <div className="flex items-center gap-3 px-6" data-orb-bj-divider>
              <div className="h-px flex-1 bg-[rgb(var(--orb-border-rgb))]" />
              <div className="min-h-[18px] flex items-baseline gap-[6px]">
                <AnimatePresence mode="wait">
                  {isDone ? (
                    <ResultPill key={snap.result} result={snap.result} variant={variant} />
                  ) : (
                    <motion.div
                      key="pot"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-baseline gap-[6px]"
                      style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                      data-orb-bj-pot
                    >
                      <span className="text-[9px] uppercase tracking-[0.15em] text-[rgb(var(--orb-muted-rgb))]">банк</span>
                      <span className="text-[13px] font-medium text-[rgb(var(--orb-text-rgb))]">{snap.pot}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="h-px flex-1 bg-[rgb(var(--orb-border-rgb))]" />
            </div>

            {/* Player area */}
            <div className="flex flex-col items-center gap-[14px] px-6 pb-4 pt-2" data-orb-bj-area="player">
              <Score
                value={playerValue}
                aux={youStatusBadge || 'твоя рука'}
              />
              <Hand cards={youHand} />
              <div className="flex w-full items-baseline justify-between">
                <span className="text-[13px] text-[rgb(var(--orb-muted-rgb))]">
                  <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">
                    {isSolo ? 'Ты' : snap.youName}
                  </strong>
                </span>
                <span
                  className="text-[11px] text-[rgb(var(--orb-muted-rgb))]"
                  style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                >
                  баланс <strong className="font-medium text-[rgb(var(--orb-text-rgb))]">{youBalance.toLocaleString('ru-RU')}</strong>
                </span>
              </div>
              {!isSolo ? (
                <div
                  className="-mt-1 text-[10px] uppercase tracking-[0.15em] text-[rgb(var(--orb-muted-rgb))]"
                  style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
                  data-orb-bj-turn
                >
                  {snap.phase === 'you'
                    ? 'твой ход'
                    : snap.phase === 'opp'
                      ? `ход · ${oppName}`
                      : snap.phase === 'reveal'
                        ? 'вскрытие'
                        : ''}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Action bar */}
      {!isIdle ? (
        <div
          className="flex flex-col gap-[10px] border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))] px-4 py-3"
          data-orb-bj-actions
        >
          <div className="flex items-center justify-between px-[6px]" data-orb-bj-bet>
            <div
              className="text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]"
              style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
            >
              ставка
            </div>
            <div className="flex items-center gap-[14px]">
              <StepButton
                onClick={() => onBetChange(snap.bet - BET_STEP)}
                disabled={!(isIdle || isDone) || snap.bet <= MIN_BET}
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={1.8} />
              </StepButton>
              <div
                className="min-w-[50px] text-center text-[18px] font-medium"
                style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
              >
                {snap.bet}
              </div>
              <StepButton
                onClick={() => onBetChange(snap.bet + BET_STEP)}
                disabled={!(isIdle || isDone) || snap.bet + BET_STEP > (isSolo ? snap.balance : Math.min(snap.youBalance, snap.oppBalance))}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
              </StepButton>
            </div>
            <div
              className="text-[10px] uppercase tracking-[0.1em] text-[rgb(var(--orb-muted-rgb))]"
              style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
            >
              chips
            </div>
          </div>

          {isDone ? (
            <div className="grid grid-cols-2 gap-2" data-orb-bj-grid="done">
              <ActionBtn primary onClick={onDeal}>Ещё раз</ActionBtn>
              <ActionBtn onClick={() => { hapticTap(); onExit(); }}>Выйти</ActionBtn>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}
              data-orb-bj-grid="actions"
            >
              <ActionBtn primary onClick={onHit} disabled={!canPlay}>Hit</ActionBtn>
              <ActionBtn onClick={onStand} disabled={!canPlay}>Stand</ActionBtn>
              <ActionBtn onClick={onDouble} disabled={!canPlay || !snap.canDouble}>×2</ActionBtn>
              <ActionBtn disabled>Split</ActionBtn>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}


// ─── Root component ───────────────────────────────────────────────────────

function readBalance() {
  const raw = Number(localStorage.getItem(BALANCE_KEY));
  if (!Number.isFinite(raw) || raw < MIN_BET) return BLACKJACK_CONSTANTS.DEFAULT_BALANCE;
  return raw;
}

function writeBalance(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  try { localStorage.setItem(BALANCE_KEY, String(Math.floor(n))); } catch (_) {}
}

export default function Blackjack21({ onExit }) {
  const peer = usePeerContext();

  const [screen, setScreen] = useState('lobby'); // 'lobby' | 'solo' | 'vs' | 'incoming'
  const [pvpSession, setPvpSession] = useState(null); // { role, oppId, oppName, sessionId }
  const [incoming, setIncoming] = useState(null);
  const [balance, setBalance] = useState(() => readBalance());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  const toggleSound = useCallback(() => {
    hapticTap();
    setSoundOn((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      return next;
    });
  }, []);

  const handleBalanceChange = useCallback((v) => {
    setBalance(v);
    writeBalance(v);
  }, []);

  // Listen for incoming invites even from the lobby screen.
  useEffect(() => {
    const unsubscribe = peer.subscribeGame((rid, payload) => {
      if (!isBjMessage(payload)) return;
      if (payload.kind === 'invite') {
        setIncoming({ oppId: rid, fromName: payload.fromName || rid, sessionId: payload.sessionId, bet: payload.bet });
        return;
      }
      // Other kinds are handled by VsGame subscriber when active.
    });
    return unsubscribe;
  }, [peer]);

  // Auto-jump into PvP when an invite is accepted or newly dispatched.
  const startPvp = useCallback((oppId, oppName) => {
    const sessionId = `${peer.peerId}|${oppId}|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`;
    peer.sendGame(oppId, inviteMsg({
      sessionId,
      bet: BLACKJACK_CONSTANTS.DEFAULT_BET,
      fromName: peer.profilesByPeer?.[peer.peerId]?.displayName || 'Игрок',
    }));
    setPvpSession({ role: 'host', oppId, oppName, sessionId });
    setScreen('vs');
  }, [peer]);

  const acceptInvite = useCallback(() => {
    if (!incoming) return;
    peer.sendGame(incoming.oppId, acceptMsg({
      sessionId: incoming.sessionId,
      fromName: peer.profilesByPeer?.[peer.peerId]?.displayName || 'Игрок',
    }));
    setPvpSession({ role: 'guest', oppId: incoming.oppId, oppName: incoming.fromName, sessionId: incoming.sessionId });
    setIncoming(null);
    setScreen('vs');
  }, [incoming, peer]);

  const declineInvite = useCallback(() => {
    if (!incoming) return;
    peer.sendGame(incoming.oppId, declineMsg({ sessionId: incoming.sessionId }));
    setIncoming(null);
  }, [incoming, peer]);

  const leaveToLobby = useCallback(() => {
    setPvpSession(null);
    setScreen('lobby');
  }, []);

  return (
    <>
      {screen === 'lobby' ? (
        <Lobby
          onExit={onExit}
          onSolo={() => setScreen('solo')}
          onPvp={startPvp}
          peer={peer}
        />
      ) : screen === 'solo' ? (
        <SoloGame
          onExit={leaveToLobby}
          initialBalance={balance}
          onBalanceChange={handleBalanceChange}
          soundOn={soundOn}
          onToggleSound={toggleSound}
        />
      ) : screen === 'vs' && pvpSession ? (
        <VsGame
          key={pvpSession.sessionId}
          onExit={leaveToLobby}
          oppId={pvpSession.oppId}
          oppName={pvpSession.oppName}
          sessionId={pvpSession.sessionId}
          role={pvpSession.role}
          initialBalance={balance}
          onBalanceChange={handleBalanceChange}
          soundOn={soundOn}
          onToggleSound={toggleSound}
        />
      ) : null}

      <AnimatePresence>
        {incoming && screen !== 'vs' ? (
          <motion.div
            key="incoming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            data-orb-bj-incoming
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="w-full max-w-[380px] rounded-[18px] bg-[rgb(var(--orb-bg-rgb))] p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]"
            >
              <div
                className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--orb-muted-rgb))]"
                style={{ fontFamily: 'var(--orb-font-mono, ui-monospace, monospace)' }}
              >
                входящее приглашение
              </div>
              <div className="mt-2 text-[18px] font-medium">
                {incoming.fromName} зовёт тебя в 21
              </div>
              <div className="mt-1 text-[12px] text-[rgb(var(--orb-muted-rgb))]">
                Ставка · <strong className="text-[rgb(var(--orb-text-rgb))]">{incoming.bet}</strong> · один на один, выигрывает ближайший к 21.
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <ActionBtn primary onClick={acceptInvite}>Сыграть</ActionBtn>
                <ActionBtn onClick={declineInvite}>Отказаться</ActionBtn>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
