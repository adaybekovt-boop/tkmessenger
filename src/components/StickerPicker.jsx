import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { getInstalledPacks, getRecents, recordStickerUsage } from '../core/stickerManager.js';
import { hapticTap } from '../core/haptics.js';

export default function StickerPicker({ open, onClose, onPick }) {
  const [packs, setPacks] = useState([]);
  const [recents, setRecents] = useState([]);
  const [activeTab, setActiveTab] = useState('recent');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const list = await getInstalledPacks();
      if (cancelled) return;
      setPacks(list);
      if (activeTab === 'recent') {
        const r = await getRecents(32);
        if (!cancelled) setRecents(r);
      }
      if (activeTab !== 'recent' && !list.find((p) => p.id === activeTab)) {
        setActiveTab(list[0]?.id || 'recent');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeTab]);

  const activePack = useMemo(() => packs.find((p) => p.id === activeTab) || null, [packs, activeTab]);

  const pick = async (pack, sticker) => {
    hapticTap();
    await recordStickerUsage(pack.id, sticker.id);
    onPick?.({
      packId: pack.id,
      packName: pack.name,
      stickerId: sticker.id,
      url: sticker.url,
      emoji: sticker.emoji || sticker.label || ''
    });
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-x-0 bottom-[calc(100%+8px)] z-30 mx-auto w-full max-w-3xl px-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <div className="orb-blur rounded-3xl border border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/90 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--orb-border-rgb))] px-3 py-2">
              <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">СТИКЕРЫ</div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition active:scale-95"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="orb-scroll max-h-[42dvh] overflow-y-auto p-3">
              {activeTab === 'recent' ? (
                recents.length ? (
                  <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                    {recents.map(({ pack, sticker }) => (
                      <StickerCell key={`${pack.id}:${sticker.id}`} sticker={sticker} onClick={() => pick(pack, sticker)} />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-[rgb(var(--orb-muted-rgb))]">
                    Недавних стикеров пока нет
                  </div>
                )
              ) : activePack ? (
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                  {activePack.stickers.map((s) => (
                    <StickerCell key={s.id} sticker={s} onClick={() => pick(activePack, s)} />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-1 border-t border-[rgb(var(--orb-border-rgb))] px-2 py-2 overflow-x-auto">
              <TabButton
                active={activeTab === 'recent'}
                onClick={() => setActiveTab('recent')}
                title="Недавние"
              >
                <Clock className="h-4 w-4" />
              </TabButton>
              {packs.map((p) => (
                <TabButton
                  key={p.id}
                  active={activeTab === p.id}
                  onClick={() => setActiveTab(p.id)}
                  title={p.name}
                >
                  <img alt={p.name} src={p.thumbnail || p.stickers?.[0]?.url} className="h-6 w-6 object-contain" />
                </TabButton>
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function TabButton({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ' +
        (active
          ? 'bg-[rgb(var(--orb-accent-rgb))]/20 ring-1 ring-[rgb(var(--orb-accent-rgb))]/40'
          : 'bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-[rgb(var(--orb-border-rgb))]')
      }
    >
      {children}
    </button>
  );
}

function StickerCell({ sticker, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex aspect-square items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/30 p-1 ring-1 ring-transparent transition hover:bg-[rgb(var(--orb-surface-rgb))]/60 hover:ring-[rgb(var(--orb-border-rgb))] active:scale-95"
    >
      <img alt={sticker.label || ''} src={sticker.url} loading="lazy" className="h-full w-full object-contain" />
    </button>
  );
}
