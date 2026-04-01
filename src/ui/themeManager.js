export const THEMES = {
  NONE: 'none',
  AURORA: 'aurora',
  STELLAR: 'stellar',
  RETRO: 'retro',
  ABYSS: 'abyss',
  DRAFT: 'draft'
};

class ThemeManager {
  constructor() {
    this.canvas = document.getElementById('theme-background');
    this.ctx = this.canvas?.getContext('2d');
    this.theme = localStorage.getItem('orbit_theme') || THEMES.NONE;
    this.animId = null;
    this.active = true;
    
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.theme = THEMES.NONE;
    }
    
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.start();
  }
  
  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  
  setTheme(name) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) name = THEMES.NONE;
    this.theme = name;
    localStorage.setItem('orbit_theme', name);
    this.start();
  }
  
  getCurrentTheme() {
    return this.theme;
  }
  
  stopAnimation() {
    this.active = false;
    if (this.animId) cancelAnimationFrame(this.animId);
  }
  
  resumeAnimation() {
    this.active = true;
    this.start();
  }
  
  start() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (!this.active || this.theme === THEMES.NONE || !this.ctx) {
      if (this.ctx) {
        this.ctx.fillStyle = '#0f0f0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
      return;
    }
    
    const draw = (time) => {
      this.renderFrame(time);
      if (this.active) this.animId = requestAnimationFrame(draw);
    };
    this.animId = requestAnimationFrame(draw);
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
        this.ctx.fillRect((Math.sin(i + time / 2000) * width + width) % width, (Math.cos(i + time / 2000) * height + height) % height, 2, 2);
      }
    } else if (this.theme === THEMES.RETRO) {
      this.ctx.fillStyle = '#0f0f0f';
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.strokeStyle = '#2AABEE';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for(let i = 0; i < width; i += 50) { this.ctx.moveTo(i, 0); this.ctx.lineTo(i, height); }
      for(let i = (time/50)%50; i < height; i += 50) { this.ctx.moveTo(0, i); this.ctx.lineTo(width, i); }
      this.ctx.stroke();
    } else if (this.theme === THEMES.ABYSS) {
      this.ctx.fillStyle = '#0a0a0a';
      this.ctx.fillRect(0, 0, width, height);
    } else if (this.theme === THEMES.DRAFT) {
      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(0, 0, width, height);
    }
  }
}

let instance = null;
export function getThemeManager() {
  if (!instance) instance = new ThemeManager();
  return instance;
}