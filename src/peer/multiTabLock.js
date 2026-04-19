// Multi-tab guard: writes a token to localStorage every `refreshMs`; detects
// another live tab if the stored token differs AND is fresher than `staleMs`.
// Extracted from usePeer.js:969–1011 (behavior-preserving).
//
// Additionally, if the Web Locks API is available we hold an indefinite lock
// (keep-alive) so the browser doesn't freeze network connections on a hidden
// tab. Released automatically on stop().

import { STORAGE, safeJsonParse } from './helpers.js';

const REFRESH_MS = 2000;
const STALE_MS = 4500;

export class MultiTabLock {
  constructor(peerId, { onLost } = {}) {
    this.peerId = String(peerId || '');
    this.lockKey = `${STORAGE.peerLockPrefix}${this.peerId}`;
    this.token = Math.random().toString(36).slice(2);
    this.onLost = typeof onLost === 'function' ? onLost : () => {};
    this.interval = null;
    this.storageHandler = null;
    this.webLockAbort = null;
  }

  /**
   * Try to acquire the multi-tab lock. Returns `true` if we own it, `false`
   * if another fresh tab already holds it (caller should enter 'multitab' state).
   *
   * F5 / same-tab reload detection: `sessionStorage` survives page refresh
   * within the same browser tab but is NOT shared across tabs. If we find our
   * own peerId in sessionStorage, this is the same tab reloading — force-acquire
   * the lock regardless of what the old page load left in localStorage. This
   * eliminates the false "multitab" error on F5 that blocked reconnection.
   */
  acquire() {
    const SESSION_KEY = 'orbits_tab_peer';
    const isSameTabReload = (() => {
      try { return sessionStorage.getItem(SESSION_KEY) === this.peerId; }
      catch (_) { return false; }
    })();
    try { sessionStorage.setItem(SESSION_KEY, this.peerId); } catch (_) {}

    if (!isSameTabReload) {
      // Genuinely different tab — respect existing fresh lock.
      const existing = this.readLock();
      if (
        existing &&
        existing.token &&
        existing.token !== this.token &&
        Date.now() - Number(existing.ts || 0) < STALE_MS
      ) {
        return false;
      }
    }
    // else: same tab reload (F5) — skip stale check, force-acquire.
    this.writeLock();
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.writeLock(), REFRESH_MS);

    // If acquire() was ever called twice without release() in between, the
    // previous `storage` handler would leak to window because the ref was
    // just overwritten. Detach it first.
    if (this.storageHandler) {
      try { window.removeEventListener('storage', this.storageHandler); } catch (_) {}
      this.storageHandler = null;
    }
    this.storageHandler = (e) => {
      if (!e || e.key !== this.lockKey) return;
      const v = safeJsonParse(e.newValue, null);
      if (!v || v.token === this.token) return;
      if (Date.now() - Number(v.ts || 0) > STALE_MS) return;
      this.onLost();
    };
    try {
      window.addEventListener('storage', this.storageHandler);
    } catch (_) {
    }

    // Web Locks API — keep-alive for background tabs so the browser doesn't
    // freeze/kill the tab's network connections when it's not foreground.
    // Same double-acquire defence: abort any previous controller first.
    if (this.webLockAbort) {
      try { this.webLockAbort.abort(); } catch (_) {}
      this.webLockAbort = null;
    }
    if (typeof navigator !== 'undefined' && navigator.locks) {
      try {
        const abortCtrl = new AbortController();
        this.webLockAbort = abortCtrl;
        navigator.locks
          .request(
            `orbits-peer-keepalive-${this.peerId}`,
            { signal: abortCtrl.signal },
            () => new Promise(() => { /* never resolves — held until abort */ })
          )
          .catch(() => {});
      } catch (_) {
      }
    }
    return true;
  }

  /** Call from visibilitychange handler so hidden tabs refresh the lock quickly. */
  touch() {
    this.writeLock();
  }

  /** Release the lock, stop refreshing, and remove all listeners. */
  release() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.storageHandler) {
      try {
        window.removeEventListener('storage', this.storageHandler);
      } catch (_) {
      }
      this.storageHandler = null;
    }
    if (this.webLockAbort) {
      try { this.webLockAbort.abort(); } catch (_) {}
      this.webLockAbort = null;
    }
    try {
      const cur = this.readLock();
      if (cur && cur.token === this.token) localStorage.removeItem(this.lockKey);
    } catch (_) {
    }
  }

  writeLock() {
    try {
      localStorage.setItem(this.lockKey, JSON.stringify({ token: this.token, ts: Date.now() }));
    } catch (_) {
    }
  }

  readLock() {
    try {
      return safeJsonParse(localStorage.getItem(this.lockKey), null);
    } catch (_) {
      return null;
    }
  }
}
