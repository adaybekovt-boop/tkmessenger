import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Blocks, Clock, Gamepad2, Loader2, Spade, Swords, Users, User } from 'lucide-react';
import { hapticTap } from '../core/haptics.js';
import { cx } from '../utils/common.js';
import { t, useLang } from '../core/i18n.js';

// Keep direct refs to the dynamic imports so we can warm them up before the
// user taps a card. Once a chunk's promise resolves, React's <Suspense> will
// render the child synchronously (no fallback flash) on first render.
const loadBlockBlast = () => import('../games/blockblast/BlockBlast.jsx');
const loadBlackjack21 = () => import('../games/blackjack21/Blackjack21.jsx');
const BlockBlast = lazy(loadBlockBlast);
const Blackjack21 = lazy(loadBlackjack21);

// Map ids to their preload function. Unknown ids are a no-op.
const PRELOADERS = {
  blockblast: loadBlockBlast,
  blackjack21: loadBlackjack21,
};

function preloadGame(id) {
  const fn = PRELOADERS[id];
  if (fn) { try { void fn(); } catch (_) {} }
}

// i18n keys are resolved at render time (inside Lobby) so re-renders triggered
// by language changes pick up the new strings; the icon/gradient/status stay
// here as static metadata.
const GAMES = [
  {
    id: 'blockblast',
    titleKey: null, // 'Block Blast' is a brand name, not localised
    titleStatic: 'Block Blast',
    subtitleKey: 'games.blockblast.subtitle',
    playersKey: 'games.players.1',
    soloPlayer: true,
    status: 'ready',
    icon: Blocks,
    // Accent gradient for the card; uses theme tokens so every theme looks
    // native instead of fighting against hard-coded brand colours.
    gradient: 'from-[rgb(var(--orb-accent-rgb))]/30 to-[rgb(var(--orb-accent2-rgb))]/10'
  },
  {
    id: 'blackjack21',
    titleKey: 'games.blackjack.title',
    subtitleKey: 'games.blackjack.subtitle',
    playersKey: 'games.players.1_2',
    soloPlayer: false,
    status: 'ready',
    icon: Spade,
    gradient: 'from-[rgb(var(--orb-success-rgb))]/25 to-[rgb(var(--orb-accent-rgb))]/10'
  },
  {
    id: 'chess',
    titleKey: 'games.chess.title',
    subtitleKey: 'games.chess.subtitle',
    playersKey: 'games.players.2',
    soloPlayer: false,
    status: 'soon',
    icon: Swords,
    gradient: 'from-[rgb(var(--orb-danger-rgb))]/25 to-[rgb(var(--orb-accent2-rgb))]/10'
  }
];

function GameCard({ game, onSelect, index }) {
  const Icon = game.icon;
  const isReady = game.status === 'ready';
  const title = game.titleStatic ?? t(game.titleKey);
  const subtitle = t(game.subtitleKey);
  const playersLabel = t(game.playersKey);
  return (
    <motion.button
      type="button"
      // Explicit entry animation per card — small stagger so the eye reads
      // them as a sequence instead of three independent flashes. Using
      // transform + opacity keeps the work on the compositor.
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isReady ? 1 : 0.6, y: 0 }}
      transition={{ duration: 0.22, delay: 0.04 + index * 0.05, ease: 'easeOut' }}
      whileTap={isReady ? { scale: 0.97 } : undefined}
      // Start fetching the game's JS chunk the moment the finger lands on
      // the card — by the time the tap completes (~100-200ms), the lazy
      // module is usually already resolved and <Suspense> skips its
      // fallback on the next render. No more spinner flash between Lobby
      // and the game.
      onPointerDown={isReady ? () => preloadGame(game.id) : undefined}
      onClick={() => { if (isReady) { hapticTap(); onSelect(game.id); } }}
      disabled={!isReady}
      className={cx(
        // Avoid `transition-all` — it animates background-image and ring on
        // first paint, which the eye reads as flicker. Limit transitions to
        // the hover ring colour only, leaving entry/tap to Framer Motion.
        'group relative flex w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left ring-1 transition-colors duration-200',
        game.gradient,
        isReady
          ? 'ring-[rgb(var(--orb-border-rgb))] hover:ring-[rgb(var(--orb-accent-rgb))]/60'
          : 'cursor-not-allowed ring-[rgb(var(--orb-border-rgb))]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--orb-accent-rgb))]/20 ring-1 ring-[rgb(var(--orb-accent-rgb))]/30">
          <Icon className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" strokeWidth={2} />
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--orb-bg-rgb))]/40 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
          {game.soloPlayer ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {playersLabel}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-base font-bold text-[rgb(var(--orb-text-rgb))]">{title}</div>
        <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div>
      </div>
      {!isReady ? (
        <div className="mt-3 inline-flex items-center gap-1 self-start rounded-full bg-[rgb(var(--orb-bg-rgb))]/40 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <Clock className="h-3 w-3" />
          {t('games.soon')}
        </div>
      ) : null}
    </motion.button>
  );
}

function Lobby({ onSelect }) {
  useLang();
  // Warm both game chunks during the browser's idle time, so even a user
  // who double-taps or has a flaky connection still gets an instant open.
  // Pointerdown on the card is the primary preload path; this is a net.
  useEffect(() => {
    const idle = (cb) =>
      (typeof window !== 'undefined' && window.requestIdleCallback)
        ? window.requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 400);
    const cancel = (id) =>
      (typeof window !== 'undefined' && window.cancelIdleCallback)
        ? window.cancelIdleCallback(id)
        : clearTimeout(id);
    const handle = idle(() => {
      for (const id of Object.keys(PRELOADERS)) preloadGame(id);
    });
    return () => cancel(handle);
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-6 pt-3">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))]/15 ring-1 ring-[rgb(var(--orb-accent-rgb))]/25">
          <Gamepad2 className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" />
        </div>
        <div>
          <div className="text-lg font-bold text-[rgb(var(--orb-text-rgb))]">{t('games.title')}</div>
          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
            {t('games.subtitle')}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAMES.map((g, i) => (
          <GameCard key={g.id} game={g} onSelect={onSelect} index={i} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/40 p-3 text-xs leading-relaxed text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="mb-1 font-semibold text-[rgb(var(--orb-text-rgb))]">{t('games.how.title')}</div>
        {t('games.how.body')}
      </div>
    </div>
  );
}

export default function Games() {
  const [screen, setScreen] = useState('lobby');

  const backToLobby = () => { hapticTap(); setScreen('lobby'); };

  // No inner AnimatePresence: the parent <PageTransition> in App.jsx already
  // fades the whole tab in (opacity + blur). Stacking another opacity fade
  // here forced an extra compositing layer to spin up and tear down on every
  // lobby↔game switch — the two animations interfered, which is what made
  // the cards flicker. Card entry is now driven directly by Framer Motion
  // on each <GameCard> (with a small stagger), giving a smoother feel
  // without the double-layer cost.
  return (
    <div className="relative h-full w-full">
      {screen === 'lobby' ? (
        <Lobby onSelect={(id) => { setScreen(id); }} />
      ) : screen === 'blockblast' ? (
        <Suspense fallback={
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--orb-muted-rgb))]" />
          </div>
        }>
          <BlockBlast onExit={backToLobby} />
        </Suspense>
      ) : screen === 'blackjack21' ? (
        <Suspense fallback={
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--orb-muted-rgb))]" />
          </div>
        }>
          <Blackjack21 onExit={backToLobby} />
        </Suspense>
      ) : null}
    </div>
  );
}
