import { describe, expect, it } from 'vitest';
import { cx, formatSize, formatDuration, formatLastSeen, safeAvatarDataUrl, safeJsonParse } from '../common.js';

describe('cx', () => {
  it('joins truthy class names', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out falsy values', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns empty string when all falsy', () => {
    expect(cx(false, null, undefined)).toBe('');
  });

  it('works with no arguments', () => {
    expect(cx()).toBe('');
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1073741824)).toBe('1.0 GB');
  });

  it('returns 0 B for zero/null/undefined', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(null)).toBe('0 B');
    expect(formatSize(undefined)).toBe('0 B');
  });

  it('returns 0 B for negative', () => {
    expect(formatSize(-100)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('00:00.0');
  });

  it('formats seconds with tenths', () => {
    expect(formatDuration(5.5)).toBe('00:05.5');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02:05.0');
  });

  it('formats whole seconds at boundary', () => {
    expect(formatDuration(60)).toBe('01:00.0');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatDuration(61)).toBe('01:01.0');
  });
});

describe('safeAvatarDataUrl', () => {
  it('accepts PNG data URLs with base64 encoding', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(safeAvatarDataUrl(url)).toBe(url);
  });

  it('accepts JPEG, WEBP, GIF', () => {
    expect(safeAvatarDataUrl('data:image/jpeg;base64,/9j/4A==')).not.toBeNull();
    expect(safeAvatarDataUrl('data:image/webp;base64,UklGR==')).not.toBeNull();
    expect(safeAvatarDataUrl('data:image/gif;base64,R0lGOD==')).not.toBeNull();
  });

  it('rejects SVG data URLs (XSS vector)', () => {
    expect(safeAvatarDataUrl('data:image/svg+xml;utf8,<svg/>')).toBeNull();
    expect(safeAvatarDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
  });

  it('rejects non-image data URLs', () => {
    expect(safeAvatarDataUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeAvatarDataUrl('data:application/javascript,alert(1)')).toBeNull();
  });

  it('rejects http(s) URLs', () => {
    expect(safeAvatarDataUrl('https://attacker.example/pixel.png')).toBeNull();
    expect(safeAvatarDataUrl('http://attacker.example/pixel.png')).toBeNull();
  });

  it('rejects oversized payloads', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(600 * 1024);
    expect(safeAvatarDataUrl(huge)).toBeNull();
  });

  it('honors a custom size limit', () => {
    const mid = 'data:image/png;base64,' + 'A'.repeat(300 * 1024);
    expect(safeAvatarDataUrl(mid, { maxBytes: 128 * 1024 })).toBeNull();
    expect(safeAvatarDataUrl(mid, { maxBytes: 1024 * 1024 })).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeAvatarDataUrl(null)).toBeNull();
    expect(safeAvatarDataUrl(undefined)).toBeNull();
    expect(safeAvatarDataUrl(42)).toBeNull();
    expect(safeAvatarDataUrl({})).toBeNull();
  });

  it('rejects trailing or spoofed prefixes', () => {
    expect(safeAvatarDataUrl('data:image/pngextra,xxx')).toBeNull();
    expect(safeAvatarDataUrl(' data:image/png;base64,xxx')).toBeNull();
  });

  it('is case-insensitive on the MIME prefix', () => {
    expect(safeAvatarDataUrl('DATA:IMAGE/PNG;base64,iVBORw0KGgo=')).not.toBeNull();
  });
});

describe('formatLastSeen', () => {
  const NOW = 1_700_000_000_000;

  it('returns empty string for missing timestamp', () => {
    expect(formatLastSeen(0, NOW)).toBe('');
    expect(formatLastSeen(null, NOW)).toBe('');
    expect(formatLastSeen(undefined, NOW)).toBe('');
  });

  it('shows "just now" for very recent', () => {
    expect(formatLastSeen(NOW - 10_000, NOW)).toBe('был(а) только что');
  });

  it('shows minutes for <1h', () => {
    expect(formatLastSeen(NOW - 5 * 60_000, NOW)).toBe('был(а) 5 мин назад');
  });

  it('shows hours for <1d', () => {
    expect(formatLastSeen(NOW - 3 * 60 * 60_000, NOW)).toBe('был(а) 3 ч назад');
  });

  it('shows "yesterday" for 1-2 days', () => {
    expect(formatLastSeen(NOW - 30 * 60 * 60_000, NOW)).toBe('был(а) вчера');
  });

  it('shows days for <1 week', () => {
    expect(formatLastSeen(NOW - 4 * 24 * 60 * 60_000, NOW)).toBe('был(а) 4 дн назад');
  });

  it('falls back to absolute date for >1 week', () => {
    const out = formatLastSeen(NOW - 30 * 24 * 60 * 60_000, NOW);
    expect(out.startsWith('был(а) ')).toBe(true);
    expect(out.length).toBeGreaterThan('был(а) '.length);
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON objects', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('parses valid JSON arrays', () => {
    expect(safeJsonParse('[1,2,3]', null)).toEqual([1, 2, 3]);
  });

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, 'fb')).toBe('fb');
  });

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse(undefined, 'fb')).toBe('fb');
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('{not json}', 'fb')).toBe('fb');
  });

  it('returns fallback when parsed value is null', () => {
    expect(safeJsonParse('null', 'fb')).toBe('fb');
  });

  it('preserves falsy scalars that are not null', () => {
    expect(safeJsonParse('0', 'fb')).toBe(0);
    expect(safeJsonParse('false', 'fb')).toBe(false);
    expect(safeJsonParse('""', 'fb')).toBe('');
  });
});
