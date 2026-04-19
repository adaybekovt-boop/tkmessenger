// BeaconPublisher — periodically broadcasts a `drop-beacon` packet on every
// currently-open ephemeral channel.
//
// Why ephemeral: beacons are lossy-by-design — if a peer misses one, the
// next one arrives 5 seconds later. There's no point wasting Double-Ratchet
// cycles encrypting "I'm online" pings.
//
// The actual broadcast implementation lives in usePeer (it's the only module
// that holds connsRef). This class only owns the *schedule*.

const DEFAULT_INTERVAL_MS = 5000;

export class BeaconPublisher {
  /**
   * @param {object} cfg
   * @param {(packet: object) => void} cfg.broadcast
   *     Fan-out to all connected ephemeral channels. Errors are swallowed
   *     by the caller — one bad peer must not stop the tick.
   * @param {() => {peerId: string, nickname: string}} cfg.getIdentity
   * @param {number} [cfg.intervalMs]
   */
  constructor({ broadcast, getIdentity, intervalMs = DEFAULT_INTERVAL_MS }) {
    this._broadcast = broadcast || (() => {});
    this._getIdentity = getIdentity || (() => ({ peerId: '', nickname: '' }));
    this._intervalMs = intervalMs;
    this._timer = null;
    this._active = false;
  }

  start() {
    if (this._active) return;
    this._active = true;
    // Send one immediately so other peers see us without waiting a tick.
    this._tick();
    this._timer = setInterval(() => this._tick(), this._intervalMs);
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  get active() {
    return this._active;
  }

  _tick() {
    const ident = this._getIdentity() || {};
    const peerId = String(ident.peerId || '');
    if (!peerId) return;

    const packet = {
      type: 'drop-beacon',
      peerId,
      nickname: String(ident.nickname || ''),
      ts: Date.now()
    };

    try {
      this._broadcast(packet);
    } catch (_) {
      // Transport errors are recoverable at the tick granularity.
    }
  }
}
