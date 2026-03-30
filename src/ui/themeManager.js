// themeManager.js – Full implementation with 5 presets

export const THEMES = {
  SAKURA: 'sakura',
  AURORA: 'aurora',
  SYNTH: 'synth',
  MATRIX: 'matrix',
  OBSIDIAN: 'obsidian'
};

export class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('orbit_theme') || THEMES.OBSIDIAN;
    this.animationId = null;
    this.canvas = document.getElementById('theme-background');
    if (!this.canvas) {
      this.createCanvas();
    }
    this.ctx = this.canvas?.getContext('2d');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.initResizeObserver();
    
    this._onVisibility = () => {
      if (document.hidden) {
          this.stopAnimation();
      } else {
          this.start();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    this.start();
  }

  createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'theme-background';
    canvas.className = 'theme-background';
    document.body.insertBefore(canvas, document.body.firstChild);
    this.canvas = canvas;
  }

  initResizeObserver() {
    const resizeHandler = () => {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.currentTheme !== THEMES.OBSIDIAN && !this.reducedMotion && !document.hidden) {
          this.start();
        } else {
          this.renderStatic();
        }
      }
    };
    window.addEventListener('resize', resizeHandler, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(resizeHandler, 50));
    resizeHandler();
  }

  start() {
    this.stopAnimation();
    if (this.reducedMotion || document.hidden) {
      this.renderStatic();
      return;
    }
    this.applyTheme();
  }

  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resumeAnimation() {
    if (!document.hidden && this.currentTheme !== THEMES.OBSIDIAN && !this.reducedMotion) {
      this.start();
    }
  }

  setTheme(theme) {
    if (this.currentTheme === theme) return;
    this.currentTheme = theme;
    localStorage.setItem('orbit_theme', theme);
    
    // Remove body background image for Obsidian
    if (theme === THEMES.OBSIDIAN) {
      document.body.style.backgroundImage = 'none';
      document.body.classList.add('stars-off');
    } else {
      document.body.style.backgroundImage = '';
      document.body.classList.remove('stars-off');
    }
    
    this.start();
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  }

  applyTheme() {
    switch (this.currentTheme) {
      case THEMES.SAKURA: this.animateSakura(); break;
      case THEMES.AURORA: this.animateAurora(); break;
      case THEMES.SYNTH: this.animateSynth(); break;
      case THEMES.MATRIX: this.animateMatrix(); break;
      case THEMES.OBSIDIAN: this.renderObsidian(); break;
      default: this.renderObsidian();
    }
  }

  renderStatic() {
    if (!this.ctx) return;
    this.ctx.fillStyle = this.currentTheme === THEMES.OBSIDIAN ? '#000000' : '#0A0A0B';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ========== SAKURA ZEN ==========
  animateSakura() {
    const isLowPerf = document.documentElement.classList.contains('low-perf');
    const petals = [];
    const petalCount = isLowPerf ? Math.floor(8 + Math.random() * 3) : Math.floor(18 + Math.random() * 5);
    for (let i = 0; i < petalCount; i++) {
      petals.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        size: 5 + Math.random() * 8,
        speed: 0.6 + Math.random() * 1.2,
        angle: Math.random() * Math.PI * 2,
        sway: Math.random() * Math.PI * 2
      });
    }
    
    let lastTime = 0;
    const animate = (time) => {
      if (this.currentTheme !== THEMES.SAKURA || document.hidden) return;
      if (!this.ctx) return;
      
      if (isLowPerf && time - lastTime < 33) {
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = time;
      
      this.ctx.fillStyle = '#0A0A0B';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      for (const p of petals) {
        p.y += p.speed;
        p.sway += 0.02;
        const swayX = Math.sin(p.sway) * 2;
        if (p.y > this.canvas.height + 30) p.y = -30;
        
        this.ctx.beginPath();
        this.ctx.arc(p.x + swayX, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FFB7C5';
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(p.x + swayX - 2, p.y - 2, p.size * 0.6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FF9EB5';
        this.ctx.fill();
      }
      
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  // ========== AURORA FLOW ==========
  animateAurora() {
    const isLowPerf = document.documentElement.classList.contains('low-perf');
    let offset = 0;
    let lastTime = 0;
    const animate = (time) => {
      if (this.currentTheme !== THEMES.AURORA || document.hidden) return;
      if (!this.ctx) return;
      
      if (isLowPerf && time - lastTime < 33) {
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = time;
      
      offset = (offset + 0.003) % 1;
      const grad = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
      grad.addColorStop((0 + offset) % 1, '#0f2027');
      grad.addColorStop((0.25 + offset) % 1, '#203a43');
      grad.addColorStop((0.5 + offset) % 1, '#2c5364');
      grad.addColorStop((0.75 + offset) % 1, '#1a4a5f');
      grad.addColorStop((1 + offset) % 1, '#0f2027');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  // ========== RETRO SYNTH (80s perspective grid) ==========
  animateSynth() {
    const isLowPerf = document.documentElement.classList.contains('low-perf');
    let timeVal = 0;
    let lastTime = 0;
    const animate = (time) => {
      if (this.currentTheme !== THEMES.SYNTH || document.hidden) return;
      if (!this.ctx) return;
      
      if (isLowPerf && time - lastTime < 33) {
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = time;
      
      timeVal += 0.025;
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      const centerX = this.canvas.width / 2;
      const horizonY = this.canvas.height * 0.6;
      const step = 30;
      const maxLines = isLowPerf ? 15 : 25;
      
      this.ctx.strokeStyle = '#0ff';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowBlur = isLowPerf ? 0 : 4;
      this.ctx.shadowColor = '#0ff';
      
      for (let i = 1; i <= maxLines; i++) {
        const offset = Math.sin(timeVal + i * 0.3) * 15;
        const y = horizonY + i * step + offset;
        if (y > this.canvas.height) break;
        
        const scale = 1 - (i / maxLines) * 0.8;
        const leftX = centerX - (this.canvas.width * 0.4 * scale);
        const rightX = centerX + (this.canvas.width * 0.4 * scale);
        
        this.ctx.beginPath();
        this.ctx.moveTo(leftX, y);
        this.ctx.lineTo(rightX, y);
        this.ctx.stroke();
      }
      
      this.ctx.shadowBlur = 0;
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  // ========== MATRIX CODE RAIN ==========
  animateMatrix() {
    const isLowPerf = document.documentElement.classList.contains('low-perf');
    const colsCount = isLowPerf ? 20 : 45;
    const columns = Math.min(colsCount, Math.max(20, Math.floor(this.canvas.width / 20)));
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const drops = Array(columns).fill(0).map(() => Math.random() * this.canvas.height);
    const fontSize = Math.max(12, Math.floor(this.canvas.width / columns) * 0.8);
    
    let lastTime = 0;
    const animate = (time) => {
      if (this.currentTheme !== THEMES.MATRIX || document.hidden) return;
      if (!this.ctx) return;
      
      if (isLowPerf && time - lastTime < 33) {
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = time;
      
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#0f0';
      this.ctx.font = `${fontSize}px monospace`;
      
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * (this.canvas.width / columns);
        const y = drops[i] * fontSize;
        this.ctx.fillText(char, x, y);
        
        if (y > this.canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 0.5;
      }
      
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  // ========== OBSIDIAN ==========
  renderObsidian() {
    if (!this.ctx) return;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.animationId = null;
  }
}

let instance = null;
export function getThemeManager() {
    if (!instance) {
        instance = new ThemeManager();
    }
    return instance;
}
