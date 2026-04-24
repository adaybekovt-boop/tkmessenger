// sounds.js — programmatic sound effects via Web Audio API.
// Each sound is generated with oscillators + gain envelopes — no audio files needed.
// Respects the `sound` flag from notification settings (orbits_notif_settings_v1).
//
// Multiple *presets* are exposed so the user can pick the tone palette that
// fits their environment (office vs. solo etc.):
//   - classic : original two-tone dings
//   - soft    : lower volume, softer attack, sine only
//   - minimal : very short blips, barely audible
//   - silent  : no audible output (haptic-only workflows)
// The active preset is stored in localStorage under `orbits_sound_preset`.

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

// ─── Primitive tone helper ──────────────────────────────────────────────────

function tone(ctx, { type = 'sine', freqStart, freqEnd, dur = 0.15, gain: peakGain = 0.12, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t);
  if (freqEnd != null && freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peakGain, t + Math.min(0.03, dur * 0.2));
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// ─── Preset library ─────────────────────────────────────────────────────────

// Each preset implements the same four actions so the caller doesn't care
// which one is active.
const PRESETS = {
  classic: {
    send:    (ctx) => tone(ctx, { freqStart: 600, freqEnd: 1200, dur: 0.12, gain: 0.12 }),
    receive: (ctx) => {
      tone(ctx, { freqStart: 880, dur: 0.15, gain: 0.14 });
      tone(ctx, { freqStart: 660, dur: 0.18, gain: 0.14, delay: 0.1 });
    },
    call:    (ctx) => {
      for (let i = 0; i < 2; i++) {
        tone(ctx, { freqStart: 740, freqEnd: 520, dur: 0.16, gain: 0.16, delay: i * 0.18 });
      }
    },
    error:   (ctx) => tone(ctx, { type: 'square', freqStart: 200, freqEnd: 150, dur: 0.18, gain: 0.10 }),
  },
  soft: {
    send:    (ctx) => tone(ctx, { freqStart: 520, freqEnd: 780, dur: 0.14, gain: 0.07 }),
    receive: (ctx) => {
      tone(ctx, { freqStart: 660, dur: 0.2, gain: 0.08 });
      tone(ctx, { freqStart: 520, dur: 0.22, gain: 0.08, delay: 0.12 });
    },
    call:    (ctx) => {
      for (let i = 0; i < 2; i++) {
        tone(ctx, { freqStart: 560, freqEnd: 440, dur: 0.2, gain: 0.10, delay: i * 0.22 });
      }
    },
    error:   (ctx) => tone(ctx, { freqStart: 260, freqEnd: 200, dur: 0.2, gain: 0.07 }),
  },
  minimal: {
    send:    (ctx) => tone(ctx, { freqStart: 1200, dur: 0.05, gain: 0.08 }),
    receive: (ctx) => tone(ctx, { freqStart: 900, dur: 0.07, gain: 0.09 }),
    call:    (ctx) => {
      tone(ctx, { freqStart: 700, dur: 0.08, gain: 0.10 });
      tone(ctx, { freqStart: 700, dur: 0.08, gain: 0.10, delay: 0.18 });
    },
    error:   (ctx) => tone(ctx, { type: 'square', freqStart: 180, dur: 0.08, gain: 0.08 }),
  },
  silent: {
    send:    () => {},
    receive: () => {},
    call:    () => {},
    error:   () => {},
  },
};

const PRESET_KEY = 'orbits_sound_preset';

export const SOUND_PRESETS = [
  { id: 'classic', label: 'Классика' },
  { id: 'soft',    label: 'Мягкий'   },
  { id: 'minimal', label: 'Минимал'  },
  { id: 'silent',  label: 'Без звука' },
];

export function getSoundPreset() {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw && PRESETS[raw]) return raw;
  } catch (_) {}
  return 'classic';
}

export function setSoundPreset(id) {
  if (!PRESETS[id]) return;
  try { localStorage.setItem(PRESET_KEY, id); } catch (_) {}
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Play a named sound effect.
 * @param {'send' | 'receive' | 'call' | 'error'} type
 */
export function playSound(type) {
  try {
    const settings = getNotifSettings();
    if (!settings.sound) return;
    const preset = PRESETS[getSoundPreset()] || PRESETS.classic;
    const fn = preset[type];
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
