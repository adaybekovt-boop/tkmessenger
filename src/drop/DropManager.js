// DropManager — framework-agnostic orchestrator for the Drop feature.
//
// Owns:
//   - the Drop state machine (DropStatus + canTransition)
//   - BeaconPublisher / BeaconListener (discovery pair)
//   - ProximityRanker application when presence mutates
//
// Does NOT know about React. Emits events instead; the React adapter
// (useDropSession) subscribes and mirrors them into component state.
//
// Chunk #1 scope: activation, beacon, presence. Handshake + transfer land
// in later chunks — hooks in this file (`_transitionTo`, `handlePacket`)
// already support the future states via the transition table.
//
// Events emitted:
//   'state-change' (stateSnapshot)

import { DropStatus } from './state/DropStatus.js';
import { canTransition } from './state/DropTransitions.js';
import { createInitialDropState } from './state/initialDropState.js';
import { BeaconPublisher } from './discovery/BeaconPublisher.js';
import { BeaconListener } from './discovery/BeaconListener.js';
import { rankByProximity } from './discovery/ProximityRanker.js';

// Minimal pub/sub — same one CallManager uses.
class MicroEmitter {
  constructor() { this._map = new Map(); }
  on(event, fn) {
    if (!this._map.has(event)) this._map.set(event, new Set());
    this._map.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this._map.get(event)?.delete(fn);
  }
  emit(event, payload) {
    const set = this._map.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (_) {}
    }
  }
  clear() { this._map.clear(); }
}

export class DropManager extends MicroEmitter {
  /**
   * @param {object} cfg
   * @param {() => {peerId: string, nickname: string}} cfg.getIdentity
   *   Latest identity (called every beacon tick — follow re-renders).
   * @param {(packet: object) => void} cfg.broadcastEphemeral
   *   Fan-out send to all open ephemeral channels.
   * @param {(peerId: string, packet: object) => boolean} cfg.sendEphemeralTo
   *   Unicast send on a specific peer's ephemeral channel.
   */
  constructor({ getIdentity, broadcastEphemeral, sendEphemeralTo } = {}) {
    super();
    this._getIdentity = getIdentity || (() => ({ peerId: '', nickname: '' }));
    this._broadcast = broadcastEphemeral || (() => {});
    this._sendTo = sendEphemeralTo || (() => false);

    this._state = createInitialDropState();
    this._disposed = false;

    this._publisher = new BeaconPublisher({
      broadcast: (packet) => this._broadcast(packet),
      getIdentity: this._getIdentity
    });
    this._listener = new BeaconListener({
      sendTo: (id, packet) => this._sendTo(id, packet),
      onChange: () => this._rebuildPresence()
    });
  }

  /** Current state snapshot (immutable from the outside). */
  get state() { return this._state; }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Enter BEACON state — open the Drop tab.
   * Starts listening immediately; starts publishing only if visibility is on.
   */
  activate() {
    if (this._disposed) return;
    if (this._state.status === DropStatus.BEACON) return;
    if (!this._transitionTo(DropStatus.BEACON, { beaconActive: true, error: null })) return;
    this._listener.start();
    if (this._state.visibilityEnabled) this._publisher.start();
  }

  /** Leave BEACON state — close the Drop tab. */
  deactivate() {
    if (this._state.status === DropStatus.IDLE) return;
    this._publisher.stop();
    this._listener.stop();
    this._transitionTo(DropStatus.IDLE, {
      beaconActive: false,
      presence: []
    });
  }

  /**
   * Toggle beacon publishing. Listening continues regardless so we still see
   * who else is in Drop mode — we're just invisible to them.
   */
  setVisibility(enabled) {
    const next = Boolean(enabled);
    if (this._state.visibilityEnabled === next) return;
    this._patchState({ visibilityEnabled: next });
    if (this._state.status !== DropStatus.BEACON) return;
    if (next) this._publisher.start();
    else this._publisher.stop();
  }

  /** Full disposal — call from useEffect cleanup. Idempotent. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._publisher.stop();
    this._listener.stop();
    this.clear();
  }

  // ─── Packet routing ───────────────────────────────────────────────────────

  /**
   * Entry point for any `drop-*` packet received on an ephemeral channel.
   * Called by usePeer's onData handler after type-prefix matching.
   *
   * @param {string} remoteId
   * @param {{type: string}} packet
   */
  handlePacket(remoteId, packet) {
    if (this._disposed || !packet || typeof packet !== 'object') return;
    switch (packet.type) {
      case 'drop-beacon':
        // Only act on beacons while we're actually in Drop mode — otherwise
        // a background tab shouldn't be building a presence list.
        if (this._state.status !== DropStatus.BEACON) return;
        this._listener.handleBeacon(remoteId, packet);
        return;

      case 'drop-beacon-ack':
        if (this._state.status !== DropStatus.BEACON) return;
        this._listener.handleBeaconAck(remoteId, packet);
        return;

      // Handshake + transfer packets (drop-req / drop-ack / drop-chunk / …)
      // are handled by future chunks. Silently ignore for now rather than
      // warn — this keeps old and new clients forward-compatible.
      default:
        return;
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  _transitionTo(nextStatus, patch = {}) {
    const from = this._state.status;
    if (from === nextStatus) {
      this._patchState(patch);
      return true;
    }
    if (!canTransition(from, nextStatus)) {
      try { console.warn(`[drop] invalid transition ${from} → ${nextStatus}`); } catch (_) {}
      return false;
    }
    this._patchState({ ...patch, status: nextStatus });
    return true;
  }

  _patchState(patch) {
    this._state = { ...this._state, ...patch };
    this.emit('state-change', this._state);
  }

  _rebuildPresence() {
    const ranked = rankByProximity(this._listener.snapshot());
    this._patchState({ presence: ranked });
  }
}
