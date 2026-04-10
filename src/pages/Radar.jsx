import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardCopy, Radar as RadarIcon, Sparkles } from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';
import { hapticTap } from '../core/haptics.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

export default function Radar() {
  const peer = usePeerContext();
  const [scanning, setScanning] = useState(true);
  const [copied, setCopied] = useState(false);

  const sortedPeers = useMemo(() => {
    const blocked = peer.blockedPeers || [];
    const list = (Array.isArray(peer.peers) ? peer.peers : []).filter((p) => !blocked.includes(p.id));
    list.sort((a, b) => {
      const ar = a.status === 'online' ? 0 : a.status === 'connecting' ? 1 : 2;
      const br = b.status === 'online' ? 0 : b.status === 'connecting' ? 1 : 2;
      if (ar !== br) return ar - br;
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
    return list.slice(0, 80);
  }, [peer.peers, peer.blockedPeers]);

  const found = useMemo(() => {
    return sortedPeers.filter((p) => p.status === 'online').map((p) => p.id).slice(0, 18);
  }, [sortedPeers]);

  const scanCooldownRef = useRef(new Map());

  useEffect(() => {
    if (!scanning) return;
    const tick = async () => {
      const now = Date.now();
      const candidates = sortedPeers
        .filter((p) => p.id && p.status !== 'online' && p.id !== peer.peerId)
        .slice(0, 20);

      for (const p of candidates) {
        const last = scanCooldownRef.current.get(p.id) || 0;
        if (now - last < 9000) continue;
        scanCooldownRef.current.set(p.id, now);
        try {
          await peer.connect(p.id);
        } catch (_) {
        }
        break;
      }
    };

    void tick();
    const t = setInterval(() => {
      void tick();
    }, 1200);
    return () => clearInterval(t);
  }, [peer.connect, peer.peerId, scanning, sortedPeers]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      <div className="orb-blur flex items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Радар</div>
          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Бета: показывает, кто из контактов онлайн</div>
        </div>
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
        >
          <RadarIcon className="h-4 w-4" />
          {scanning ? 'Остановить' : 'Сканировать'}
        </button>
      </div>

      <div className="orb-scroll flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-6">
        <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/25 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Твой ID</div>
              <div className="mt-1 font-mono text-xs text-[rgb(var(--orb-text-rgb))]">{peer.peerId || '…'}</div>
            </div>
            <button
              type="button"
              disabled={!peer.peerId}
              onClick={async () => {
                if (!peer.peerId) return;
                hapticTap();
                try {
                  await navigator.clipboard.writeText(peer.peerId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1100);
                } catch (_) {
                }
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
            >
              <ClipboardCopy className="h-4 w-4" />
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">Статус: {peer.status || '—'}</div>
        </div>

        <div className="relative h-[300px] w-[300px] shrink-0">
          <div className="absolute inset-0 rounded-full bg-[rgb(var(--orb-surface-rgb))]/40 ring-1 ring-[rgb(var(--orb-border-rgb))]" />
          <div className="absolute inset-6 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))]/70" />
          <div className="absolute inset-12 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))]/55" />
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div
              className={cx('absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 origin-top-left', scanning ? 'animate-radarSweep' : '')}
              style={{
                background:
                  'conic-gradient(from 90deg, rgba(59,130,246,0) 0deg, rgba(59,130,246,0.18) 22deg, rgba(59,130,246,0) 60deg)'
              }}
            />
          </div>
          <div className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--orb-accent-rgb))] shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)]" />
        </div>

        <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Найденные пиры</div>
            <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{scanning ? 'сканирование…' : 'пауза'}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AnimatePresence initial={false}>
              {found.map((id) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="flex items-center justify-between rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] cursor-pointer"
                  onClick={() => {
                    hapticTap();
                    peer.setSelectedPeerId?.(id);
                  }}
                >
                  <span className="truncate">{id}</span>
                  <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {!found.length ? <div className="mt-3 text-xs text-[rgb(var(--orb-muted-rgb))]">Пока никого онлайн не видно. Добавь контакты и включи сканирование.</div> : null}
        </div>

        <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/25 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Подсказки</div>
          <div className="mt-2 grid gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
            <div>В бете радар проверяет твою записную книжку и показывает, кто из контактов сейчас онлайн.</div>
            <div>Нажми на найденный ID — он откроется как активный чат во вкладке «Чаты».</div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
