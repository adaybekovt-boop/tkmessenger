// Ringtone player — short double-beep played every 2 seconds while a call
// is pending. Lazy AudioContext (only created on first start()), and the
// context is always closed on stop() so we don't leak audio worklets.
//
// Ported from core/ringtone.js into a class so it composes naturally with
// the rest of the CallManager (`this.ringtone = new Ringtone()`).

export class Ringtone {
  constructor() {
    this._intervalId = null;
    this._audioCtx = null;
    this._secondBeepTimer = null;
  }

  /** Start the ring loop. No-op if already ringing. */
  start() {
    if (this._intervalId) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this._audioCtx = new Ctx();
      this._beep();
      this._intervalId = setInterval(() => {
        this._beep();
        this._secondBeepTimer = setTimeout(() => this._beep(), 150);
      }, 2000);
    } catch (_) {
      // AudioContext can fail on some mobile browsers before user interaction.
      // Silent swallow — a missing ringtone is not a call blocker.
    }
  }

  /** Stop the ring loop and release the AudioContext. Idempotent. */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._secondBeepTimer) {
      clearTimeout(this._secondBeepTimer);
      this._secondBeepTimer = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch (_) {}
      this._audioCtx = null;
    }
  }

  _beep() {
    const ctx = this._audioCtx;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.11);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.33);
    } catch (_) {
    }
  }
}
