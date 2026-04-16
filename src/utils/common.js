// Shared utility functions used across multiple components.
// Extracted to eliminate duplication (was copy-pasted in 9+ files).

/** Conditional className joiner — filters falsy values. */
export function cx(...v) {
  return v.filter(Boolean).join(' ');
}

/** Format byte count to human-readable string (B / KB / MB / GB). */
export function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const val = bytes / (1 << (i * 10));
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format a unix timestamp (ms) to locale time string. */
export function formatTimestamp(ts, showSeconds = false) {
  if (!ts) return '\u2014';
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', showSeconds
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
}

/** Format seconds to mm:ss.t (for voice recorder / call duration). */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const tenths = Math.floor((seconds - s) * 10);
  return `${mm}:${ss}.${tenths}`;
}
