// PeerConnectionManager — owns the PeerJS lifecycle: instance creation,
// signaling host rotation, reconnect backoff, network / visibility / Web
// Locks handlers, and multi-tab lock. Extracted from the mount `useEffect`
// in usePeer.js (behavior-preserving).
//
// Consumers pass a `callbacks` bag with the React setters they want fired.
// The manager does not touch React state directly.

import { normalizePeerId, mapPeerError } from './helpers.js';
import { MultiTabLock } from './multiTabLock.js';
import {
  buildSignalingHosts,
  canRotateHosts,
  createPeerInstance,
  computeBackoffMs
} from './signaling.js';

export class PeerConnectionManager {
  /**
   * @param {object} cfg
   * @param {string} cfg.desiredPeerId
   * @param {object} cfg.env           — import.meta.env subset
   * @param {object} cfg.callbacks     — React setters + observers
   * @param {{current: boolean}} [cfg.isDropInProgressRef] — when true, skip reconnect/disconnect
   *
   * `callbacks` shape:
   *   setStatus(s), setError(e), setPeerId(id), setSignalingHost(host),
   *   onOpen(id, peer), onConnection(conn), onCall(call), onError(err),
   *   onMultiTabLost(), onBeforeDestroy(peer)
   */
  constructor({ desiredPeerId, env, callbacks, isDropInProgressRef }) {
    this.desiredPeerId = normalizePeerId(desiredPeerId);
    this.env = env || {};
    this.cb = callbacks || {};
    this._isDropInProgressRef = isDropInProgressRef || { current: false };
    this.peer = null;
    this.multiTabLock = null;
    this.signalingHosts = null;
    this.signalingIndex = 0;
    this.reconnectTimeout = null;
    this.reconnectAttempt = 0;
    this.networkErrStreak = 0;
    this.lastNetworkErrAt = 0;
    this._swapping = false;
    this._handlers = null;
    this._listeners = {
      online: null,
      offline: null,
      netChange: null,
      visibility: null
    };
  }

  /** Current peer id (best-effort — stays in sync with onOpen callback). */
  get currentPeerId() {
    return this.peer?.id || this.desiredPeerId;
  }

  /** Build the handler set wired to `this.peer`. Idempotent per start cycle. */
  _buildHandlers() {
    const self = this;

    const scheduleReconnect = (reason) => {
      // Never reconnect while a file transfer is active — this would
      // destroy the DataChannel and abort the transfer.
      if (self._isDropInProgressRef.current) return;
      // Don't reconnect if the peer is still open — transient errors
      // (listAllPeers failures, etc.) should not trigger reconnect.
      if (self.peer && self.peer.open && reason !== 'offline') return;
      if (self.reconnectTimeout) clearTimeout(self.reconnectTimeout);
      const attempt = self.reconnectAttempt;
      self.reconnectAttempt = Math.min(10, attempt + 1);
      const delay = computeBackoffMs(attempt);
      self.cb.setStatus?.(reason === 'offline' ? 'disconnected' : 'connecting');
      self.reconnectTimeout = setTimeout(() => {
        // Re-check: a file transfer may have started between schedule and fire.
        if (self._isDropInProgressRef.current) return;
        const cur = self.peer;
        if (!cur || cur.destroyed) return;
        // Peer auto-recovered (e.g. after a transient listAllPeers error)
        if (cur.open) {
          self.reconnectAttempt = 0;
          self.cb.setStatus?.('connected');
          self.cb.setError?.(null);
          return;
        }
        try { cur.reconnect(); } catch (_) {}
      }, delay);
    };

    const onOpen = (id) => {
      if (self._initialConnectTimer) {
        clearTimeout(self._initialConnectTimer);
        self._initialConnectTimer = null;
      }
      self.reconnectAttempt = 0;
      self.networkErrStreak = 0;
      self.lastNetworkErrAt = 0;
      self.cb.setPeerId?.(normalizePeerId(id));
      self.cb.setStatus?.('connected');
      self.cb.setError?.(null);
      self.cb.onOpen?.(normalizePeerId(id), self.peer);
    };

    const onDisconnected = () => scheduleReconnect('disconnected');
    const onClose = () => self.cb.setStatus?.('disconnected');

    const onError = (err) => {
      // ── unavailable-id: silent fast-retry (F5 zombie recovery) ─────
      // After page refresh, the PeerJS signaling server still holds
      // the old WebSocket for 10-60s (heartbeat timeout). New tab gets
      // "unavailable-id" until the zombie dies. Strategy:
      //   - First 8 attempts (~12-16s): fast silent retry, no error shown
      //   - After that: show soft "reconnecting" message, keep retrying
      //   - The server WILL release the ID eventually; just wait it out
      if (err?.type === 'unavailable-id') {
        if (self.reconnectTimeout) clearTimeout(self.reconnectTimeout);
        const attempt = self.reconnectAttempt;
        // Cap at 15 so the delay plateaus instead of growing indefinitely.
        self.reconnectAttempt = Math.min(15, attempt + 1);

        // Fast phase: 1.5-2.5s interval for first ~16s
        // Slow phase: fixed 5s after that (don't keep incrementing)
        const delay = attempt < 8
          ? 1500 + Math.floor(Math.random() * 1000)
          : 5000;

        self.cb.setStatus?.('connecting');

        if (attempt < 8) {
          // Silent retry — don't scare the user with red banner.
          // This is the normal F5 flow, not an actual error.
          self.cb.setError?.(null);
        } else {
          // Taking longer than expected — show gentle message
          self.cb.setError?.('Переподключаемся к серверу…');
        }

        self.reconnectTimeout = setTimeout(() => {
          self.swapPeerId(self.currentPeerId || self.desiredPeerId);
        }, delay);
        return;
      }

      // ── Generic error handling ────────────────────────────────────
      // Suppress transient errors when peer is still functional — these come
      // from listAllPeers() / connect() failures, not actual connection loss.
      const transient = err?.type === 'server-error' || err?.type === 'network'
        || err?.type === 'peer-unavailable' || err?.type === 'socket-error';
      if (transient && self.peer && self.peer.open) {
        // Don't show in UI — peer is working fine
        self.cb.onError?.(err);
      } else {
        self.cb.setError?.(mapPeerError(err));
        self.cb.onError?.(err);
      }
      const t = Date.now();
      if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
        // Skip reconnect logic if the peer is still open and functional —
        // these errors come from listAllPeers()/connect(), not real disconnects.
        if (self.peer && self.peer.open) return;
        const delta = t - (self.lastNetworkErrAt || 0);
        self.lastNetworkErrAt = t;
        self.networkErrStreak = delta < 12000 ? self.networkErrStreak + 1 : 1;
        if (canRotateHosts(self.env, self.signalingHosts) && self.networkErrStreak >= 2) {
          self.networkErrStreak = 0;
          self.signalingIndex = (self.signalingIndex + 1) % self.signalingHosts.length;
          const nextHost = self.signalingHosts[self.signalingIndex] || '';
          self.cb.setSignalingHost?.(nextHost);
          self.cb.setStatus?.('connecting');
          self.swapPeerId(self.currentPeerId);
          return;
        }
        scheduleReconnect('error');
      }
    };

