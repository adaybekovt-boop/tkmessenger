// MediaStreamPool — the *only* owner of live MediaStreams during a call.
//
// Why a dedicated class? Tracks from getUserMedia keep the camera LED on and
// the microphone hot until .stop() is called on every individual track.
// Before this refactor, stream references were scattered across refs and
// callbacks in useCallSession, and a slightly-wrong call flow could leak
// a camera (the infamous "camera LED stuck on" bug).
//
// The pool owns three slots: local, remote, screen. `stopAll()` iterates
// every stored slot and stops every track. It is idempotent and safe to call
// from any cleanup path.

export class MediaStreamPool {
  constructor() {
    /** @type {MediaStream|null} */ this._local = null;
    /** @type {MediaStream|null} */ this._remote = null;
    /** @type {MediaStream|null} */ this._screen = null;
  }

  get local()  { return this._local; }
  get remote() { return this._remote; }
  get screen() { return this._screen; }

  setLocal(stream) {
    if (this._local && this._local !== stream) this._stopStream(this._local);
    this._local = stream || null;
  }

  setRemote(stream) {
    // Never stop a remote stream — we don't own those tracks. We just drop
    // the reference so the GC can reclaim when the peer disconnects.
    this._remote = stream || null;
  }

  setScreen(stream) {
    if (this._screen && this._screen !== stream) this._stopStream(this._screen);
    this._screen = stream || null;
  }

  /** Stop all locally-owned tracks (local + screen). Leaves remote untouched. */
  stopAll() {
    this._stopStream(this._local);
    this._stopStream(this._screen);
    this._local = null;
    this._screen = null;
    this._remote = null;
  }

  /** Swap one local track for another, stopping the old one. */
  replaceLocalVideoTrack(newTrack) {
    const local = this._local;
    if (!local) return;
    const old = local.getVideoTracks()[0];
    if (old) {
      try { local.removeTrack(old); } catch (_) {}
      try { old.stop(); } catch (_) {}
    }
    if (newTrack) {
      try { local.addTrack(newTrack); } catch (_) {}
    }
  }

  _stopStream(stream) {
    if (!stream) return;
    try {
      for (const t of stream.getTracks()) {
        try { t.stop(); } catch (_) {}
      }
    } catch (_) {
    }
  }
}
