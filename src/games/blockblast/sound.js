// Block Blast sound — tiny WebAudio synthesizer, same pattern as the Tetris
// sfx module. Zero asset dependencies; every effect is a short oscillator
// envelope. Nothing plays until the first call creates the AudioContext.

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
  pickUp()   { tone(520, 40, 'triangle', { gain: 0.3 }); },
  place()    { tone(200, 50, 'sawtooth', { gain: 0.35 }); },
  invalid()  { tone(110, 80, 'square', { gain: 0.25 }); },
  clear1()   { sweep(440, 660, 140, 'triangle', { gain: 0.45 }); },
  clear2()   {
    sweep(440, 880, 160, 'triangle', { gain: 0.5 });
    setTimeout(() => sweep(660, 1100, 180, 'triangle', { gain: 0.45 }), 90);
  },
  clearBig() {
    sweep(330, 660, 90, 'sawtooth', { gain: 0.45 });
    setTimeout(() => sweep(660, 1320, 140, 'sawtooth', { gain: 0.5 }), 70);
    setTimeout(() => sweep(1320, 1760, 180, 'sawtooth', { gain: 0.55 }), 180);
  },
  combo()    {
    tone(660, 60, 'triangle', { gain: 0.4 });
    setTimeout(() => tone(990, 60, 'triangle', { gain: 0.45 }), 50);
  },
  levelUp()  {
    tone(440, 80, 'triangle', { gain: 0.4 });
    setTimeout(() => tone(660, 80, 'triangle', { gain: 0.42 }), 80);
    setTimeout(() => tone(880, 140, 'triangle', { gain: 0.48 }), 160);
  },
  gameOver() {
    sweep(440, 110, 600, 'sawtooth', { gain: 0.5 });
  },
  start()    {
    tone(440, 60, 'triangle', { gain: 0.35 });
    setTimeout(() => tone(660, 60, 'triangle', { gain: 0.35 }), 70);
    setTimeout(() => tone(880, 120, 'triangle', { gain: 0.4 }), 140);
  },
};

export function setSoundEnabled(v) { enabled = !!v; }
export function isSoundEnabled() { return enabled; }
