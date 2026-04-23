import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Waveform } from './VoiceRecorder.jsx';
import { getVoiceBlob } from '../core/db.js';

/**
 * Воспроизведение голосового сообщения.
 * Загружает blob из IndexedDB по msgId лениво (при первом play).
 */
export default function VoicePlayer({ msgId, voice, mine }) {
  const audioRef = useRef(null);
  const urlRef = useRef('');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlRef.current) {
        try { URL.revokeObjectURL(urlRef.current); } catch (_) {}
        urlRef.current = '';
      }
      const a = audioRef.current;
      if (a) {
        try { a.pause(); } catch (_) {}
        // Drop handler closures so the audio element and its state-setters
        // can be collected — onended/ontimeupdate held the setPlaying /
        // setProgress closures that would otherwise keep referencing the
        // unmounted component.
        a.onended = null;
        a.ontimeupdate = null;
        try { a.removeAttribute('src'); a.load(); } catch (_) {}
        audioRef.current = null;
      }
    };
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (ready) return true;
    setLoading(true);
    try {
      const row = await getVoiceBlob(msgId);
      // If the component unmounted while we were awaiting IndexedDB, drop
      // the blob — creating the object URL now would leak it because the
      // unmount cleanup has already run with urlRef empty.
      if (!mountedRef.current) return false;
      if (!row?.blob) return false;
      const url = URL.createObjectURL(row.blob);
      if (!mountedRef.current) {
        try { URL.revokeObjectURL(url); } catch (_) {}
        return false;
      }
      urlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      a.src = url;
      a.onended = () => {
        if (!mountedRef.current) return;
        setPlaying(false);
        setProgress(0);
      };
      a.ontimeupdate = () => {
        if (!mountedRef.current) return;
        const d = a.duration || voice?.duration || 0;
        setProgress(d > 0 ? Math.min(1, a.currentTime / d) : 0);
      };
      setReady(true);
      return true;
    } catch (_) {
      return false;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [msgId, ready, voice?.duration]);

  const togglePlay = async () => {
    const ok = await ensureLoaded();
    if (!ok) return;
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch (_) {
      }
    }
  };

  const duration = Number(voice?.duration || 0);
  const waveform = Array.isArray(voice?.waveform) ? voice.waveform : [];
  const transcript = typeof voice?.transcript === 'string' ? voice.transcript.trim() : '';
  const shownSeconds = Math.max(0, Math.floor(duration - duration * progress));
  const mm = String(Math.floor(shownSeconds / 60)).padStart(2, '0');
  const ss = String(shownSeconds % 60).padStart(2, '0');
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="flex min-w-[180px] flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading}
          className={
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ' +
            (mine
              ? 'bg-[rgb(var(--orb-accent-rgb))] text-white'
              : 'bg-[rgb(var(--orb-surface-rgb))] text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]')
          }
          aria-label={playing ? 'Пауза' : 'Играть'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="flex-1">
          <ProgressWaveform levels={waveform} progress={progress} />
        </div>
        <div className="shrink-0 min-w-[38px] text-right font-mono text-[11px] text-[rgb(var(--orb-muted-rgb))]">
          {mm}:{ss}
        </div>
      </div>
      {transcript ? (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className={
              'text-[10px] uppercase tracking-wide transition ' +
              (mine ? 'text-white/70 hover:text-white' : 'text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))]')
            }
          >
            {showTranscript ? 'Скрыть текст' : 'Показать текст'}
          </button>
          {showTranscript ? (
            <div
              className={
                'mt-1 rounded-xl px-2.5 py-1.5 text-xs leading-snug ' +
                (mine
                  ? 'bg-white/10 text-white'
                  : 'bg-[rgb(var(--orb-surface-rgb))]/80 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]')
              }
            >
              {transcript}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressWaveform({ levels, progress }) {
  const count = 40;
  const bars = Array.from({ length: count }, (_, i) => levels[Math.floor((i * levels.length) / count)] || 0);
  const cutoff = Math.floor(progress * count);
  return (
    <div className="flex h-7 items-center gap-0.5">
      {bars.map((v, i) => (
        <span
          key={i}
          className={
            'inline-block w-[3px] rounded-full ' +
            (i < cutoff
              ? 'bg-[rgb(var(--orb-accent-rgb))]'
              : 'bg-[rgb(var(--orb-muted-rgb))]/50')
          }
          style={{ height: `${Math.max(14, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

// Also expose non-default export used by some imports
export { VoicePlayer };
