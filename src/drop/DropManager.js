// DropManager — framework-agnostic orchestrator for the Drop feature.
//
// Owns:
//   - the Drop state machine (DropStatus + canTransition)
//   - BeaconPublisher / BeaconListener (discovery pair)
//   - ProximityRanker application when presence mutates
//   - Handshake protocol (drop-req / drop-ack / drop-rej / drop-cancel)
//   - Transfer orchestration via OrbitsDrop (chunking + compression)
//
// Does NOT know about React. Emits events instead; the React adapter
// (useDropSession) subscribes and mirrors them into component state.
//
// Events emitted:
//   'state-change' (stateSnapshot)

import { DropStatus } from './state/DropStatus.js';
import { DropIntent } from './state/DropIntent.js';
import { canTransition } from './state/DropTransitions.js';
import { createInitialDropState } from './state/initialDropState.js';
import { BeaconPublisher } from './discovery/BeaconPublisher.js';
import { BeaconListener } from './discovery/BeaconListener.js';
import { rankByProximity } from './discovery/ProximityRanker.js';
import { OrbitsDrop } from '../core/orbitsDrop.js';
import { Emitter } from '../core/emitter.js';
import {
  RejectedByPeerError,
  TransferAbortedError,
  IntegrityError
} from './errors/DropError.js';

// Timeout for handshake response (15 seconds)
const HANDSHAKE_TIMEOUT_MS = 15_000;

export class DropManager extends Emitter {
  /**
   * @param {object} cfg
   * @param {() => {peerId: string, nickname: string}} cfg.getIdentity
   * @param {(packet: object) => void} cfg.broadcastEphemeral
   * @param {(peerId: string, packet: object) => boolean} cfg.sendEphemeralTo
   * @param {(peerId: string) => object|null} [cfg.getConn]
   *   Returns a reliable PeerJS connection for a given peerId (for file transfer).
   */
  constructor({ getIdentity, broadcastEphemeral, sendEphemeralTo, getConn } = {}) {
    super();
    this._getIdentity = getIdentity || (() => ({ peerId: '', nickname: '' }));
    this._broadcast = broadcastEphemeral || (() => {});
    this._sendTo = sendEphemeralTo || (() => false);
    this._getConn = getConn || (() => null);

    this._state = createInitialDropState();
    this._disposed = false;
    this._handshakeTimer = null;

    // Transfer engine
    this._transferEngine = new OrbitsDrop();
    this._setupTransferCallbacks();

    // Pending send context (set by requestDrop, consumed on drop-ack)
    this._pendingSend = null;

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

  /** True when a file transfer is actively in progress. */
  get isTransferring() {
    return this._state.status === DropStatus.TRANSFERRING;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  activate() {
    if (this._disposed) return;
    // Only activate from IDLE or ERROR — never interrupt an active
    // handshake, consent prompt, or transfer in progress.
    const s = this._state.status;
    if (s !== DropStatus.IDLE && s !== DropStatus.ERROR) return;
    if (!this._transitionTo(DropStatus.BEACON, { beaconActive: true, error: null })) return;
    this._listener.start();
    if (this._state.visibilityEnabled) this._publisher.start();
  }

  deactivate() {
    if (this._state.status === DropStatus.IDLE) return;
    this._clearHandshakeTimer();
    this._pendingSend = null;
    this._publisher.stop();
    this._listener.stop();
    this._transitionTo(DropStatus.IDLE, {
      beaconActive: false,
      presence: [],
      activeSession: null
    });
  }

  setVisibility(enabled) {
    const next = Boolean(enabled);
    if (this._state.visibilityEnabled === next) return;
    this._patchState({ visibilityEnabled: next });
    if (this._state.status !== DropStatus.BEACON) return;
    if (next) this._publisher.start();
    else this._publisher.stop();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._clearHandshakeTimer();
    this._publisher.stop();
    this._listener.stop();
    this.clear();
  }

  // ─── Handshake: Sender side ───────────────────────────────────────────────

  /**
   * Initiate a file drop to a peer.
   * @param {string} targetPeerId
   * @param {File[]} files
   * @param {string} quality - 'high' | 'fast' | 'original'
   */
  requestDrop(targetPeerId, files, quality = 'high') {
    if (this._disposed) return;
    if (this._state.status !== DropStatus.BEACON) return;

    const fileMeta = files.map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream'
    }));
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    this._pendingSend = { targetPeerId, files, quality };

