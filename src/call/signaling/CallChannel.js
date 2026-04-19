// CallChannel — the only module that touches the PeerJS MediaConnection
// object directly. Wraps `peer.call()` / `call.answer()` and normalises
// their event surface so CallManager sees simple `onStream/onClose/onError`
// callbacks regardless of transport.
//
// Keeping PeerJS knowledge in one place means that if we ever swap out the
// signaling library (or move to a custom WebRTC stack), only this file
// changes — the state machine above stays intact.

export class CallChannel {
  /**
   * Create an outgoing call channel.
   *
   * @param {object} peer            — live PeerJS instance
   * @param {string} remoteId        — peer id to dial
   * @param {MediaStream} localStream
   * @returns {CallChannel}
   */
  static outgoing(peer, remoteId, localStream) {
    if (!peer || typeof peer.call !== 'function') {
      throw new Error('CallChannel.outgoing: invalid peer');
    }
    const call = peer.call(remoteId, localStream);
    return new CallChannel(call, { direction: 'outgoing' });
  }

  /**
   * Wrap an incoming PeerJS MediaConnection.
   *
   * @param {object} call
   * @returns {CallChannel}
   */
  static incoming(call) {
    return new CallChannel(call, { direction: 'incoming' });
  }

  constructor(call, { direction }) {
    /** @private */ this._call = call;
    /** @readonly */ this.direction = direction;
    /** @readonly */ this.remoteId = String(call?.peer || '');
    /** @private */ this._handlers = { stream: null, close: null, error: null };
    /** @private */ this._closed = false;
    this._wire();
  }

  /** Underlying PeerJS call (exposed only for TrackReplacer → getSenders). */
  get raw() { return this._call; }

  on(event, handler) {
    if (event in this._handlers) {
      this._handlers[event] = handler;
    }
    return this;
  }

  /**
   * Answer an incoming call with our local media. No-op on outgoing channels.
   * @param {MediaStream} localStream
   */
  answer(localStream) {
    if (this.direction !== 'incoming') return;
    try { this._call.answer(localStream); } catch (_) {}
  }

  /** Close the channel. Idempotent — safe to call from any teardown path. */
  close() {
    if (this._closed) return;
    this._closed = true;
    try { this._call.close(); } catch (_) {}
    // Drop handlers so late 'stream' / 'error' events from PeerJS don't fire
    // after teardown. _closed guards `close`, but PeerJS can still emit stream
    // or error after .close() on some browsers — nulling handlers short-circuits
    // them and releases the closure over CallManager.
    this._handlers = { stream: null, close: null, error: null };
  }

  _wire() {
    const call = this._call;
    if (!call || typeof call.on !== 'function') return;

    call.on('stream', (remoteStream) => {
      if (this._closed) return;
      this._handlers.stream?.(remoteStream);
    });
    call.on('close', () => {
      if (this._closed) return;
      this._closed = true;
      const onClose = this._handlers.close;
      this._handlers = { stream: null, close: null, error: null };
      onClose?.();
    });
    call.on('error', (err) => {
      if (this._closed) return;
      this._handlers.error?.(err);
    });
  }
}
