import { describe, expect, it } from 'vitest';
import { cx, formatSize, formatDuration } from '../common.js';

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
