/**
 * OffscreenCanvas theme renderer — all drawing runs in this worker (no main-thread canvas load).
 * Protocol: init | resize | setTheme | pause | resume | setParams
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
let width = 0;
let height = 0;
let currentTheme = 'none';
let paused = false;
let animId = null;
/** 0 = uncapped */
let maxFPS = 0;
let lastFrameTime = 0;

let params = {
  sakuraCount: 42,
  matrixFont: 15,
  auroraBands: 6,
  synthHorizontals: 22,
  synthVerticals: 24,
  windStrength: 1.15
};

const MATRIX_CHARS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789ABCDEFﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ';

let sakuraPetals = [];
let matrixState = { cols: 0, columns: [] };

function randomChar() {
  return MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0];
}

function cancelLoop() {
  if (animId != null) {
    cancelRaf(animId);
    animId = null;
  }
}

function needsAnimationLoop(theme) {
  return theme === 'sakura_zen' || theme === 'aurora_flow' || theme === 'retro_synth' || theme === 'matrix';
}

function drawNone() {
  if (!ctx) return;
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(0, 0, width, height);
}

function drawObsidian() {
  if (!ctx) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
}

function initSakura() {
  const n = Math.min(100, Math.max(60, params.sakuraCount | 0));
  sakuraPetals = [];
  for (let i = 0; i < n; i++) {
    sakuraPetals.push({
      x: Math.random() * width,
      y: Math.random() * height - height,
      size: 5 + Math.random() * 9,
      vy: 0.8 + Math.random() * 1.7,
      vxBase: (Math.random() - 0.5) * 0.45,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.05,
      phase: Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      opacity: 0.6 + Math.random() * 0.4
    });
  }
}

function initMatrix() {
  const fs = Math.max(10, Math.min(22, params.matrixFont | 0));
  const cols = Math.max(8, Math.ceil(width / fs));
  matrixState.cols = cols;
  matrixState.columns = [];
  for (let i = 0; i < cols; i++) {
    const len = 8 + ((Math.random() * 18) | 0);
    const chars = [];
    for (let j = 0; j < len; j++) chars.push(randomChar());
    matrixState.columns.push({
      y: Math.random() * height,
      speed: 1.2 + Math.random() * 4.5,
      chars,
      tick: Math.random() * 100
    });
  }
}

function initThemeState() {
  if (currentTheme === 'sakura_zen') initSakura();
  if (currentTheme === 'matrix') initMatrix();
}

