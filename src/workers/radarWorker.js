/**
 * Radar sonar OffscreenCanvas — sweep, pulses, blips (no main-thread paint).
 */

const raf =
  typeof self.requestAnimationFrame === 'function'
    ? self.requestAnimationFrame.bind(self)
    : (cb) => self.setTimeout(() => cb(self.performance.now()), 16);
const cancelRaf =
  typeof self.cancelAnimationFrame === 'function'
    ? self.cancelAnimationFrame.bind(self)
    : (id) => clearTimeout(id);

let canvas = null;
let ctx = null;
let w = 0;
let h = 0;
let cx = 0;
let cy = 0;
let radius = 0;
let running = false;
let animId = null;

let accent = { r: 91, g: 155, b: 213 };
let sweepAngle = 0;
let pulses = [];
let blips = [];

function cancelLoop() {
  if (animId != null) {
    cancelRaf(animId);
    animId = null;
  }
}

function drawFrame(t) {
  if (!ctx || w < 8) return;
  const sec = t * 0.001;
  ctx.fillStyle = 'rgba(26, 26, 31, 0.92)';
  ctx.fillRect(0, 0, w, h);

  const { r, g, b } = accent;
  const base = `rgb(${r},${g},${b})`;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const rr = (radius * i) / 4;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.a += 0.022;
    if (p.a > 1) {
      pulses.splice(i, 1);
      continue;
    }
    ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - p.a) * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.25 + p.a * 0.75), 0, Math.PI * 2);
    ctx.stroke();
  }

  const sweepSpeed = 1.8;
  sweepAngle = (sec * sweepSpeed) % (Math.PI * 2);
  const trailLen = 0.85;
  for (let i = 0; i < 24; i++) {
    const a = sweepAngle - (i / 24) * trailLen;
    const alpha = (1 - i / 24) * 0.45;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.strokeStyle = base;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(sweepAngle) * radius, Math.sin(sweepAngle) * radius);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const blink = 0.55 + 0.45 * Math.sin(sec * 5);
  for (const b of blips) {
    const br = radius * (typeof b.r === 'number' ? b.r : 0.55);
    const bx = Math.cos(b.angle) * br;
    const by = Math.sin(b.angle) * br;
    const fade = typeof b.fade === 'number' ? Math.min(1, b.fade) : 1;
    const pulse = 0.4 + 0.6 * Math.sin(sec * 4 + b.angle * 3);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.35 * fade * pulse * blink})`;
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.9 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = base;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function loop(time) {
  if (!running || !ctx) return;
  drawFrame(time);
  animId = raf(loop);
}

function measure() {
  cx = w / 2;
  cy = h / 2;
  radius = Math.min(w, h) * 0.42;
}

self.onmessage = (e) => {
  const d = e.data;
  if (!d || typeof d.type !== 'string') return;

  switch (d.type) {
    case 'init': {
      canvas = d.canvas;
      ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      w = d.width | 0;
      h = d.height | 0;
      if (d.accent && typeof d.accent.r === 'number') accent = d.accent;
      if (canvas && w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      measure();
      break;
    }
    case 'resize': {
      w = d.width | 0;
      h = d.height | 0;
      if (canvas && w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      measure();
      break;
    }
    case 'accent': {
      if (d.accent && typeof d.accent.r === 'number') accent = d.accent;
      break;
    }
    case 'start': {
      running = true;
      cancelLoop();
      animId = raf(loop);
      break;
    }
    case 'stop': {
      running = false;
      cancelLoop();
      if (ctx && w > 0 && h > 0) {
        ctx.fillStyle = 'rgba(26, 26, 31, 0.95)';
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
    case 'pulse': {
      pulses.push({ a: 0 });
      break;
    }
    case 'setBlips': {
      blips = Array.isArray(d.blips) ? d.blips.map((x) => ({ ...x })) : [];
      for (const b of blips) {
        if (typeof b.fade !== 'number') b.fade = 0;
      }
      break;
    }
    case 'tickFade': {
      for (const b of blips) {
        if (typeof b.fade === 'number' && b.fade < 1) b.fade = Math.min(1, b.fade + 0.08);
      }
      break;
    }
    default:
      break;
  }
};
