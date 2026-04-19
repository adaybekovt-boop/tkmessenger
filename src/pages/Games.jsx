import { lazy, Suspense, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Blocks, Clock, Gamepad2, Loader2, Spade, Swords, Users, User } from 'lucide-react';
import { hapticTap } from '../core/haptics.js';
import { cx } from '../utils/common.js';

// Each game is its own lazy chunk — idle users don't pay for the Block Blast
// runtime until they open it, and future Blackjack / Chess bundles won't
// bloat the lobby either.
const BlockBlast = lazy(() => import('../games/blockblast/BlockBlast.jsx'));
const Blackjack21 = lazy(() => import('../games/blackjack21/Blackjack21.jsx'));

const GAMES = [
  {
    id: 'blockblast',
    title: 'Block Blast',
    subtitle: 'Фигуры на поле 8×8 · соло',
    players: '1 игрок',
    status: 'ready',
    icon: Blocks,
    // Accent gradient for the card; uses theme tokens so every theme looks
    // native instead of fighting against hard-coded brand colours.
    gradient: 'from-[rgb(var(--orb-accent-rgb))]/30 to-[rgb(var(--orb-accent2-rgb))]/10'
  },
  {
    id: 'blackjack21',
    title: '21 очко',
    subtitle: 'Blackjack · соло или с другом',
    players: '1–2 игрока',
    status: 'ready',
    icon: Spade,
    gradient: 'from-[rgb(var(--orb-success-rgb))]/25 to-[rgb(var(--orb-accent-rgb))]/10'
  },
  {
    id: 'chess',
    title: 'Шахматы',
    subtitle: 'Полные правила · с собеседником',
    players: '2 игрока',
    status: 'soon',
    icon: Swords,
    gradient: 'from-[rgb(var(--orb-danger-rgb))]/25 to-[rgb(var(--orb-accent2-rgb))]/10'
  }
];

function GameCard({ game, onSelect }) {
  const Icon = game.icon;
  const isReady = game.status === 'ready';
  return (
    <motion.button
      type="button"
      whileTap={isReady ? { scale: 0.97 } : undefined}
      onClick={() => { if (isReady) { hapticTap(); onSelect(game.id); } }}
      disabled={!isReady}
      className={cx(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left ring-1 transition-all duration-200',
        game.gradient,
        isReady
          ? 'ring-[rgb(var(--orb-border-rgb))] hover:ring-[rgb(var(--orb-accent-rgb))]/60'
          : 'cursor-not-allowed opacity-60 ring-[rgb(var(--orb-border-rgb))]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--orb-accent-rgb))]/20 ring-1 ring-[rgb(var(--orb-accent-rgb))]/30">
          <Icon className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" strokeWidth={2} />
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[rgb(var(--orb-bg-rgb))]/40 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
          {game.players === '1 игрок' ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {game.players}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-base font-bold text-[rgb(var(--orb-text-rgb))]">{game.title}</div>
        <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{game.subtitle}</div>
      </div>
      {!isReady ? (
        <div className="mt-3 inline-flex items-center gap-1 self-start rounded-full bg-[rgb(var(--orb-bg-rgb))]/40 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <Clock className="h-3 w-3" />
          Скоро
        </div>
      ) : null}
    </motion.button>
  );
}

function Lobby({ onSelect }) {
  return (
    <div className="h-full w-full overflow-y-auto px-4 pb-6 pt-3">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))]/15 ring-1 ring-[rgb(var(--orb-accent-rgb))]/25">
          <Gamepad2 className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" />
        </div>
        <div>
          <div className="text-lg font-bold text-[rgb(var(--orb-text-rgb))]">Игры</div>
          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
            Мини-игры прямо в мессенджере
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <GameCard key={g.id} game={g} onSelect={onSelect} />
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/40 p-3 text-xs leading-relaxed text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="mb-1 font-semibold text-[rgb(var(--orb-text-rgb))]">Как это работает?</div>
        Одиночные игры доступны сразу. Для игр на двоих нужно пригласить
        собеседника — ходы передаются напрямую между вашими устройствами.
      </div>
    </div>
  );
}

export default function Games() {
  const [screen, setScreen] = useState('lobby');

  const backToLobby = () => { hapticTap(); setScreen('lobby'); };

  return (
    <div className="relative h-full w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full w-full"
        >
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
