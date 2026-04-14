// CallManager — framework-agnostic orchestrator of the call feature.
//
// Owns:
//   - the state machine (status transitions via CallStatus/canTransition)
//   - one MediaStreamPool (single source of truth for local/remote/screen)
//   - the active CallChannel (zero or one — we don't do multi-party here)
//   - Ringtone, CameraSwitcher, ScreenShareController
//
// Does NOT know about React. Emits events instead; the React adapter
// (useCallSession) subscribes and mirrors them into component state.
//
// Events emitted:
//   'state-change'  (stateSnapshot)
//   'remote-stream' (MediaStream)     — handy for binding <video> srcObject
//   'error'         (CallError)
//   'ended'         ()

import { CallStatus, canTransition } from './state/CallStatus.js';
import { createInitialCallState } from './state/initialCallState.js';
import { resolveGlare } from './state/GlareResolver.js';
import { MediaStreamPool } from './media/MediaStreamPool.js';
import { acquireLocalStream } from './media/MediaAcquirer.js';
import { CameraSwitcher } from './media/CameraSwitcher.js';
import { ScreenShareController } from './screen/ScreenShareController.js';
import { CallChannel } from './signaling/CallChannel.js';
import { Ringtone } from './audio/Ringtone.js';
import { CallError, CallAbortedError } from './errors/CallError.js';
import { normalizePeerId } from '../peer/helpers.js';
import { playSound } from '../core/sounds.js';

// Minimal pub/sub — we don't need Node's EventEmitter in the browser bundle.
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

export class CallManager extends MicroEmitter {
  /**
   * @param {object} cfg
   * @param {{current: any}} cfg.peerRef          — ref to live PeerJS instance
   * @param {{current: string}} cfg.peerIdRef     — ref to our peer id
   * @param {{current: string[]}} cfg.blockedPeersRef
   * @param {(args: {from: string}) => void} [cfg.onIncomingCallNotification]
   */
  constructor({ peerRef, peerIdRef, blockedPeersRef, onIncomingCallNotification } = {}) {
    super();
    this.peerRef = peerRef;
    this.peerIdRef = peerIdRef;
    this.blockedPeersRef = blockedPeersRef;
    this.notifyIncomingCall = onIncomingCallNotification || (() => {});

    this.pool = new MediaStreamPool();
    this.ringtone = new Ringtone();
    this.cameraSwitcher = new CameraSwitcher(this.pool);
    this.screenShare = new ScreenShareController(this.pool);

    /** @type {CallChannel|null} */
    this.channel = null;

    this._state = createInitialCallState();
    this._disposed = false;
    this._callTimeout = null;
  }

  /** Current state snapshot (immutable from the outside). */
  get state() { return this._state; }

  // ─── State helpers ────────────────────────────────────────────────────────

  _patchState(patch) {
    this._state = {
      ...this._state,
      ...patch,
      localStream: this.pool.local,
      remoteStream: this.pool.remote
    };
    this.emit('state-change', this._state);
  }

  _transitionTo(nextStatus, patch = {}) {
    const from = this._state.status;
    if (from === nextStatus) {
      this._patchState(patch);
      return true;
    }
    if (!canTransition(from, nextStatus)) {
      // Invalid transition — keep the state untouched and warn.
      try { console.warn(`[call] invalid transition ${from} → ${nextStatus}`); } catch (_) {}
      return false;
    }
    this._patchState({ ...patch, status: nextStatus });
    return true;
  }

  _reportError(err) {
    const wrapped = err instanceof CallError ? err : new CallError(String(err?.message || err));
    this.emit('error', wrapped);
  }

  // ─── Outgoing call ────────────────────────────────────────────────────────