function drawSakuraFrame(t) {
  if (!ctx) return;
  const w = params.windStrength;
  ctx.fillStyle = '#0a0510';
  ctx.fillRect(0, 0, width, height);
  const gBg = ctx.createLinearGradient(0, 0, 0, height);
  gBg.addColorStop(0, '#1a0d12');
  gBg.addColorStop(1, '#0a0510');
  ctx.fillStyle = gBg;
  ctx.fillRect(0, 0, width, height);

  for (const p of sakuraPetals) {
    const wind =
      Math.sin(t * 0.0007 + p.phase) * (0.55 * w) +
      Math.sin(t * 0.0004 + p.phase2) * 0.25 * w;
    p.x += p.vxBase + wind * 0.12;
    p.y += p.vy;
    p.rot += p.vr;

    if (p.y > height + 24) {
      p.y = -20 - Math.random() * 40;
      p.x = Math.random() * width;
    }
    if (p.x < -30) p.x = width + 20;
    if (p.x > width + 30) p.x = -20;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;

    ctx.shadowColor = 'rgba(255, 180, 210, 0.85)';
    ctx.shadowBlur = Math.max(4, p.size * 0.55);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    g.addColorStop(0, 'rgba(255, 230, 240, 1)');
    g.addColorStop(0.4, 'rgba(255, 160, 190, 0.9)');
    g.addColorStop(0.75, 'rgba(255, 120, 160, 0.45)');
    g.addColorStop(1, 'rgba(255, 80, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 200, 220, 0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawAuroraFrame(t) {
  if (!ctx) return;
  const bands = Math.min(12, Math.max(3, params.auroraBands | 0));
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < bands; i++) {
    const phase = t * 0.00035 + i * 0.9;
    const y0 = height * (0.08 + i * 0.11) + Math.sin(phase) * (height * 0.04);
    const hBand = height * 0.22 + Math.sin(phase * 1.3) * 40;

    const g = ctx.createLinearGradient(0, y0, width, y0 + hBand);
    const a1 = 0.12 + 0.08 * Math.sin(phase);
    const a2 = 0.22 + 0.1 * Math.cos(phase * 0.8);
    const hue1 = 160 + Math.sin(phase) * 40;
    const hue2 = 280 + Math.cos(phase * 0.7) * 50;
    g.addColorStop(0, `hsla(${hue1}, 70%, 45%, 0)`);
    g.addColorStop(0.35, `hsla(${hue1}, 85%, 55%, ${a1})`);
    g.addColorStop(0.55, `hsla(${hue2}, 60%, 50%, ${a2})`);
    g.addColorStop(0.75, `hsla(200, 90%, 60%, ${a1 * 0.8})`);
    g.addColorStop(1, `hsla(${hue1}, 70%, 40%, 0)`);

    ctx.fillStyle = g;
    ctx.fillRect(0, y0 - 20, width, hBand + 60);
  }

  ctx.globalCompositeOperation = 'lighter';
  const sweep = t * 0.0002;
  const rg = ctx.createRadialGradient(
    width * (0.3 + 0.4 * Math.sin(sweep)),
    height * (0.25 + 0.15 * Math.cos(sweep * 1.2)),
    0,
    width * 0.5,
    height * 0.35,
    Math.max(width, height) * 0.65
  );
  rg.addColorStop(0, 'rgba(80, 220, 180, 0.15)');
  rg.addColorStop(0.5, 'rgba(120, 80, 220, 0.12)');
  rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function drawSynthFrame(t) {
  if (!ctx) return;
  ctx.fillStyle = '#0a0014';
  ctx.fillRect(0, 0, width, height);

  const cx = width * 0.5;
  const horizon = height * 0.38;
  const scroll = (t * 0.045) % 1;

  const horiz = Math.min(40, Math.max(8, params.synthHorizontals | 0));
  ctx.lineWidth = 1;
  for (let i = 0; i < horiz; i++) {
    const p = (i / horiz + scroll) % 1;
    const y = horizon + p * p * (height - horizon);
    const alpha = 0.15 + (1 - p) * 0.45;
    ctx.strokeStyle = `rgba(0, 255, 240, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const verts = Math.min(48, Math.max(12, params.synthVerticals | 0));
  for (let i = 0; i <= verts; i++) {
    const u = i / verts - 0.5;
    const angle = u * 1.15;
    ctx.strokeStyle = `rgba(255, 0, 180, ${0.12 + Math.abs(u) * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(cx, horizon);
    const x2 = cx + Math.tan(angle) * (height - horizon) * 1.4;
    ctx.lineTo(x2, height + 4);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 0, 200, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();
}

function drawMatrixFrame() {
  if (!ctx) return;
  const fs = Math.max(10, Math.min(22, params.matrixFont | 0));
  const cols = Math.max(8, Math.ceil(width / fs));
  if (matrixState.cols !== cols || matrixState.columns.length !== cols) initMatrix();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, 0, width, height);

  ctx.font = `bold ${fs}px ui-monospace, "Cascadia Code", monospace`;

  for (let i = 0; i < cols; i++) {
    const col = matrixState.columns[i];
    col.y += col.speed;
    col.tick += 1;
    if (col.y > height + col.chars.length * fs) {
      col.y = -fs * (2 + Math.random() * 8);
      col.speed = 1.2 + Math.random() * 4.5;
    }
    if (col.tick % 3 === 0 && Math.random() < 0.08) {
      col.chars[((Math.random() * col.chars.length) | 0)] = randomChar();
    }

    for (let j = 0; j < col.chars.length; j++) {
      const y = col.y - j * fs;
      if (y < -fs || y > height + fs) continue;
      const head = j === 0;
      const fade = head ? 1 : Math.max(0.08, 1 - j * 0.045);
      ctx.fillStyle = head
        ? '#e8ffe8'
        : `rgba(0, ${160 + (j % 5) * 10}, 60, ${fade * 0.85})`;
      ctx.fillText(col.chars[j], i * fs + 1, y);
    }
  }
}

function renderFrame(t) {
  if (!ctx || width < 1 || height < 1) return;
  switch (currentTheme) {
    case 'sakura_zen':
      drawSakuraFrame(t);
      break;
    case 'aurora_flow':
      drawAuroraFrame(t);
      break;
    case 'retro_synth':
      drawSynthFrame(t);
      break;
    case 'matrix':
      drawMatrixFrame();
      break;
    default:
      break;
  }
}

function scheduleLoop() {
  cancelLoop();
  if (paused || !ctx) return;

  if (!needsAnimationLoop(currentTheme)) {
    if (currentTheme === 'none') drawNone();
    else if (currentTheme === 'obsidian') drawObsidian();
    return;
  }

  const loop = (time) => {
    if (paused || !ctx) return;
    if (maxFPS > 0) {
      const minDelta = 1000 / maxFPS;
      if (time - lastFrameTime < minDelta) {
        animId = raf(loop);
        return;
      }
      lastFrameTime = time;
    }
    renderFrame(time);
    animId = raf(loop);
  };
  animId = raf(loop);
}

self.onmessage = (e) => {
  const d = e.data;
  if (!d || typeof d.type !== 'string') return;

  switch (d.type) {
    case 'init': {
      canvas = d.canvas;
      ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      width = d.width | 0;
      height = d.height | 0;
      if (canvas && width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      if (typeof d.theme === 'string') currentTheme = d.theme;
      if (d.params && typeof d.params === 'object') Object.assign(params, d.params);
      initThemeState();
      paused = false;
      scheduleLoop();
      break;
    }
    case 'resize': {
      width = d.width | 0;
      height = d.height | 0;
      if (canvas && width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'setTheme': {
      currentTheme = d.theme || 'none';
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'pause': {
      paused = true;
      cancelLoop();
      break;
    }
    case 'resume': {
      paused = false;
      scheduleLoop();
      break;
    }
    case 'setParams': {
      if (d.params && typeof d.params === 'object') Object.assign(params, d.params);
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'setMaxFPS': {
      maxFPS = Math.max(0, Number(d.value) | 0);
      lastFrameTime = 0;
      if (!paused) scheduleLoop();
      break;
    }
    default:
      break;
  }
};
