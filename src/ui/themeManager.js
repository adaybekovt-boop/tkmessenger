export const THEMES = {
  NONE: 'none',
  AURORA: 'aurora',
  STELLAR: 'stellar',
  RETRO: 'retro',
  ABYSS: 'abyss',
  DRAFT: 'draft',
  JAPAN: 'japan'
};

class ThemeManager {
  constructor() {
    this.canvas = document.getElementById('theme-background');
    this.ctx = this.canvas?.getContext('2d');
    this.theme = localStorage.getItem('orbit_theme') || THEMES.NONE;
    this.animId = null;
    this.active = true;
    this.petals = [];
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this._reducedMotion) {
      this.theme = THEMES.NONE;
    }

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this._reducedMotion = e.matches;
      if (this._reducedMotion) {
        this.stopAnimation();
        this._clearCanvas();
      } else {
        this.resumeAnimation();
      }
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this._applyDataTheme();
    this.start();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setTheme(name) {
    if (this._reducedMotion) name = THEMES.NONE;
    this.theme = name;
    localStorage.setItem('orbit_theme', name);
    this._applyDataTheme();
    this.start();
  }

  getCurrentTheme() {
    return this.theme;
  }

  _applyDataTheme() {
    document.body.dataset.theme = this.theme;
  }

  _clearCanvas() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#0f0f0f';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  stopAnimation() {
    this.active = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  resumeAnimation() {
    this.active = true;
    this.start();
  }

  start() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (!this.active || this._reducedMotion || this.theme === THEMES.NONE || !this.ctx) {
      this._clearCanvas();
      return;
    }

    if (this.theme === THEMES.JAPAN) {
      this._initJapanPetals();
    }

    const draw = (time) => {
      this.renderFrame(time);
      if (this.active) this.animId = requestAnimationFrame(draw);
    };
    this.animId = requestAnimationFrame(draw);
  }

  _initJapanPetals() {
    this.petals = [];
    const count = 35;
    for (let i = 0; i < count; i++) {
      this.petals.push(this._createPetal());
    }
  }

  _createPetal() {
    const w = this.canvas?.width || window.innerWidth;
    const h = this.canvas?.height || window.innerHeight;
    return {
      x: Math.random() * w,
      y: Math.random() * h - h,
      size: 4 + Math.random() * 6,
      speedY: 0.3 + Math.random() * 0.7,
      speedX: -0.2 + Math.random() * 0.4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      swingAmplitude: 15 + Math.random() * 25,
      swingSpeed: 0.001 + Math.random() * 0.002,
      swingOffset: Math.random() * Math.PI * 2,
      opacity: 0.3 + Math.random() * 0.5
    };
  }

  _drawPetal(p, time) {
    const ctx = this.ctx;
    const swingX = Math.sin(time * p.swingSpeed + p.swingOffset) * p.swingAmplitude;

    ctx.save();
    ctx.translate(p.x + swingX, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.opacity;

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    grad.addColorStop(0, 'rgba(255, 183, 197, 0.9)');
    grad.addColorStop(0.6, 'rgba(255, 107, 157, 0.6)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderFrame(time) {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (this.theme === THEMES.AURORA) {
      this.ctx.fillStyle = '#0f0f0f';
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.fillStyle = `rgba(42, 171, 238, ${Math.abs(Math.sin(time / 1000)) * 0.1})`;
      this.ctx.fillRect(0, 0, width, height);

    } else if (this.theme === THEMES.STELLAR) {
      this.ctx.fillStyle = '#0f0f0f';
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.fillStyle = '#fff';
      for (let i = 0; i < 50; i++) {
        this.ctx.fillRect(
          (Math.sin(i + time / 2000) * width + width) % width,
          (Math.cos(i + time / 2000) * height + height) % height,
          2, 2
        );
      }

    } else if (this.theme === THEMES.RETRO) {
      this.ctx.fillStyle = '#0f0f0f';
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.strokeStyle = '#2AABEE';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let i = 0; i < width; i += 50) { this.ctx.moveTo(i, 0); this.ctx.lineTo(i, height); }
      for (let i = (time / 50) % 50; i < height; i += 50) { this.ctx.moveTo(0, i); this.ctx.lineTo(width, i); }
      this.ctx.stroke();

    } else if (this.theme === THEMES.ABYSS) {
      this.ctx.fillStyle = '#0a0a0a';
      this.ctx.fillRect(0, 0, width, height);

    } else if (this.theme === THEMES.DRAFT) {
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(0, 0, width, height);

    } else if (this.theme === THEMES.JAPAN) {
      this.ctx.fillStyle = '#1a0d12';
      this.ctx.fillRect(0, 0, width, height);

      for (const p of this.petals) {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;

        if (p.y > height + 20) {
          p.y = -20;
          p.x = Math.random() * width;
        }
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;

        this._drawPetal(p, time);
      }
    }
  }
}

let instance = null;
export function getThemeManager() {
  if (!instance) instance = new ThemeManager();
  return instance;
}