    const session = {
      intent: DropIntent.SEND,
      remotePeerId: targetPeerId,
      files: fileMeta,
      totalSize,
      quality,
      progress: 0,
      transferredBytes: 0,
      statusText: 'Ожидание...',
      receivedFileUrl: null,
      receivedFileName: null
    };

    if (!this._transitionTo(DropStatus.REQUESTING, { activeSession: session })) {
      this._pendingSend = null;
      return;
    }

    // Send handshake request
    this._sendTo(targetPeerId, {
      type: 'drop-req',
      files: fileMeta,
      totalSize,
      quality
    });

    // Start timeout
    this._startHandshakeTimer(() => {
      if (this._state.status === DropStatus.REQUESTING) {
        this._pendingSend = null;
        this._transitionTo(DropStatus.BEACON, {
          activeSession: null,
          error: new TransferAbortedError('timeout')
        });
      }
    });
  }

  /** Cancel a pending request (sender side). */
  cancelRequest() {
    if (this._state.status === DropStatus.REQUESTING) {
      const remotePeerId = this._state.activeSession?.remotePeerId;
      this._clearHandshakeTimer();
      this._pendingSend = null;
      if (remotePeerId) this._sendTo(remotePeerId, { type: 'drop-cancel' });
      this._transitionTo(DropStatus.BEACON, { activeSession: null, error: null });
    } else if (this._state.status === DropStatus.TRANSFERRING) {
      this._abortActiveTransfer();
    }
  }

  // ─── Handshake: Receiver side ─────────────────────────────────────────────

  /** Accept an incoming drop request. */
  acceptDrop() {
    if (this._state.status !== DropStatus.AWAITING_CONSENT) return;
    const remotePeerId = this._state.activeSession?.remotePeerId;
    if (!remotePeerId) return;

    const session = {
      ...this._state.activeSession,
      statusText: 'Получение...',
      progress: 0,
      transferredBytes: 0
    };

    this._sendTo(remotePeerId, {
      type: 'drop-ack',
      quality: session.quality || 'high'
    });

    this._transitionTo(DropStatus.TRANSFERRING, { activeSession: session });
  }

  /** Reject an incoming drop request. */
  rejectDrop(reason) {
    if (this._state.status !== DropStatus.AWAITING_CONSENT) return;
    const remotePeerId = this._state.activeSession?.remotePeerId;
    if (remotePeerId) {
      this._sendTo(remotePeerId, { type: 'drop-rej', reason: reason || null });
    }
    this._transitionTo(DropStatus.BEACON, { activeSession: null });
  }

  // ─── Packet routing ───────────────────────────────────────────────────────

  handlePacket(remoteId, packet) {
    if (this._disposed || !packet || typeof packet !== 'object') return;
    switch (packet.type) {
      case 'drop-beacon':
        if (this._state.status !== DropStatus.BEACON) return;
        this._listener.handleBeacon(remoteId, packet);
        return;

      case 'drop-beacon-ack':
        if (this._state.status !== DropStatus.BEACON) return;
        this._listener.handleBeaconAck(remoteId, packet);
        return;

      case 'drop-req':
        this._handleDropReq(remoteId, packet);
        return;

      case 'drop-ack':
        this._handleDropAck(remoteId, packet);
        return;

      case 'drop-rej':
        this._handleDropRej(remoteId, packet);
        return;

      case 'drop-cancel':
        this._handleDropCancel(remoteId);
        return;

      case 'file-start':
      case 'file-chunk':
      case 'file-end':
      case 'drop-resume':
        this._handleTransferPacket(remoteId, packet);
        return;

      default:
        return;
    }
  }

  // ─── Packet handlers ─────────────────────────────────────────────────────

  _handleDropReq(remoteId, packet) {
    // Only accept requests when in BEACON mode
    if (this._state.status !== DropStatus.BEACON) {
      this._sendTo(remoteId, { type: 'drop-rej', reason: 'busy' });
      return;
    }

    const session = {
      intent: DropIntent.RECEIVE,
      remotePeerId: remoteId,
      files: packet.files || [],
      totalSize: packet.totalSize || 0,
      quality: packet.quality || 'high',
      progress: 0,
      transferredBytes: 0,
      statusText: 'Ожидание решения...',
      receivedFileUrl: null,
      receivedFileName: null
    };

    this._transitionTo(DropStatus.AWAITING_CONSENT, { activeSession: session });
  }

  _handleDropAck(remoteId, packet) {
    if (this._state.status !== DropStatus.REQUESTING) return;
    if (this._state.activeSession?.remotePeerId !== remoteId) return;

    this._clearHandshakeTimer();
    const quality = packet.quality || this._pendingSend?.quality || 'high';

    const session = {
      ...this._state.activeSession,
      quality,
      statusText: 'Отправка...',
      progress: 0,
      transferredBytes: 0
    };

    this._transitionTo(DropStatus.TRANSFERRING, { activeSession: session });

    // Start sending files
    this._startFileSend(remoteId, quality);
  }

  _handleDropRej(remoteId, packet) {
    if (this._state.status !== DropStatus.REQUESTING) return;
    if (this._state.activeSession?.remotePeerId !== remoteId) return;

    this._clearHandshakeTimer();
    this._pendingSend = null;
    this._transitionTo(DropStatus.BEACON, {
      activeSession: null,
      error: new RejectedByPeerError(remoteId, packet.reason)
    });
  }

  _handleDropCancel(remoteId) {
    const session = this._state.activeSession;
    if (!session || session.remotePeerId !== remoteId) return;

    if (this._state.status === DropStatus.AWAITING_CONSENT ||
        this._state.status === DropStatus.TRANSFERRING) {
      this._transitionTo(DropStatus.BEACON, {
        activeSession: null,
        error: new TransferAbortedError('remote')
      });
    }
  }

  _handleTransferPacket(_remoteId, packet) {
    if (this._state.status === DropStatus.TRANSFERRING) {
      // Normal path — transfer is active, pass to engine.
      this._transferEngine.handleIncomingPacket(packet);
      return;
    }
    // Race condition guard: the sender may fire file-start before the
    // receiver has transitioned from AWAITING_CONSENT → TRANSFERRING.
    // Buffer up to 64 early packets and replay them once we enter
    // TRANSFERRING.
    if (this._state.status === DropStatus.AWAITING_CONSENT ||
        this._state.status === DropStatus.REQUESTING) {
      if (!this._earlyTransferPackets) this._earlyTransferPackets = [];
      if (this._earlyTransferPackets.length < 64) {
        this._earlyTransferPackets.push(packet);
      }
    }
  }

  // ─── Transfer orchestration ───────────────────────────────────────────────

  async _startFileSend(remotePeerId, quality) {
    const pending = this._pendingSend;
    if (!pending || !pending.files.length) return;
    this._pendingSend = null;

    const conn = this._getConn(remotePeerId);
    if (!conn || !conn.open) {
      this._transitionTo(DropStatus.ERROR, {
        activeSession: null,
        error: new TransferAbortedError('no_connection')
      });
      return;
    }

    try {
      for (let i = 0; i < pending.files.length; i++) {
        let file = pending.files[i];

        // Compress images if requested
        if (quality !== 'original' && file.type?.match(/image\/(jpeg|png|webp)/i)) {
          file = await this._transferEngine.compressImage(file, quality);
        }

        const fileId = crypto.randomUUID();
        await this._transferEngine.sendFile(file, conn, fileId, fileId);
      }

      this._transitionTo(DropStatus.DONE, {
        activeSession: {
          ...this._state.activeSession,
          progress: 100,
          statusText: 'Готово!'
        }
      });

      // Auto-return to BEACON after 3s
      setTimeout(() => {
        if (this._state.status === DropStatus.DONE) {
          this._transitionTo(DropStatus.BEACON, { activeSession: null });
        }
      }, 3000);
    } catch (err) {
      if (this._state.status === DropStatus.TRANSFERRING) {
        this._transitionTo(DropStatus.ERROR, {
          error: err,
          activeSession: null
        });
      }
    }
  }

  _setupTransferCallbacks() {
    // Throttle progress updates to ~15fps to avoid overwhelming React on
    // mobile where rapid setState calls can be batched into oblivion.
    let lastProgressEmit = 0;
    let pendingProgressFrame = null;

    this._transferEngine.onProgressUpdate = (msgId, percent, statusText) => {
      if (this._state.status !== DropStatus.TRANSFERRING) return;
      const session = this._state.activeSession;
      if (!session) return;
      const transferredBytes = session.totalSize
        ? Math.floor((percent / 100) * session.totalSize)
        : 0;

      const now = Date.now();
      const patch = {
        activeSession: {
          ...session,
          progress: percent,
          transferredBytes,
          statusText
        }
      };

      // Always emit at 0%, 100%, and at least every ~66ms (15fps)
      if (percent === 0 || percent >= 100 || now - lastProgressEmit >= 66) {
        lastProgressEmit = now;
        if (pendingProgressFrame) {
          cancelAnimationFrame(pendingProgressFrame);
          pendingProgressFrame = null;
        }
        this._patchState(patch);
      } else if (!pendingProgressFrame) {
        // Schedule a deferred update so mobile UI still catches up
        pendingProgressFrame = requestAnimationFrame(() => {
          pendingProgressFrame = null;
          lastProgressEmit = Date.now();
          // Re-read session since it may have changed
          if (this._state.status !== DropStatus.TRANSFERRING) return;
          this._patchState(patch);
        });
      }
    };

    this._transferEngine.onFileReady = (msgId, fileUrl, metadata) => {
      if (this._state.status !== DropStatus.TRANSFERRING) return;
      this._transitionTo(DropStatus.DONE, {
        activeSession: {
          ...this._state.activeSession,
          progress: 100,
          statusText: 'Готово!',
          receivedFileUrl: fileUrl,
          receivedFileName: metadata?.name || 'download'
        }
      });

      // Auto-return to BEACON after 10s
      setTimeout(() => {
        if (this._state.status === DropStatus.DONE) {
          this._transitionTo(DropStatus.BEACON, { activeSession: null });
        }
      }, 10000);
    };

    this._transferEngine.onTransferFailed = (msgId, error) => {
      if (this._state.status !== DropStatus.TRANSFERRING) return;
      this._transitionTo(DropStatus.ERROR, {
        error: error || new TransferAbortedError('transfer_failed'),
        activeSession: null
      });
    };
  }

  _abortActiveTransfer() {
    const session = this._state.activeSession;
    if (!session) return;

    // Abort any outgoing transfer
    for (const [fileId] of this._transferEngine.outgoingTransfers) {
      this._transferEngine.abortTransfer(fileId);
    }

    if (session.remotePeerId) {
      this._sendTo(session.remotePeerId, { type: 'drop-cancel' });
    }
    this._transitionTo(DropStatus.BEACON, { activeSession: null, error: null });
  }

  // ─── Timers ───────────────────────────────────────────────────────────────

  _startHandshakeTimer(cb) {
    this._clearHandshakeTimer();
    this._handshakeTimer = setTimeout(cb, HANDSHAKE_TIMEOUT_MS);
  }

  _clearHandshakeTimer() {
    if (this._handshakeTimer) {
      clearTimeout(this._handshakeTimer);
      this._handshakeTimer = null;
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

    // Pause beacon publishing while transferring to avoid congesting the
    // data channels during file transfer.
    if (nextStatus === DropStatus.TRANSFERRING) {
      this._publisher.stop();
      this._listener.stop();

      // Flush any early transfer packets that arrived before the state
      // machine transitioned (race between ack delivery and file-start).
      if (this._earlyTransferPackets && this._earlyTransferPackets.length) {
        const buffered = this._earlyTransferPackets;
        this._earlyTransferPackets = null;
        for (const pkt of buffered) {
          this._transferEngine.handleIncomingPacket(pkt);
        }
      }
    }
    // Discard buffered early packets if we're NOT entering TRANSFERRING
    // (e.g. user rejected, handshake timed out, error).
    if (nextStatus !== DropStatus.TRANSFERRING) {
      this._earlyTransferPackets = null;
    }

    // Resume beacons when returning to BEACON state after transfer.
    if (nextStatus === DropStatus.BEACON && from !== DropStatus.IDLE) {
      this._listener.start();
      if (this._state.visibilityEnabled) this._publisher.start();
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
