// Renders an image / video / file attachment inside a chat bubble.
//
// Lazy-loads the underlying blob from IndexedDB (`file_blobs` store) on
// first interaction and creates an object URL for playback / download. The
// thumbnail (JPEG data URL) is shown instantly while the blob loads.
//
// Props:
//   msgId      — message id (key into file_blobs)
//   attachment — { name, size, mime, kind, thumb?, width?, height?, duration?, missing? }
//   mine       — whether the message is from the current user (for tint/colors)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Play, Pause, Loader2 } from 'lucide-react';
import { getFileBlob } from '../core/db.js';
import { getFileIcon } from '../utils/fileIcon.jsx';
import { formatBytes } from '../core/attachmentPreview.js';
import { cx } from '../utils/common.js';

export default function AttachmentBubble({ msgId, attachment, mine }) {
  const urlRef = useRef('');
  const [fullUrl, setFullUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(!!attachment?.missing);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        try { URL.revokeObjectURL(urlRef.current); } catch (_) {}
      }
    };
  }, []);

  const ensureBlob = useCallback(async () => {
    if (fullUrl) return fullUrl;
    if (unavailable) return '';
    setLoading(true);
    try {
      const row = await getFileBlob(msgId);
      if (!row?.blob) {
        setUnavailable(true);
        return '';
      }
      const url = URL.createObjectURL(row.blob);
      urlRef.current = url;
      setFullUrl(url);
      return url;
    } catch (_) {
      setUnavailable(true);
      return '';
    } finally {
      setLoading(false);
    }
  }, [fullUrl, msgId, unavailable]);

  const download = useCallback(async () => {
    const url = await ensureBlob();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment?.name || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [attachment?.name, ensureBlob]);

  const kind = attachment?.kind || 'file';
  const name = attachment?.name || 'file';
  const size = Number(attachment?.size || 0);
  const thumb = attachment?.thumb || null;
  const width = Number(attachment?.width || 0);
  const height = Number(attachment?.height || 0);
  const aspect = width > 0 && height > 0 ? width / height : 4 / 3;
  const thumbSide = 260;
  const previewH = Math.round(thumbSide / aspect);

  if (kind === 'image') {
    return (
      <div className="orb-attachment" data-orb-attachment="image">
        <button
          type="button"
          onClick={async () => {
            const url = await ensureBlob();
            if (!url) return;
            // Open full-size in a new tab (keeps things simple — we don't
            // want to ship a whole lightbox just for this).
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}
          }}
          className="group relative block overflow-hidden rounded-2xl bg-black/20 ring-1 ring-white/10"
          style={{ width: thumbSide, maxWidth: '100%', aspectRatio: `${width || 4} / ${height || 3}` }}
          disabled={unavailable}
        >
          {thumb ? (
            <img
              src={fullUrl || thumb}
              alt={name}
              className="h-full w-full object-cover transition-opacity duration-300"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/60">
              {unavailable ? 'нет превью' : 'Изображение'}
            </div>
          )}
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-5 w-5 animate-spin text-white/80" />
            </div>
          ) : null}
        </button>
        <div className={cx('mt-1 flex items-center justify-between gap-2 text-[11px]', mine ? 'text-white/70' : 'text-[rgb(var(--orb-muted-rgb))]')}>
          <span className="truncate">{name}</span>
          {!unavailable ? (
            <button
              type="button"
              onClick={download}
              className={cx(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
                mine ? 'hover:bg-white/10' : 'hover:bg-[rgb(var(--orb-accent-rgb))]/10'
              )}
              aria-label="Скачать"
              title="Скачать"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {size ? (
          <div className={cx('mt-0.5 text-[10px]', mine ? 'text-white/55' : 'text-[rgb(var(--orb-muted-rgb))]/80')}>
            {formatBytes(size)}
          </div>
        ) : null}
      </div>
    );
  }

  if (kind === 'video') {
    const togglePlay = async () => {
      const url = await ensureBlob();
      if (!url) return;
      const v = videoRef.current;
      if (!v) return;
      if (playing) {
        try { v.pause(); } catch (_) {}
        setPlaying(false);
      } else {
        try { await v.play(); setPlaying(true); } catch (_) {}
      }
    };
    return (
      <div className="orb-attachment" data-orb-attachment="video">
        <div
          className="relative overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10"
          style={{ width: thumbSide, maxWidth: '100%', aspectRatio: `${width || 16} / ${height || 9}` }}
        >
          {fullUrl ? (
            <video
              ref={videoRef}
              src={fullUrl}
              className="h-full w-full object-cover"
              controls
              playsInline
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          ) : thumb ? (
            <img src={thumb} alt={name} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/60">Видео</div>
          )}
          {!fullUrl ? (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
              aria-label="Воспроизвести"
              disabled={unavailable}
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 translate-x-0.5" />}
              </span>
            </button>
          ) : null}
        </div>
        <div className={cx('mt-1 flex items-center justify-between gap-2 text-[11px]', mine ? 'text-white/70' : 'text-[rgb(var(--orb-muted-rgb))]')}>
          <span className="truncate">{name}</span>
          {!unavailable ? (
            <button
              type="button"
              onClick={download}
              className={cx(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
                mine ? 'hover:bg-white/10' : 'hover:bg-[rgb(var(--orb-accent-rgb))]/10'
              )}
              aria-label="Скачать"
              title="Скачать"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {size ? (
          <div className={cx('mt-0.5 text-[10px]', mine ? 'text-white/55' : 'text-[rgb(var(--orb-muted-rgb))]/80')}>
            {formatBytes(size)}
          </div>
        ) : null}
      </div>
    );
  }

  // Generic file / document
  const Icon = getFileIcon({ mime: attachment?.mime, name });
  return (
    <div className="orb-attachment" data-orb-attachment="file">
      <button
        type="button"
        onClick={download}
        disabled={unavailable}
        className={cx(
          'flex w-full min-w-[220px] max-w-[320px] items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition-colors',
          mine
            ? 'bg-white/10 ring-white/15 hover:bg-white/15'
            : 'bg-[rgb(var(--orb-surface-rgb))]/60 ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/80',
          unavailable ? 'cursor-not-allowed opacity-60' : ''
        )}
      >
        <div className={cx(
          'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
          mine ? 'bg-white/15 text-white' : 'bg-[rgb(var(--orb-accent-rgb))]/15 text-[rgb(var(--orb-accent-rgb))]'
        )}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cx('truncate text-sm font-semibold', mine ? 'text-white' : 'text-[rgb(var(--orb-text-rgb))]')}>
            {name}
          </div>
          <div className={cx('text-[11px]', mine ? 'text-white/65' : 'text-[rgb(var(--orb-muted-rgb))]')}>
            {size ? formatBytes(size) : (attachment?.mime || 'файл')}
            {unavailable ? ' • недоступен' : ''}
          </div>
        </div>
        {!unavailable ? (
          <Download className={cx('h-4 w-4 shrink-0', mine ? 'text-white/70' : 'text-[rgb(var(--orb-muted-rgb))]')} />
        ) : null}
      </button>
    </div>
  );
}
