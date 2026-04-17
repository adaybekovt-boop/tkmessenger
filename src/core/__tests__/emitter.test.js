import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../emitter.js';

describe('Emitter', () => {
  it('calls listener when event is emitted', () => {
    const em = new Emitter();
    const fn = vi.fn();
    em.on('ping', fn);
    em.emit('ping', 42);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it('returns an unsub function from on()', () => {
    const em = new Emitter();
    const fn = vi.fn();
    const unsub = em.on('x', fn);
    unsub();
    em.emit('x', 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() removes a specific listener', () => {
    const em = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    em.on('e', a);
    em.on('e', b);
    em.off('e', a);
    em.emit('e', 'data');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('data');
  });

  it('supports multiple listeners on the same event', () => {
    const em = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    em.on('e', a);
    em.on('e', b);
    em.emit('e', 'v');
    expect(a).toHaveBeenCalledWith('v');
    expect(b).toHaveBeenCalledWith('v');
  });

  it('does not throw when emitting an event with no listeners', () => {
    const em = new Emitter();
    expect(() => em.emit('nope', 123)).not.toThrow();
  });

  it('swallows listener errors', () => {
    const em = new Emitter();
    const bad = () => { throw new Error('boom'); };
    const good = vi.fn();
    em.on('e', bad);
    em.on('e', good);
    em.emit('e', 'ok');
    expect(good).toHaveBeenCalledWith('ok');
  });

  it('clear() removes all listeners', () => {
    const em = new Emitter();
    const fn = vi.fn();
    em.on('a', fn);
    em.on('b', fn);
    em.clear();
    em.emit('a', 1);
    em.emit('b', 2);
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() is safe for unknown event', () => {
    const em = new Emitter();
    expect(() => em.off('unknown', () => {})).not.toThrow();
  });
});
