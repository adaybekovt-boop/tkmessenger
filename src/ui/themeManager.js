/**
 * Theme manager: OffscreenCanvas + dedicated theme worker (main thread does not paint animated themes).
 * Fallback: static black (#000) if transferControlToOffscreen is unavailable.
 */

export const THEMES = {
  NONE: 'none',
  SAKURA_ZEN: 'sakura_zen',
  AURORA_FLOW: 'aurora_flow',
  RETRO_SYNTH: 'retro_synth',
  MATRIX: 'matrix',
  OBSIDIAN: 'obsidian'
};

/** Map legacy orbit_theme values from older builds */
const LEGACY_THEME_MAP = {
  aurora: 'aurora_flow',
  stellar: 'aurora_flow',
  retro: 'retro_synth',
  japan: 'sakura_zen',
  abyss: 'obsidian',
  draft: 'obsidian'
};

const ALL_THEME_IDS = new Set([
  THEMES.NONE,
  THEMES.SAKURA_ZEN,
  THEMES.AURORA_FLOW,
  THEMES.RETRO_SYNTH,
  THEMES.MATRIX,
  THEMES.OBSIDIAN
]);

function normalizeStoredTheme(raw) {
  if (!raw || typeof raw !== 'string') return THEMES.NONE;
  return LEGACY_THEME_MAP[raw] || (ALL_THEME_IDS.has(raw) ? raw : THEMES.NONE);
}

const MAIN_WIND = 1.15;

