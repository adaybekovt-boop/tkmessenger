import { describe, expect, it, vi, beforeEach } from 'vitest';
import { reportError, registerSink, formatReportForClipboard } from '../errorReporter.js';

describe('errorReporter', () => {
  beforeEach(() => {
    // Silence the console.error spam from reportError during these tests so
    // the vitest output stays clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('delivers the payload to every registered sink', () => {
    const sinkA = vi.fn();
    const sinkB = vi.fn();
    const unsubA = registerSink(sinkA);
    const unsubB = registerSink(sinkB);

    const err = new Error('boom');
    const payload = reportError(err, { source: 'test' });

    expect(sinkA).toHaveBeenCalledTimes(1);
    expect(sinkB).toHaveBeenCalledTimes(1);
    expect(payload.message).toBe('boom');
    expect(payload.source).toBe('test');
    expect(typeof payload.timestamp).toBe('number');

    unsubA();
    unsubB();
  });

  it('stops calling a sink after unregister', () => {
    const sink = vi.fn();
    const unsub = registerSink(sink);
    reportError(new Error('first'));
    expect(sink).toHaveBeenCalledTimes(1);
    unsub();
    reportError(new Error('second'));
    expect(sink).toHaveBeenCalledTimes(1); // no second call
  });

  it('survives a sink that throws', () => {
    const bad = vi.fn(() => { throw new Error('sink exploded'); });
    const good = vi.fn();
    const u1 = registerSink(bad);
    const u2 = registerSink(good);

    expect(() => reportError(new Error('test'))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    u1(); u2();
  });

  it('accepts non-Error inputs without crashing', () => {
    const sink = vi.fn();
    const u = registerSink(sink);
    const payload = reportError('plain string');
    expect(payload.message).toBe('plain string');
    expect(sink).toHaveBeenCalled();
    u();
  });

  it('ignores non-function sink registrations', () => {
    const noop = registerSink(null);
    expect(typeof noop).toBe('function');
    expect(() => noop()).not.toThrow();
  });

  describe('formatReportForClipboard', () => {
    it('includes message and stack', () => {
      const out = formatReportForClipboard({
        timestamp: 0,
        message: 'Something failed',
        stack: 'Error: Something failed\n  at foo',
        url: 'http://localhost/',
        userAgent: 'vitest',
      });
      expect(out).toContain('Something failed');
      expect(out).toContain('at foo');
      expect(out).toContain('vitest');
    });

    it('returns empty for null payload', () => {
      expect(formatReportForClipboard(null)).toBe('');
    });

    it('handles missing stack gracefully', () => {
      const out = formatReportForClipboard({
        timestamp: 0,
        message: 'No stack',
      });
      expect(out).toContain('No stack');
      expect(out).not.toContain('Stack:');
    });
  });
});
