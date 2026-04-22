// Shared utility functions used across multiple components.
// Extracted to eliminate duplication (was copy-pasted in 9+ files).

/** Conditional className joiner — filters falsy values. */
export function cx(...v) {
  return v.filter(Boolean).join(' ');
}

/**
 * Parse JSON from untrusted storage without throwing. Returns `fallback` for
 * null/undefined input, invalid JSON, or a parsed `null`. Callers should pass
 * the expected shape as `fallback` (e.g. `{}` or `[]`) so downstream code
 * doesn't need to guard against parse failure.
 */
export function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed == null) return fallback;
    return parsed;
  } catch (_) {
    return fallback;
  }
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

/**
 * Format a unix timestamp (ms) as a "last seen" label. Fuzzy, localised (ru).
 * Returns an empty string for 0/undefined so callers can fall back to a
 * generic "offline" label when we have no timestamp.
 */
export function formatLastSeen(ts, now = Date.now()) {
  const t = Number(ts || 0);
  if (!t) return '';
  const diff = Math.max(0, now - t);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (diff < MIN) return 'был(а) только что';
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return `был(а) ${m} мин назад`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `был(а) ${h} ч назад`;
  }
  if (diff < 2 * DAY) return 'был(а) вчера';
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `был(а) ${d} дн назад`;
  }
  // Fall back to an absolute date for anything older than a week.
  try {
    return `был(а) ${new Date(t).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}`;
  } catch (_) {
    return '';
  }
}

/**
 * Peer display-name resolution. In the chat list we never want to show a
 * raw `ORBITS-XXXXXX` id — the user should see the contact's profile
 * nickname (or the one they set locally when adding the contact). Only
 * when nothing at all is known, we fall back to a short, friendly label
 * derived from the id tail (e.g. "Контакт •A5C3") so the row still has a
 * readable name while the remote profile is still being fetched.
 *
 * Arguments are intentionally loose — callers can pass any subset they
 * have access to and the function picks the best one.
 */
export function peerDisplayName({ profile, peer, id } = {}) {
  const fromProfile = (profile?.displayName || '').trim();
  if (fromProfile) return fromProfile;
  const fromPeer = (peer?.displayName || '').trim();
  if (fromPeer) return fromPeer;
  return shortPeerLabel(peer?.id || id || '');
}

/** Produce a friendly short label from a peer id (never raw ORBITS-XXXXXX). */
export function shortPeerLabel(rawId) {
  const s = String(rawId || '').trim();
  if (!s) return 'Контакт';
  // Keep the last 4 characters — that's what the user actually
  // recognises when cross-checking fingerprints. Drop the
  // ORBITS- prefix entirely.
  const tail = s.replace(/^orbits[-_:]?/i, '').slice(-4).toUpperCase();
  return tail ? `Контакт •${tail}` : 'Контакт';
}

/** Format seconds to mm:ss.t (for voice recorder / call duration). */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const tenths = Math.floor((seconds - s) * 10);
  return `${mm}:${ss}.${tenths}`;
}

// Allowed raster image MIME types for data-URL avatars. SVG is intentionally
// excluded: an SVG served as `<img src="data:image/svg+xml,...">` can pull in
// external resources (`<image href>`), leak referer/cookies, and in some
// embedding contexts execute scripts on load. Re-encoding through canvas
// defeats that, but we'd rather never accept SVG from a remote peer.
const SAFE_AVATAR_PREFIXES = [
  'data:image/png;',
  'data:image/png,',
  'data:image/jpeg;',
  'data:image/jpeg,',
  'data:image/webp;',
  'data:image/webp,',
  'data:image/gif;',
  'data:image/gif,'
];

/**
 * Validate an untrusted avatar data URL before we render it via `<img src>`.
 * Rejects: non-strings, non-data-URLs, SVG / other unsafe MIME types, and
 * oversized payloads. Returns the URL unchanged on success, `null` on any
 * failure. Callers should treat `null` as "no avatar".
 */
export function safeAvatarDataUrl(raw, { maxBytes = 512 * 1024 } = {}) {
  if (typeof raw !== 'string') return null;
  if (raw.length > maxBytes) return null;
  const lower = raw.slice(0, 32).toLowerCase();
  for (const prefix of SAFE_AVATAR_PREFIXES) {
    if (lower.startsWith(prefix)) return raw;
  }
  return null;
}
