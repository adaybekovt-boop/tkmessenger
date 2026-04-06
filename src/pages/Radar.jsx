import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Radar as RadarIcon, Sparkles } from 'lucide-react';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

export default function Radar() {
  const [scanning, setScanning] = useState(true);
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (!scanning) return;
    const ids = ['ORBIT-ALPHA', 'ORBIT-GAMMA', 'ORBIT-DELTA', 'ORBIT-SIGMA', 'ORBIT-OMEGA'];
    let i = 0;
    const t = setInterval(() => {
      setFound((f) => {
        const next = ids[i % ids.length];
        i++;
        if (f.includes(next)) return f;
        return [next, ...f].slice(0, 10);
      });
    }, 850);
    return () => clearInterval(t);
  }, [scanning]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      <div className="orb-blur flex items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Радар</div>
          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Поиск пиров (демо-режим фазы 0)</div>
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
                  className="flex items-center justify-between rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                >
                  <span className="truncate">{id}</span>
                  <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/25 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Подсказки</div>
          <div className="mt-2 grid gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
            <div>Радар показывает ближайшие пиры, когда они онлайн и доступны для соединения.</div>
            <div>Если пир оффлайн, ты всё равно можешь написать — сообщение уйдёт в очередь и доставится позже.</div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
