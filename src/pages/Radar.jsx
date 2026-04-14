import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardCopy, Radar as RadarIcon, UserPlus, MessageSquare } from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';
import { hapticTap } from '../core/haptics.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function pluralPeers(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} пиров обнаружено`;
  if (last === 1) return `${n} пир обнаружен`;
  if (last >= 2 && last <= 4) return `${n} пира обнаружено`;
  return `${n} пиров обнаружено`;
}

export default function Radar() {
  const peer = usePeerContext();
  const [scanning, setScanning] = useState(true);
  const [copied, setCopied] = useState(false);
  const [discovered, setDiscovered] = useState([]);
  const scanTimerRef = useRef(null);

  // Known contact IDs for quick lookup
  const knownIds = useMemo(() => {
    return new Set((peer.peers || []).map((p) => p.id));
  }, [peer.peers]);

  // Scan for ALL peers on the signaling server
  useEffect(() => {
    if (!scanning) {
      setDiscovered([]);
      return;
    }

    let pending = false;
    const scan = async () => {
      if (pending) return;
      pending = true;
      try {
        const ids = await peer.discoverPeers();
        setDiscovered(ids);
      } catch (_) {}
      pending = false;
    };

    void scan();
    scanTimerRef.current = setInterval(scan, 3000);
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [scanning, peer.discoverPeers]);

  // Separate discovered peers into contacts and strangers
  const contacts = useMemo(() => discovered.filter((id) => knownIds.has(id)), [discovered, knownIds]);
  const strangers = useMemo(() => discovered.filter((id) => !knownIds.has(id)), [discovered, knownIds]);

  const handleConnect = useCallback((id) => {
    hapticTap();
    try { peer.connect(id); } catch (_) {}
  }, [peer]);

  // Radar dot positions — distribute discovered peers around the radar circle
  const dotPositions = useMemo(() => {
    return discovered.map((id, i) => {
      const angle = (i / Math.max(discovered.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const isContact = knownIds.has(id);
      // Contacts closer to center, strangers further out
      const radius = isContact ? 0.3 + Math.random() * 0.2 : 0.5 + Math.random() * 0.35;
      return {
        id,
        x: 50 + Math.cos(angle) * radius * 45,
        y: 50 + Math.sin(angle) * radius * 45,
        isContact
      };
    });
  }, [discovered, knownIds]);

  const displayName = (id) => {
    const profile = peer.profilesByPeer?.[id];
    const raw = profile?.displayName || profile?.nickname || id;
    return raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
  };

  return (
    <div className="orb-page-bg flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      {/* Header */}
      <div className="orb-blur flex items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Радар</div>
          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
            {scanning
              ? pluralPeers(discovered.length)
              : 'Сканирование остановлено'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { hapticTap(); setScanning((s) => !s); }}
          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
        >
          <RadarIcon className="h-4 w-4" />
          {scanning ? 'Стоп' : 'Сканировать'}
        </button>
      </div>

      <div className="orb-content-scrim orb-scroll flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5">

          {/* Your ID card */}
          <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/25 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Твой ID</div>
                <div className="mt-1 font-mono text-xs text-[rgb(var(--orb-text-rgb))]">{peer.peerId || '...'}</div>
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
                  } catch (_) {}
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all active:scale-95 disabled:opacity-60"
              >
                <ClipboardCopy className="h-4 w-4" />
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          {/* Radar visualization */}
          <div className="relative h-[280px] w-[280px] shrink-0">
            <div className="absolute inset-0 rounded-full bg-[rgb(var(--orb-surface-rgb))]/40 ring-1 ring-[rgb(var(--orb-border-rgb))]" />
            <div className="absolute inset-6 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))]/70" />
            <div className="absolute inset-12 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))]/55" />
            {/* Sweep animation */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div
                className={cx('absolute left-1/2 top-1/2 h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 origin-top-left', scanning ? 'animate-radarSweep' : '')}
                style={{
                  background: 'conic-gradient(from 90deg, rgba(var(--orb-accent-rgb),0) 0deg, rgba(var(--orb-accent-rgb),0.18) 22deg, rgba(var(--orb-accent-rgb),0) 60deg)'
                }}
              />
            </div>
            {/* Center dot (you) */}
            <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--orb-accent-rgb))] shadow-[0_0_12px_rgba(var(--orb-accent-rgb),0.4)]" />
            {/* Discovered peer dots */}
            <AnimatePresence>
              {dotPositions.map((dot) => (
                <motion.div
                  key={dot.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className={cx(
                    'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer',
                    dot.isContact
                      ? 'bg-[rgb(var(--orb-success-rgb))] shadow-[0_0_8px_rgba(var(--orb-success-rgb),0.5)]'
                      : 'bg-[rgb(var(--orb-accent-rgb))]/70 shadow-[0_0_8px_rgba(var(--orb-accent-rgb),0.3)]'
                  )}
                  style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
                  onClick={() => handleConnect(dot.id)}
                  title={dot.id}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Legend */}
          {discovered.length > 0 && (
            <div className="flex items-center gap-4 text-[10px] text-[rgb(var(--orb-muted-rgb))]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--orb-success-rgb))]" />
                Контакт ({contacts.length})
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--orb-accent-rgb))]/70" />
                Новый ({strangers.length})
              </span>
            </div>
          )}

          {/* Discovered peers list */}
          <div className="w-full rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Все пиры поблизости</div>
              <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{discovered.length}</div>
            </div>

            {discovered.length === 0 && (
              <div className="mt-3 text-xs text-[rgb(var(--orb-muted-rgb))]">
                {scanning ? 'Сканируем сигнальный сервер...' : 'Включите сканирование для поиска.'}
              </div>
            )}

            <div className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {discovered.map((id) => {
                  const isContact = knownIds.has(id);
                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-3 py-2.5 ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cx(
                            'inline-block h-2 w-2 shrink-0 rounded-full',
                            isContact ? 'bg-[rgb(var(--orb-success-rgb))]' : 'bg-[rgb(var(--orb-accent-rgb))]/70'
                          )} />
                          <span className="truncate text-xs font-medium text-[rgb(var(--orb-text-rgb))]">
                            {displayName(id)}
                          </span>
                        </div>
                        {isContact && (
                          <span className="ml-4 text-[10px] text-[rgb(var(--orb-muted-rgb))]">В контактах</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleConnect(id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--orb-accent-rgb))]/15 px-2.5 py-1.5 text-[11px] text-[rgb(var(--orb-accent-rgb))] transition-all active:scale-95"
                      >
                        {isContact ? <MessageSquare className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                        {isContact ? 'Чат' : 'Подключить'}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