  /**
   * Dial a remote peer. Acquires local media, opens a CallChannel, sets
   * status to CALLING then IN_CALL on remote stream.
   *
   * @param {string} remoteId
   * @param {{videoEnabled?: boolean}} [opts]
   */
  async startCall(remoteId, { videoEnabled = true } = {}) {
    const rid = normalizePeerId(remoteId);
    const peer = this.peerRef?.current;
    const myId = String(this.peerIdRef?.current || '');
    if (!peer || !myId || !rid) return;
    if (rid === myId) return;

    this.ringtone.stop();
    this._transitionTo(CallStatus.CALLING, {
      remoteId: rid,
      videoEnabled,
      audioEnabled: true,
      screenSharing: false
    });

    let stream;
    try {
      stream = await acquireLocalStream({ videoEnabled, facingMode: this._state.facingMode });
    } catch (err) {
      this._reportError(err);
      await this.end();
      return;
    }

    // If the caller bailed while getUserMedia was pending (status changed to
    // IDLE/ENDING), release the stream we just acquired and abort.
    if (this._state.status !== CallStatus.CALLING || this._disposed) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return;
    }

    this.pool.setLocal(stream);
    this._patchState({
      videoEnabled: Boolean(stream.getVideoTracks?.()[0]?.enabled)
    });

    try {
      this.channel = CallChannel.outgoing(peer, rid, stream);
    } catch (err) {
      this._reportError(err);
      await this.end();
      return;
    }

    this._wireChannel(this.channel);

