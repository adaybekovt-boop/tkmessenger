// Lightweight event emitter shared across framework-agnostic managers.
//
// Replaces duplicated MicroEmitter classes in CallManager and DropManager.
// Same API surface: on(event, fn) → unsub, off(event, fn), emit(event, data), clear().

export class Emitter {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} event
   * @param {(payload: any) => void} fn
   * @returns {() => void}
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  /** Unsubscribe a previously attached listener. */
  off(event, fn) {
    this.#listeners.get(event)?.delete(fn);
  }

  /** Dispatch an event with a payload. Listener errors are swallowed. */
  emit(event, payload) {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (_) {}
    }
  }

  /** Remove all listeners. Called on dispose. */
  clear() {
    this.#listeners.clear();
  }
}