    const onConnection = (conn) => {
      self.cb.onConnection?.(conn);
    };

    const onCall = (call) => {
      self.cb.onCall?.(call);
    };

    return { onOpen, onDisconnected, onClose, onError, onConnection, onCall, scheduleReconnect };
  }

  _attachHandlers(peer, h) {
    peer.on('open', h.onOpen);
    peer.on('disconnected', h.onDisconnected);
    peer.on('close', h.onClose);
    peer.on('error', h.onError);
    peer.on('connection', h.onConnection);
    peer.on('call', h.onCall);
  }

  _detachHandlers(peer, h) {
    try {
      peer.off('open', h.onOpen);
      peer.off('disconnected', h.onDisconnected);
      peer.off('close', h.onClose);
      peer.off('error', h.onError);
      peer.off('connection', h.onConnection);
      peer.off('call', h.onCall);
    } catch (_) {
    }
  }

  _createPeerNow(id) {
    const host = this.signalingHosts?.[this.signalingIndex];
    return createPeerInstance({ id, host, env: this.env });
  }

  /**
   * Destroy current peer and recreate under a new id. Used for host rotation
   * and `unavailable-id` recovery.
   */
  swapPeerId(nextId) {
    if (this._swapping) return;
    if (this._isDropInProgressRef.current) return;
    this._swapping = true;
    const oldPeer = this.peer;
    const h = this._handlers;
    if (oldPeer && h) this._detachHandlers(oldPeer, h);
    try { oldPeer?.destroy(); } catch (_) {}

    const np = this._createPeerNow(nextId);
    this.peer = np;
    if (h) this._attachHandlers(np, h);
    this._swapping = false;
  }

  /** Trigger a reconnect on the current peer (used by network-change path). */
  reconnectNow() {
    const p = this.peer;
    if (!p || p.destroyed) return;
    try { p.reconnect(); } catch (_) {}
  }

  /**
   * Start the PeerJS pipeline. Returns the initial peer instance, or `null`
   * if a multi-tab lock conflict was detected (caller should set
   * `status=multitab`).
   */
  start() {
    if (!this.signalingHosts) {
      this.signalingHosts = buildSignalingHosts(this.env);
      this.signalingIndex = 0;
    }
    const currentHost = this.signalingHosts[this.signalingIndex] || '';
    this.cb.setSignalingHost?.(this.env.VITE_PEER_SERVER ? String(this.env.VITE_PEER_SERVER) : currentHost);

    this.multiTabLock = new MultiTabLock(this.desiredPeerId, {
      onLost: () => {
        this.cb.setStatus?.('multitab');
        this.cb.setError?.('Открыта другая вкладка с этим Peer ID');
        try { this.peer?.destroy(); } catch (_) {}
        this.peer = null;
        this.cb.onMultiTabLost?.();
      }
    });
    if (!this.multiTabLock.acquire()) {
      this.cb.setStatus?.('multitab');
      this.cb.setError?.('Открыта другая вкладка с этим Peer ID');
      return null;
    }

    this.cb.setStatus?.('connecting');
    this.cb.setError?.(null);
    this.reconnectAttempt = 0;

    this._handlers = this._buildHandlers();
    const peer = this._createPeerNow(this.desiredPeerId);
    this.peer = peer;
    this._attachHandlers(peer, this._handlers);

    // Initial connection timeout: if the signaling server doesn't respond
    // within 30s, surface an error instead of spinning "connecting" forever.
    this._initialConnectTimer = setTimeout(() => {
      this._initialConnectTimer = null;
      if (this.peer && !this.peer.open && !this.peer.destroyed) {
        this.cb.setStatus?.('disconnected');
        this.cb.setError?.('Не удалось подключиться к серверу — проверьте интернет');
      }
    }, 30000);

    // Network + visibility listeners.
    const onOnline = () => {
      if (this._isDropInProgressRef.current) return;
      const p = this.peer;
      if (p && !p.destroyed && !p.disconnected && p.open) return;
      this.cb.setStatus?.('connecting');
      this.reconnectNow();
    };
    const onOffline = () => {
      if (this._isDropInProgressRef.current) return;
      this.cb.setStatus?.('disconnected');
      this._handlers.scheduleReconnect('offline');
    };
    const onNetChange = () => {
      if (this._isDropInProgressRef.current) return;
      const cur = this.peer;
      if (cur && !cur.destroyed && !cur.disconnected && cur.open) return;
      this.cb.setStatus?.('connecting');
      this.cb.onBeforeDestroy?.(this.peer);
      if (cur && !cur.destroyed) {
        try { cur.disconnect(); } catch (_) {}
        try { cur.reconnect(); } catch (_) {}
      }
    };
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        this.multiTabLock?.touch();
        return;
      }
      if (this._isDropInProgressRef.current) return;
      const p = this.peer;
      if (p && !p.destroyed && !p.disconnected && p.open) {
        // Already connected — just refresh heartbeats, don't flash "connecting".
        this.cb.onVisible?.();
        return;
      }
      this.cb.setStatus?.('connecting');
      this.reconnectNow();
      this.cb.onVisible?.();
    };

    // ── Graceful shutdown on page refresh / close ─────────────
    // Without this, F5 leaves the old PeerJS socket alive on the
    // signaling server, and the new tab gets "Peer ID taken" error
    // until the zombie connection times out (~30s).
    const onBeforeUnload = () => {
      try { this.multiTabLock?.release(); } catch (_) {}
      try { this.peer?.destroy(); } catch (_) {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const net = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (net && typeof net.addEventListener === 'function') {
      net.addEventListener('change', onNetChange);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    this._listeners = { online: onOnline, offline: onOffline, netChange: onNetChange, visibility: onVisibility, beforeUnload: onBeforeUnload, net };
    return peer;
  }

  /** Full teardown: clear timers, remove listeners, release lock, destroy peer. */
  stop() {
    if (this._initialConnectTimer) {
      clearTimeout(this._initialConnectTimer);
      this._initialConnectTimer = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this._clearErrorTimer) {
      clearTimeout(this._clearErrorTimer);
      this._clearErrorTimer = null;
    }
    try { this.multiTabLock?.release(); } catch (_) {}
    this.multiTabLock = null;

    const l = this._listeners;
    try { window.removeEventListener('online', l.online); } catch (_) {}
    try { window.removeEventListener('offline', l.offline); } catch (_) {}
    if (l.net && typeof l.net.removeEventListener === 'function') {
      try { l.net.removeEventListener('change', l.netChange); } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      try { document.removeEventListener('visibilitychange', l.visibility); } catch (_) {}
    }
    try { window.removeEventListener('beforeunload', l.beforeUnload); } catch (_) {}
    this._listeners = { online: null, offline: null, netChange: null, visibility: null, beforeUnload: null };

    const peer = this.peer;
    const h = this._handlers;
    if (peer && h) this._detachHandlers(peer, h);
    try { peer?.destroy(); } catch (_) {}
    this.peer = null;
    this._handlers = null;
  }
}