    // Outgoing call timeout: if the remote doesn't pick up within 60s,
    // auto-cancel so the user isn't stuck on the "Звоним…" screen forever.
    if (this._callTimeout) clearTimeout(this._callTimeout);
    this._callTimeout = setTimeout(() => {
      this._callTimeout = null;
      if (this._state.status === CallStatus.CALLING) {
        this._reportError(new CallAbortedError('Нет ответа'));
        void this.end();
      }
    }, 60_000);
  }

  // ─── Incoming call (glare-aware) ──────────────────────────────────────────

  /**
   * Handle an inbound PeerJS call event. Delegates the glare decision to
   * the pure resolver, then drives state accordingly.
   *
   * @param {object} rawCall  — PeerJS MediaConnection
   */
  handleIncomingCall(rawCall) {
    const callerId = normalizePeerId(rawCall?.peer);
    const blocked = Array.isArray(this.blockedPeersRef?.current)
      ? this.blockedPeersRef.current
      : [];

    const decision = resolveGlare({
      myPeerId: String(this.peerIdRef?.current || ''),
      callerId,
      currentStatus: this._state.status,
      currentRemoteId: this._state.remoteId,
      isBlocked: blocked.includes(callerId)
    });

    switch (decision) {
      case 'reject-blocked':
      case 'reject-busy':
      case 'reject-self':
      case 'keep-outgoing':
        try { rawCall.close(); } catch (_) {}
        return;

      case 'accept-incoming': {
        // Glare: drop our outgoing, adopt theirs, auto-answer.
        this._teardownChannel();
        this.pool.stopAll();
        this.channel = CallChannel.incoming(rawCall);
        this._wireChannel(this.channel);
        void this._answer(this.channel);
        return;
      }

      case 'accept-fresh': {
        // Normal ring-in: park the channel, start ringing, notify.
        this.channel = CallChannel.incoming(rawCall);
        this._wireChannel(this.channel);
        this._transitionTo(CallStatus.RINGING, {
          remoteId: callerId,
          videoEnabled: true,
          audioEnabled: true
        });
        this.ringtone.start();
        playSound('call');
        try { this.notifyIncomingCall({ from: callerId }); } catch (_) {}
        return;
      }
    }
  }

  // ─── Accept / reject / end ────────────────────────────────────────────────

  async accept() {
    if (this._state.status !== CallStatus.RINGING || !this.channel) return;
    await this._answer(this.channel);
  }

  reject() {
    if (this._state.status !== CallStatus.RINGING) return;
    this.ringtone.stop();
    this._teardownChannel();
    this.pool.stopAll();
    this._transitionTo(CallStatus.IDLE, {
      remoteId: '',
      screenSharing: false
    });
  }

  async end() {
    if (this._state.status === CallStatus.IDLE) return;

    // Clear outgoing-call timeout.
    if (this._callTimeout) {
      clearTimeout(this._callTimeout);
      this._callTimeout = null;
    }

    this.ringtone.stop();
    this._teardownChannel();
    this.pool.stopAll();

    // Force-reset to IDLE, bypassing transition validation. This method is
    // the emergency exit — it MUST always succeed regardless of state-machine
    // bugs or unexpected intermediate states.
    this._patchState({
      status: CallStatus.IDLE,
      remoteId: '',
      screenSharing: false
    });
    this.emit('ended');
  }

  // ─── Media controls ───────────────────────────────────────────────────────

  toggleAudio() {
    const track = this.pool.local?.getAudioTracks?.()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this._patchState({ audioEnabled: track.enabled });
    return track.enabled;
  }

  toggleVideo() {
    const track = this.pool.local?.getVideoTracks?.()[0];
    if (!track) {
      this._patchState({ videoEnabled: false });
      return false;
    }
    track.enabled = !track.enabled;
    this._patchState({ videoEnabled: track.enabled });
    return track.enabled;
  }

  async switchCamera() {
    if (!this.channel) return;
    try {
      const nextFacing = await this.cameraSwitcher.switch(this.channel.raw, this._state.facingMode);
      this._patchState({ facingMode: nextFacing, videoEnabled: true });
    } catch (err) {
      this._reportError(err);
    }
  }

  async startScreenShare() {
    if (!this.channel) return;
    try {
      const started = await this.screenShare.start(
        this.channel.raw,
        () => { void this.stopScreenShare(); }
      );
      if (started) this._patchState({ screenSharing: true });
    } catch (err) {
      this._reportError(err);
      this._patchState({ screenSharing: false });
    }
  }

  async stopScreenShare() {
    if (!this.channel) {
      this._patchState({ screenSharing: false });
      return;
    }
    try {
      await this.screenShare.stop(this.channel.raw, this._state.facingMode);
    } catch (err) {
      this._reportError(err);
    } finally {
      this._patchState({ screenSharing: false });
    }
  }

  async toggleScreenShare() {
    if (this._state.screenSharing) {
      await this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  /** Full disposal — call from useEffect cleanup. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._callTimeout) {
      clearTimeout(this._callTimeout);
      this._callTimeout = null;
    }
    this.ringtone.stop();
    this._teardownChannel();
    this.pool.stopAll();
    this.clear(); // drop all subscribers
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  async _answer(channel) {
    this.ringtone.stop();
    let stream;
    try {
      stream = await acquireLocalStream({
        videoEnabled: this._state.videoEnabled,
        facingMode: this._state.facingMode
      });
    } catch (err) {
      this._reportError(err);
      await this.end();
      return;
    }

    if (this._disposed) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      return;
    }

    this.pool.setLocal(stream);
    this._transitionTo(CallStatus.IN_CALL, {
      audioEnabled: true,
      videoEnabled: Boolean(stream.getVideoTracks?.()[0]?.enabled)
    });
    channel.answer(stream);
  }

  _wireChannel(channel) {
    channel.on('stream', (remoteStream) => {
      if (this._disposed) return;
      // Remote answered — clear the outgoing-call timeout.
      if (this._callTimeout) {
        clearTimeout(this._callTimeout);
        this._callTimeout = null;
      }
      this.pool.setRemote(remoteStream);
      // For outgoing we want to flip CALLING → IN_CALL when the remote
      // stream arrives. For incoming (RINGING → IN_CALL happens in _answer)
      // this is a no-op because status is already IN_CALL.
      if (this._state.status === CallStatus.CALLING) {
        this._transitionTo(CallStatus.IN_CALL);
      } else {
        this._patchState({}); // re-emit with populated remoteStream
      }
      this.emit('remote-stream', remoteStream);
    });
    channel.on('close', () => {
      if (this._disposed) return;
      void this.end();
    });
    channel.on('error', (err) => {
      if (this._disposed) return;
      this._reportError(new CallAbortedError('transport', { cause: err instanceof Error ? err : undefined }));
      void this.end();
    });
  }

  _teardownChannel() {
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      try { ch.close(); } catch (_) {}
    }
  }
}
