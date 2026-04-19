// Blackjack-21 sound — tiny WebAudio synth, same pattern as Block Blast / Tetris.
// Every cue is an oscillator envelope; no assets. Nothing plays until the first
// call creates the AudioContext.

let ctx = null;
let masterGain = null;
let enabled = true;

function getCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.22;
    masterGain.connect(ctx.destination);
  } catch (_) {
    return null;
  }
  return ctx;
}

function tone(freq, durationMs, type = 'square', { attack = 0.005, release = 0.08, gain = 0.7 } = {}) {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') { void ac.resume().catch(() => {}); }
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const now = ac.currentTime;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000 + release);
  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + release + 0.02);
}

function sweep(from, to, durationMs, type = 'triangle', { gain = 0.5 } = {}) {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === 'suspended') { void ac.resume().catch(() => {}); }
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  const now = ac.currentTime;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + durationMs / 1000);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000 + 0.05);
  osc.connect(env);
  env.connect(masterGain);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.1);
}

export const sfx = {
  deal()   { tone(440, 30, 'square', { gain: 0.25 }); },
  hit()    { tone(520, 45, 'triangle', { gain: 0.35 }); },
  flip()   { tone(660, 70, 'triangle', { gain: 0.35 }); },
  bust()   { sweep(330, 90, 480, 'sawtooth', { gain: 0.45 }); },
  push()   { tone(440, 80, 'sine', { gain: 0.3 }); setTimeout(() => tone(440, 80, 'sine', { gain: 0.3 }), 100); },
  win()    {
    tone(660, 70, 'triangle', { gain: 0.4 });
    setTimeout(() => tone(880, 90, 'triangle', { gain: 0.45 }), 70);
    setTimeout(() => tone(1100, 140, 'triangle', { gain: 0.5 }), 150);
  },
  lose()   { sweep(440, 110, 500, 'sawtooth', { gain: 0.4 }); },
  blackjack() {
    tone(523, 60, 'triangle', { gain: 0.4 });
    setTimeout(() => tone(659, 60, 'triangle', { gain: 0.42 }), 60);
    setTimeout(() => tone(784, 60, 'triangle', { gain: 0.45 }), 120);
    setTimeout(() => tone(1047, 180, 'triangle', { gain: 0.5 }), 180);
  },
};

export function setSoundEnabled(v) { enabled = !!v; }
export function isSoundEnabled() { return enabled; }
