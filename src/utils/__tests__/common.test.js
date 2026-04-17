import { describe, expect, it } from 'vitest';
import { cx, formatSize, formatDuration, safeAvatarDataUrl } from '../common.js';

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
