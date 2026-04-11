// BeaconListener — consumes `drop-beacon` + `drop-beacon-ack` packets and
// maintains the in-memory presence map.
//
// Protocol:
//   1. A peer sends `drop-beacon { peerId, nickname, ts }`.
//   2. We record/refresh their entry and respond with
//      `drop-beacon-ack { echoTs, ts }`.
//   3. When their ack comes back to us (they initiated), we compute
//      RTT = now - echoTs and store it on their entry.
//
// A sweep timer drops entries we haven't seen for STALE_AFTER_MS so the mini
// radar doesn't show ghosts after someone closes their Drop tab.

const STALE_AFTER_MS = 15_000;
const SWEEP_INTERVAL_MS = 2_500;

export class BeaconListener {
  /**
   * @param {object} cfg
   * @param {(peerId: string, packet: object) => boolean} cfg.sendTo
   *     Unicast send used to reply with beacon acks.
   * @param {() => void} cfg.onChange
   *     Called whenever the presence map mutates (add / update / sweep).
   */
  constructor({ sendTo, onChange }) {
    this._sendTo = sendTo || (() => false);
    this._onChange = onChange || (() => {});
    /** @type {Map<string, {id: string, nickname: string, rttMs: number|null, lastSeenAt: number}>} */
    this._byId = new Map();
    this._sweepTimer = null;
  }

  start() {
    if (this._sweepTimer) return;
    this._sweepTimer = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
  }

  stop() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
    if (this._byId.size) {
      this._byId.clear();
      this._emit();
    }
  }

  /** Process an inbound `drop-beacon` packet from `remoteId`. */
  handleBeacon(remoteId, packet) {
    const existing = this._byId.get(remoteId) || {};
    this._byId.set(remoteId, {
      id: remoteId,
      nickname: String(packet?.nickname || existing.nickname || ''),
      rttMs: existing.rttMs ?? null,
      lastSeenAt: Date.now()
    });
    this._emit();

    // Echo back so the sender can measure RTT.
    const echoTs = Number(packet?.ts) || 0;
    try {
      this._sendTo(remoteId, {
        type: 'drop-beacon-ack',
        echoTs,
        ts: Date.now()
      });
    } catch (_) {}
  }

  /** Process an inbound `drop-beacon-ack` packet — update RTT. */
  handleBeaconAck(remoteId, packet) {
    const echoTs = Number(packet?.echoTs) || 0;
    if (!echoTs) return;
    const rtt = Math.max(0, Date.now() - echoTs);
    const existing = this._byId.get(remoteId) || {
      id: remoteId,
      nickname: '',
      rttMs: null,
      lastSeenAt: Date.now()
    };
    this._byId.set(remoteId, {
      id: remoteId,
      nickname: existing.nickname || '',
      rttMs: rtt,
      lastSeenAt: Date.now()
    });
    this._emit();
  }

  /** Current presence entries (unranked — ProximityRanker is separate). */
  snapshot() {
    return Array.from(this._byId.values());
  }

  _sweep() {
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of this._byId.entries()) {
      if (now - (entry.lastSeenAt || 0) > STALE_AFTER_MS) {
        this._byId.delete(id);
        changed = true;
      }
    }
    if (changed) this._emit();
  }

  _emit() {
    try { this._onChange(); } catch (_) {}
  }
}
