import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Trash2, Send } from 'lucide-react';
import { createVoiceRecorder } from '../core/audioRecorder.js';
import { hapticTap } from '../core/haptics.js';

/**
 * VoiceRecorder — экран записи голосового сообщения.
 * Показывается "поверх" инпута во время записи (absolutely positioned).
 * Пропсы:
 *   onSend({blob, duration, waveform, mime})
 *   onCancel()
 */
export default function VoiceRecorder({ onSend, onCancel }) {
  const recRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stopped = false;
    let interval = null;
    (async () => {
      try {
        const rec = await createVoiceRecorder();
        if (stopped) {
          rec.cancel();
          return;
        }
        recRef.current = rec;
        interval = setInterval(() => {
          if (!recRef.current) return;
          setElapsed(Math.round(recRef.current.elapsed() / 100) / 10);
          setLevels(recRef.current.getSamples().slice(-40));
        }, 100);
      } catch (e) {
        setError(e?.message || 'Не удалось включить микрофон');
      }
    })();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      const r = recRef.current;
      recRef.current = null;
      if (r) r.cancel().catch(() => {});
    };
  }, []);

  const handleSend = async () => {
    if (busy) return;
    setBusy(true);
    hapticTap();
    const r = recRef.current;
    recRef.current = null;
    try {
      if (!r) {
        onCancel?.();
        return;
      }
      const data = await r.stop();
      if (!data.blob || data.duration < 0.2) {
        onCancel?.();
        return;
      }
      onSend?.(data);
    } catch (_) {
      onCancel?.();
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    hapticTap();
    const r = recRef.current;
    recRef.current = null;
    if (r) await r.cancel().catch(() => {});
    onCancel?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="flex min-h-[46px] flex-1 items-center gap-3 rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/60 px-4 py-2 ring-1 ring-[rgb(var(--orb-border-rgb))]"
    >
      <button
        type="button"
        onClick={handleCancel}
        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/25 transition active:scale-95"
        aria-label="Отменить запись"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <div className="flex flex-1 items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[rgb(var(--orb-danger-rgb))]" />
        <span className="font-mono text-xs text-[rgb(var(--orb-text-rgb))]">{formatTime(elapsed)}</span>
        <Waveform levels={levels} live />
      </div>

      {error ? (
        <span className="text-xs text-[rgb(var(--orb-danger-rgb))]">{error}</span>
      ) : null}

      <button
        type="button"
        onClick={handleSend}
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
        aria-label="Отправить голосовое"
      >
        <Send className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const tenths = Math.floor((seconds - s) * 10);
  return `${mm}:${ss}.${tenths}`;
}

export function Waveform({ levels = [], live = false, className = '' }) {
  const bars = Array.from({ length: 40 }, (_, i) => levels[i] || 0);
  return (
    <div className={'flex h-6 flex-1 items-center gap-0.5 ' + className}>
      {bars.map((v, i) => (
        <span
          key={i}
          className={
            'inline-block w-[3px] rounded-full ' +
            (live ? 'bg-[rgb(var(--orb-accent-rgb))]' : 'bg-[rgb(var(--orb-muted-rgb))]')
          }
          style={{ height: `${Math.max(10, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Компонент-микрокнопка для кнопки "диктофон" рядом с инпутом.
 */
export function VoiceButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition active:scale-95 disabled:opacity-60"
      aria-label="Голосовое сообщение"
      title="Голосовое сообщение"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