class ThemeManager {
  constructor() {
    this.canvas = document.getElementById('theme-background');
    this.worker = null;
    this._useWorker = false;
    this._fallbackCtx = null;
    this._mainRaf = null;
    this._sakuraPetals = [];
    this._mainMaxFps = 0;
    this._mainLastFrameTime = 0;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._tabHidden = typeof document !== 'undefined' ? document.hidden : false;
    /** When true, do not resume theme loop on tab focus (battery saver). */
    this._batterySaverHold = false;

    const stored = localStorage.getItem('orbit_theme');
    let initial = normalizeStoredTheme(stored);
    if (this._reducedMotion) initial = THEMES.OBSIDIAN;
    this.theme = initial;
    if (stored !== this.theme) localStorage.setItem('orbit_theme', this.theme);

    this._applyDataTheme();
    this._initRenderer();

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this._reducedMotion = e.matches;
      if (this._reducedMotion) {
        this.theme = THEMES.OBSIDIAN;
        localStorage.setItem('orbit_theme', THEMES.OBSIDIAN);
        this._applyDataTheme();
        this._postWorker({ type: 'setTheme', theme: THEMES.OBSIDIAN });
        this._postWorker({ type: 'pause' });
        this._cancelMainThemeLoop();
        this._drawFallbackStatic();
      } else {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._resizeRenderer();
        this._scheduleMainThemeLoop();
      }
    });

    document.addEventListener('visibilitychange', () => {
      this._tabHidden = document.hidden;
      if (document.hidden) {
        this._postWorker({ type: 'pause' });
        this._cancelMainThemeLoop();
      } else if (!this._reducedMotion && !this._batterySaverHold) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._scheduleMainThemeLoop();
      }
    });

    window.addEventListener('resize', () => this._resizeRenderer());
  }

  _initRenderer() {
    const canvas = this.canvas;
    if (!canvas) return;

    const canTransfer =
      typeof canvas.transferControlToOffscreen === 'function' &&
      typeof OffscreenCanvas !== 'undefined';

    if (!canTransfer) {
      console.warn(
        '[Orbits themes] OffscreenCanvas unavailable — Sakura Zen uses main-thread canvas (other themes static).'
      );
      this._fallbackCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this._resizeFallbackCanvasEl();
      this._setupFallbackRendering();
      return;
    }

    try {
      this.worker = new Worker(new URL('../workers/themeWorker.js', import.meta.url), { type: 'module' });
      const offscreen = canvas.transferControlToOffscreen();
      this.worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          width: window.innerWidth,
          height: window.innerHeight,
          theme: this.theme
        },
        [offscreen]
      );
      this._useWorker = true;
    } catch (err) {
      console.warn('[Orbits themes] Worker init failed — Sakura Zen on main thread, other themes static.', err);
      this.worker = null;
      this._fallbackCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this._resizeFallbackCanvasEl();
      this._setupFallbackRendering();
    }
  }

  _initMainSakura() {
    const canvas = this.canvas;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const n = 60 + ((Math.random() * 41) | 0);
    this._sakuraPetals = [];
    for (let i = 0; i < n; i++) {
      this._sakuraPetals.push({
        x: Math.random() * w,
        y: Math.random() * h - h,
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

  _drawMainSakuraFrame(t) {
    const ctx = this._fallbackCtx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width < 1 || height < 1) return;
    const wind = MAIN_WIND;

    ctx.fillStyle = '#0a0510';
    ctx.fillRect(0, 0, width, height);
    const gBg = ctx.createLinearGradient(0, 0, 0, height);
    gBg.addColorStop(0, '#1a0d12');
    gBg.addColorStop(1, '#0a0510');
    ctx.fillStyle = gBg;
    ctx.fillRect(0, 0, width, height);

    for (const p of this._sakuraPetals) {
      const wobble =
        Math.sin(t * 0.0007 + p.phase) * (0.55 * wind) +
        Math.sin(t * 0.0004 + p.phase2) * 0.25 * wind;
      p.x += p.vxBase + wobble * 0.12;
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

  _cancelMainThemeLoop() {
    if (this._mainRaf != null) {
      cancelAnimationFrame(this._mainRaf);
      this._mainRaf = null;
    }
  }

  _scheduleMainThemeLoop() {
    if (this._useWorker || !this._fallbackCtx) return;
    this._cancelMainThemeLoop();
    if (
      this.theme !== THEMES.SAKURA_ZEN ||
      this._reducedMotion ||
      this._batterySaverHold ||
      this._tabHidden
    ) {
      return;
    }
    if (!this._sakuraPetals.length) this._initMainSakura();

    const loop = (time) => {
      if (this._useWorker || !this._fallbackCtx) {
        this._mainRaf = null;
        return;
      }
      if (
        this.theme !== THEMES.SAKURA_ZEN ||
        this._reducedMotion ||
        this._batterySaverHold ||
        this._tabHidden
      ) {
        this._mainRaf = null;
        return;
      }
      if (this._mainMaxFps > 0) {
        const minDelta = 1000 / this._mainMaxFps;
        if (time - this._mainLastFrameTime < minDelta) {
          this._mainRaf = requestAnimationFrame(loop);
          return;
        }
        this._mainLastFrameTime = time;
      }
      this._drawMainSakuraFrame(time);
      this._mainRaf = requestAnimationFrame(loop);
    };
    this._mainRaf = requestAnimationFrame(loop);
  }

  _setupFallbackRendering() {
    this._cancelMainThemeLoop();
    if (this.theme === THEMES.SAKURA_ZEN && !this._reducedMotion && !this._batterySaverHold && !this._tabHidden) {
      this._initMainSakura();
      this._scheduleMainThemeLoop();
    } else {
      this._drawFallbackStatic();
    }
  }

  _resizeFallbackCanvasEl() {
    const canvas = this.canvas;
    if (!canvas || this._useWorker) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  _resizeRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this._useWorker && this.worker) {
      this.worker.postMessage({ type: 'resize', width: w, height: h });
    } else if (this._fallbackCtx) {
      this._resizeFallbackCanvasEl();
      if (this.theme === THEMES.SAKURA_ZEN) {
        this._initMainSakura();
        this._scheduleMainThemeLoop();
      } else {
        this._drawFallbackStatic();
      }
    }
  }

  _postWorker(msg) {
    if (this._useWorker && this.worker) {
      try {
        this.worker.postMessage(msg);
      } catch (_) { /* ignore */ }
    }
  }

  _drawFallbackStatic() {
    if (!this._fallbackCtx || !this.canvas) return;
    const { width, height } = this.canvas;
    const c = this._fallbackCtx;
    if (this.theme === THEMES.NONE) {
      c.fillStyle = '#1a1a1f';
      c.fillRect(0, 0, width, height);
    } else if (this.theme === THEMES.SAKURA_ZEN) {
      const gBg = c.createLinearGradient(0, 0, 0, height);
      gBg.addColorStop(0, '#1a0d12');
      gBg.addColorStop(1, '#0a0510');
      c.fillStyle = gBg;
      c.fillRect(0, 0, width, height);
    } else {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);
    }
  }

  setTheme(name) {
    if (this._reducedMotion) name = THEMES.NONE;
    if (!ALL_THEME_IDS.has(name)) name = THEMES.NONE;
    this.theme = name;
    localStorage.setItem('orbit_theme', name);
    this._applyDataTheme();

    if (this._useWorker) {
      this._postWorker({ type: 'setTheme', theme: name });
      if (this._tabHidden) this._postWorker({ type: 'pause' });
    } else {
      this._setupFallbackRendering();
    }
  }

  /** Optional tuning for worker themes (density, speeds, etc.) */
  setThemeParams(partial) {
    this._postWorker({ type: 'setParams', params: partial || {} });
  }

  getCurrentTheme() {
    return this.theme;
  }

  _applyDataTheme() {
    document.body.dataset.theme = this.theme;
  }

  stopAnimation() {
    this._postWorker({ type: 'pause' });
    this._cancelMainThemeLoop();
  }

  /** @param {number} fps 0 = uncapped */
  setMaxFPS(fps) {
    const v = fps | 0;
    this._postWorker({ type: 'setMaxFPS', value: v });
    this._mainMaxFps = Math.max(0, v);
    this._mainLastFrameTime = 0;
  }

  /** Pause animated themes until cleared; keeps tab-visibility logic consistent. */
  setBatterySaverHold(on) {
    this._batterySaverHold = !!on;
    if (on) {
      this._postWorker({ type: 'pause' });
      this.setMaxFPS(15);
      this._cancelMainThemeLoop();
      if (!this._useWorker) this._drawFallbackStatic();
    } else {
      this.setMaxFPS(0);
      if (!this._tabHidden && !this._reducedMotion) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._setupFallbackRendering();
      }
    }
  }

  resumeAnimation() {
    this._postWorker({ type: 'resume' });
    if (this._reducedMotion) {
      this._postWorker({ type: 'setTheme', theme: THEMES.NONE });
    } else {
      this._postWorker({ type: 'setTheme', theme: this.theme });
    }
    this._scheduleMainThemeLoop();
  }
}

let instance = null;
export function getThemeManager() {
  if (!instance) instance = new ThemeManager();
  return instance;
}
