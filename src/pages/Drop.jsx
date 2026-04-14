import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpFromLine, Check, FileUp, Loader2, Send, Signal, X } from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';
import { hapticTap } from '../core/haptics.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const val = bytes / (1 << (i * 10));
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function BucketBadge({ bucket }) {
  const colors = {
    near: 'bg-green-500/20 text-green-400 ring-green-500/30',
    mid: 'bg-yellow-500/20 text-yellow-400 ring-yellow-500/30',
    far: 'bg-red-500/20 text-red-400 ring-red-500/30'
  };
  return (
    <span className={cx('rounded-full px-2 py-0.5 text-[10px] ring-1', colors[bucket] || colors.far)}>
      {bucket === 'near' ? 'Рядом' : bucket === 'mid' ? 'Средне' : 'Далеко'}
    </span>
  );
}

function PeerCard({ entry, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => { hapticTap(); onSelect(entry.peerId); }}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-200 active:scale-[0.98]',
        selected
          ? 'bg-[rgb(var(--orb-accent-rgb))]/15 ring-[rgb(var(--orb-accent-rgb))]/40'
          : 'bg-[rgb(var(--orb-surface-rgb))]/40 ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/60'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--orb-accent-rgb))]/20">
        <Signal className="h-4 w-4 text-[rgb(var(--orb-accent-rgb))]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[rgb(var(--orb-text-rgb))]">
          {entry.nickname || entry.peerId.slice(0, 12)}
        </div>
        <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
          {entry.rtt != null ? `${Math.round(entry.rtt)} ms` : '...'}
        </div>
      </div>
      <BucketBadge bucket={entry.bucket} />
    </button>
  );
}

function QualityPicker({ value, onChange }) {
  const options = [
    { id: 'high', label: 'High', desc: '1920px, 85%' },
    { id: 'fast', label: 'Fast', desc: '1080px, 60%' },
    { id: 'original', label: 'Original', desc: 'Без сжатия' }
  ];
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => { hapticTap(); onChange(opt.id); }}
          className={cx(
            'flex-1 rounded-xl px-2 py-2 text-center text-xs ring-1 transition-all duration-200 active:scale-95',
            value === opt.id
              ? 'bg-[rgb(var(--orb-accent-rgb))]/20 text-[rgb(var(--orb-accent-rgb))] ring-[rgb(var(--orb-accent-rgb))]/40'
              : 'text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:text-[rgb(var(--orb-text-rgb))]'
          )}
        >
          <div className="font-medium">{opt.label}</div>
          <div className="text-[10px] opacity-70">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}

