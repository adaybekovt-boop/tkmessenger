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

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        try { URL.revokeObjectURL(urlRef.current); } catch (_) {}
      }
      const a = audioRef.current;
      if (a) {
        try { a.pause(); } catch (_) {}
      }
    };
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (ready) return true;
    setLoading(true);
    try {
      const row = await getVoiceBlob(msgId);
      if (!row?.blob) return false;
      const url = URL.createObjectURL(row.blob);
      urlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      const a = audioRef.current;
      a.src = url;
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      a.ontimeupdate = () => {
        const d = a.duration || voice?.duration || 0;
        setProgress(d > 0 ? Math.min(1, a.currentTime / d) : 0);
      };
      setReady(true);
      return true;
    } catch (_) {
      return false;
    } finally {
      setLoading(false);
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
  const shownSeconds = Math.max(0, Math.floor(duration - duration * progress));
  const mm = String(Math.floor(shownSeconds / 60)).padStart(2, '0');
  const ss = String(shownSeconds % 60).padStart(2, '0');

  return (
    <div className="flex min-w-[180px] items-center gap-3">
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
      <div className="font-mono text-[11px] text-[rgb(var(--orb-muted-rgb))]">
        {mm}:{ss}
      </div>
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
