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

class ThemeManager {
  constructor() {
    this.canvas = document.getElementById('theme-background');
    this.worker = null;
    this._useWorker = false;
    this._fallbackCtx = null;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._tabHidden = typeof document !== 'undefined' ? document.hidden : false;
    /** When true, do not resume theme loop on tab focus (battery saver). */
    this._batterySaverHold = false;

    const stored = localStorage.getItem('orbit_theme');
    let initial = normalizeStoredTheme(stored);
    if (this._reducedMotion) initial = THEMES.NONE;
    this.theme = initial;
    if (stored !== this.theme) localStorage.setItem('orbit_theme', this.theme);

    this._applyDataTheme();
    this._initRenderer();

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this._reducedMotion = e.matches;
      if (this._reducedMotion) {
        this.theme = THEMES.NONE;
        localStorage.setItem('orbit_theme', THEMES.NONE);
        this._applyDataTheme();
        this._postWorker({ type: 'setTheme', theme: THEMES.NONE });
        this._postWorker({ type: 'pause' });
        this._drawFallbackStatic();
      } else {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._resizeRenderer();
      }
    });

    document.addEventListener('visibilitychange', () => {
      this._tabHidden = document.hidden;
      if (document.hidden) {
        this._postWorker({ type: 'pause' });
      } else if (!this._reducedMotion && !this._batterySaverHold) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
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
        '[Orbits themes] OffscreenCanvas / transferControlToOffscreen not available; using static background only.'
      );
      this._fallbackCtx = canvas.getContext('2d', { alpha: false });
      this._resizeFallbackCanvasEl();
      this._drawFallbackStatic();
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
      console.warn('[Orbits themes] Worker init failed, fallback to static canvas.', err);
      this.worker = null;
      this._fallbackCtx = canvas.getContext('2d', { alpha: false });
      this._resizeFallbackCanvasEl();
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
      this._drawFallbackStatic();
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
      this._drawFallbackStatic();
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
  }

  /** @param {number} fps 0 = uncapped */
  setMaxFPS(fps) {
    this._postWorker({ type: 'setMaxFPS', value: fps | 0 });
  }

  /** Pause animated themes until cleared; keeps tab-visibility logic consistent. */
  setBatterySaverHold(on) {
    this._batterySaverHold = !!on;
    if (on) {
      this._postWorker({ type: 'pause' });
      this.setMaxFPS(15);
    } else {
      this.setMaxFPS(0);
      if (!this._tabHidden && !this._reducedMotion) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
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
  }
}

let instance = null;
export function getThemeManager() {
  if (!instance) instance = new ThemeManager();
  return instance;
}