export default function Drop() {
  const peer = usePeerContext();
  const drop = peer.drop;
  const { state: dropState } = drop;
  const fileInputRef = useRef(null);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [quality, setQuality] = useState('high');

  // Stable ref so effects/callbacks never chase a changing object identity.
  const dropRef = useRef(drop);
  dropRef.current = drop;

  const peerRef = useRef(peer);
  peerRef.current = peer;

  // Activate Drop beacon on mount, deactivate on unmount.
  // Open ephemeral channels to ALL discovered peers (not just contacts)
  // so beacons can flow between any two users with Drop open.
  useEffect(() => {
    dropRef.current.activate();

    const ensureConnections = async () => {
      // Skip discovery polling while a transfer is active — we already
      // have the connection we need and extra signaling would only add noise.
      if (dropRef.current.state?.status === 'transferring') return;

      // Connect to known contacts
      const peers = peerRef.current.peers || [];
      for (const p of peers) {
        peerRef.current.drop.openEphemeral?.(p.id);
      }
      // Also discover ALL peers on the signaling server and connect
      try {
        const allPeers = await peerRef.current.discoverPeers?.();
        if (Array.isArray(allPeers)) {
          for (const pid of allPeers) {
            peerRef.current.drop.openEphemeral?.(pid);
          }
        }
      } catch (_) {}
    };

    ensureConnections();
    const timer = setInterval(ensureConnections, 4000);

    return () => {
      clearInterval(timer);
      dropRef.current.deactivate();
    };
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setSelectedFiles(files);
    e.target.value = '';
  }, []);

  const handleSend = useCallback(() => {
    if (!selectedPeer || selectedFiles.length === 0) return;
    hapticTap();
    dropRef.current.requestDrop(selectedPeer, selectedFiles, quality);
  }, [selectedPeer, selectedFiles, quality]);

  const handleAccept = useCallback(() => {
    hapticTap();
    dropRef.current.acceptDrop();
  }, []);

  const handleReject = useCallback(() => {
    hapticTap();
    dropRef.current.rejectDrop();
  }, []);

  const handleCancel = useCallback(() => {
    hapticTap();
    dropRef.current.cancelRequest();
  }, []);

  const handleRetry = useCallback(() => {
    hapticTap();
    dropRef.current.activate();
  }, []);

  const presence = dropState.presence || [];
  const session = dropState.activeSession;
  const status = dropState.status;

  // Bug #10: timeout for beacon search — show retry after 15s
  const [searchTimeout, setSearchTimeout] = useState(false);
  useEffect(() => {
    if (status !== 'beacon' || presence.length > 0) {
      setSearchTimeout(false);
      return;
    }
    const timer = setTimeout(() => setSearchTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, [status, presence.length]);

  return (
    <div className="orb-content-scrim flex h-full flex-col overflow-y-auto px-4 py-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))]/15">
          <Send className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[rgb(var(--orb-text-rgb))]">Orbits Drop</h2>
          <p className="text-xs text-[rgb(var(--orb-muted-rgb))]">
            {status === 'beacon' && `${presence.length} устройств рядом`}
            {status === 'requesting' && 'Ожидание подтверждения...'}
            {status === 'awaiting-consent' && 'Входящий запрос'}
            {status === 'transferring' && 'Передача...'}
            {status === 'done' && 'Готово!'}
            {status === 'error' && 'Ошибка'}
            {status === 'idle' && 'Запуск...'}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* BEACON — main discovery state */}
        {status === 'beacon' && (
          <motion.div
            key="beacon"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-1 flex-col gap-4"
          >
            {/* Presence radar list */}
            <div className="flex-1 space-y-2">
              {presence.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  {!searchTimeout ? (
                    <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--orb-accent-rgb))]/40" />
                  ) : (
                    <Signal className="h-8 w-8 text-[rgb(var(--orb-muted-rgb))]/40" />
                  )}
                  <p className="text-sm text-[rgb(var(--orb-muted-rgb))]">
                    {searchTimeout ? 'Устройства не найдены' : 'Поиск устройств с Orbits Drop...'}
                  </p>
                  <p className="text-xs text-[rgb(var(--orb-muted-rgb))]/60">
                    Попросите получателя тоже открыть вкладку Drop
                  </p>
                  {searchTimeout && (
                    <button
                      type="button"
                      onClick={() => { hapticTap(); setSearchTimeout(false); handleRetry(); }}
                      className="rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-5 py-2 text-xs font-medium text-white transition-all active:scale-95"
                    >
                      Попробовать снова
                    </button>
                  )}
                </div>
              ) : (
                presence.map((entry) => (
                  <PeerCard
                    key={entry.peerId}
                    entry={entry}
                    selected={selectedPeer === entry.peerId}
                    onSelect={setSelectedPeer}
                  />
                ))
              )}
            </div>

            {/* File picker — always visible during beacon so user can pre-select
                files before any peer appears on the radar. */}
            <button
              type="button"
              onClick={() => { hapticTap(); fileInputRef.current?.click(); }}
              className="flex w-full items-center gap-3 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/50 px-4 py-3 text-left ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-200 active:scale-[0.98]"
            >
              <FileUp className="h-5 w-5 text-[rgb(var(--orb-accent-rgb))]" />
              <div className="min-w-0 flex-1">
                {selectedFiles.length > 0 ? (
                  <>
                    <div className="truncate text-sm text-[rgb(var(--orb-text-rgb))]">
                      {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} файлов`}
                    </div>
                    <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
                      {formatSize(selectedFiles.reduce((s, f) => s + f.size, 0))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[rgb(var(--orb-muted-rgb))]">Выбрать файлы</div>
                )}
              </div>
            </button>

            {/* Quality + Send — require both a peer and files selected */}
            {selectedPeer && selectedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <QualityPicker value={quality} onChange={setQuality} />

                <button
                  type="button"
                  onClick={handleSend}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 py-3 text-sm font-medium text-white transition-all duration-200 active:scale-[0.98]"
                >
                  <ArrowUpFromLine className="h-4 w-4" />
                  Отправить
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* REQUESTING — waiting for peer to accept */}
        {status === 'requesting' && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <Loader2 className="h-12 w-12 animate-spin text-[rgb(var(--orb-accent-rgb))]" />
            <p className="text-sm text-[rgb(var(--orb-text-rgb))]">Ожидание подтверждения...</p>
            <p className="text-xs text-[rgb(var(--orb-muted-rgb))]">
              {session?.remotePeerId?.slice(0, 12) || 'Получатель'} решает
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-2xl px-6 py-2 text-sm text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/30 transition-all active:scale-95"
            >
              Отменить
            </button>
          </motion.div>
        )}

        {/* AWAITING_CONSENT — someone wants to send to us */}
        {status === 'awaiting-consent' && (
          <motion.div
            key="consent"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--orb-accent-rgb))]/15">
              <FileUp className="h-8 w-8 text-[rgb(var(--orb-accent-rgb))]" />
            </div>
            <p className="text-sm font-medium text-[rgb(var(--orb-text-rgb))]">Входящая передача</p>
            <p className="text-xs text-[rgb(var(--orb-muted-rgb))]">
              {session?.remotePeerId?.slice(0, 12) || 'Кто-то'} хочет отправить
              {session?.files ? ` ${session.files.length} файл(ов) (${formatSize(session.totalSize)})` : ' файлы'}
            </p>

            {/* File list preview */}
            {session?.files?.length > 0 && (
              <div className="w-full max-w-xs space-y-1 rounded-xl bg-[rgb(var(--orb-surface-rgb))]/40 p-3">
                {session.files.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate text-[rgb(var(--orb-text-rgb))]">{f.name}</span>
                    <span className="shrink-0 pl-2 text-[rgb(var(--orb-muted-rgb))]">{formatSize(f.size)}</span>
                  </div>
                ))}
                {session.files.length > 5 && (
                  <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
                    ...и ещё {session.files.length - 5}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleReject}
                className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/30 transition-all active:scale-95"
              >
                <X className="h-4 w-4" />
                Отклонить
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-5 py-2.5 text-sm font-medium text-white transition-all active:scale-95"
              >
                <Check className="h-4 w-4" />
                Принять
              </button>
            </div>
          </motion.div>
        )}

        {/* TRANSFERRING — bytes flowing */}
        {status === 'transferring' && (
          <motion.div
            key="transferring"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <div className="relative">
              <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(var(--orb-border-rgb))" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="44" fill="none"
                  stroke="rgb(var(--orb-accent-rgb))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - (session?.progress || 0) / 100)}`}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-[rgb(var(--orb-text-rgb))]">
                {session?.progress || 0}%
              </div>
            </div>
            <p className="text-sm text-[rgb(var(--orb-text-rgb))]">
              {session?.statusText || 'Передача...'}
            </p>
            {session?.transferredBytes != null && session?.totalSize != null && (
              <p className="text-xs text-[rgb(var(--orb-muted-rgb))]">
                {formatSize(session.transferredBytes)} / {formatSize(session.totalSize)}
              </p>
            )}
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-2xl px-6 py-2 text-sm text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/30 transition-all active:scale-95"
            >
              Отменить
            </button>
          </motion.div>
        )}

        {/* DONE — transfer complete */}
        {status === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--orb-success-rgb))]/15">
              <Check className="h-8 w-8 text-[rgb(var(--orb-success-rgb))]" />
            </div>
            <p className="text-base font-medium text-[rgb(var(--orb-text-rgb))]">Передача завершена!</p>
            {session?.receivedFileUrl && (
              <a
                href={session.receivedFileUrl}
                download={session.receivedFileName || 'download'}
                className="rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-6 py-2.5 text-sm font-medium text-white transition-all active:scale-95"
              >
                Скачать файл
              </a>
            )}
            <button
              type="button"
              onClick={handleRetry}
              className="text-sm text-[rgb(var(--orb-accent-rgb))] underline"
            >
              Отправить ещё
            </button>
          </motion.div>
        )}

        {/* ERROR */}
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--orb-danger-rgb))]/15">
              <X className="h-8 w-8 text-[rgb(var(--orb-danger-rgb))]" />
            </div>
            <p className="text-sm font-medium text-[rgb(var(--orb-text-rgb))]">Ошибка передачи</p>
            <p className="max-w-xs text-center text-xs text-[rgb(var(--orb-muted-rgb))]">
              {dropState.error?.message || 'Произошла неизвестная ошибка'}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-6 py-2.5 text-sm font-medium text-white transition-all active:scale-95"
            >
              Попробовать снова
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
