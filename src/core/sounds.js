// sounds.js — programmatic sound effects via Web Audio API.
// Each sound is generated with oscillators + gain envelopes — no audio files needed.
// Respects the `sound` flag from notification settings (orbits_notif_settings_v1).

import { getNotifSettings } from './notifications.js';

let _ctx = null;

function getCtx() {
  if (_ctx && _ctx.state !== 'closed') return _ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _ctx = new Ctx();
    return _ctx;
  } catch (_) {
    return null;
  }
}

/** Resume AudioContext after user gesture (call once on first interaction). */
export function preloadSounds() {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// ─── Sound definitions ──────────────────────────────────────────────────────

function playSend(ctx) {
  // Short rising chirp — light, confirming.
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
  gain.gain.linearRampToValueAtTime(0, t + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

function playReceive(ctx) {
  // Two-tone descending ding — gentle, noticeable.
  const t = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, t);
  g1.gain.setValueAtTime(0, t);
  g1.gain.linearRampToValueAtTime(0.14, t + 0.02);
  g1.gain.linearRampToValueAtTime(0, t + 0.15);
  osc1.connect(g1);
  g1.connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.16);

  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(660, t + 0.1);
  g2.gain.setValueAtTime(0, t + 0.1);
  g2.gain.linearRampToValueAtTime(0.14, t + 0.12);
  g2.gain.linearRampToValueAtTime(0, t + 0.28);
  osc2.connect(g2);
  g2.connect(ctx.destination);
  osc2.start(t + 0.1);
  osc2.stop(t + 0.29);
}

function playCall(ctx) {
  // Gentle repeating double-beep (plays once — CallManager loops via Ringtone).
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const offset = i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, t + offset);
    osc.frequency.exponentialRampToValueAtTime(520, t + offset + 0.12);
    gain.gain.setValueAtTime(0, t + offset);
    gain.gain.linearRampToValueAtTime(0.16, t + offset + 0.03);
    gain.gain.linearRampToValueAtTime(0, t + offset + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.17);
  }
}

function playError(ctx) {
  // Low buzz — brief, unmistakable as an error.
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.linearRampToValueAtTime(150, t + 0.15);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.10, t + 0.02);
  gain.gain.linearRampToValueAtTime(0, t + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.19);
}

const SOUNDS = { send: playSend, receive: playReceive, call: playCall, error: playError };

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Play a named sound effect.
 * @param {'send' | 'receive' | 'call' | 'error'} type
 */
export function playSound(type) {
  try {
    const settings = getNotifSettings();
    if (!settings.sound) return;
    const fn = SOUNDS[type];
    if (!fn) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    fn(ctx);
  } catch (_) {
    // Never break app flow for a missing sound.
  }
}
