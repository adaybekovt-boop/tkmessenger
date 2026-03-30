import { isLowEnd } from '../utils/perf.js';

export const THEMES = {
  SAKURA: 'sakura',
  AURORA: 'aurora',
  SYNTH: 'synth',
  MATRIX: 'matrix',
  OBSIDIAN: 'obsidian',
  STELLAR: 'stellar',
  ABYSS: 'abyss',
  BLUEPRINT: 'blueprint',
  AURORA_FLOW: 'aurora-flow',
  RETRO_SYNTH: 'retro-synth'
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
    
    if (theme === THEMES.OBSIDIAN || theme === THEMES.STELLAR || theme === THEMES.ABYSS || theme === THEMES.BLUEPRINT || theme === THEMES.RETRO_SYNTH || theme === THEMES.AURORA_FLOW) {
      document.body.style.backgroundImage = 'none';
      document.body.classList.add('stars-off');
    } else {
      document.body.style.backgroundImage = '';
      document.body.classList.remove('stars-off');
    }
    
    this.start();
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  }

  applyTheme() {
    if (!this.ctx) return;
    switch (this.currentTheme) {
      case THEMES.AURORA_FLOW: this.animateAuroraFlow(); break;
      case THEMES.STELLAR: this.animateStellar(); break;
      case THEMES.RETRO_SYNTH: this.animateRetroSynth(); break;
      case THEMES.ABYSS: this.animateAbyss(); break;
      case THEMES.BLUEPRINT: this.animateBlueprint(); break;
      case THEMES.SAKURA: this.animateSakura(); break;
      case THEMES.AURORA: this.animateAurora(); break;
      case THEMES.SYNTH: this.animateSynth(); break;
      case THEMES.MATRIX: this.animateMatrix(); break;
      case THEMES.OBSIDIAN:
      default:
        this.renderObsidian();
        break;
    }
  }

  renderStatic() {
    if (!this.ctx) return;
    this.renderObsidian();
  }

  renderObsidian() {
    this.ctx.fillStyle = '#0a0a0c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  animateAuroraFlow() {
      let time = 0;
      const orbs = [
          { r: 200, c: [0, 255, 128], x: 0.2, y: 0.3, sx: 0.001, sy: 0.0015 },
          { r: 250, c: [0, 128, 255], x: 0.8, y: 0.7, sx: -0.0012, sy: -0.001 },
          { r: 150, c: [128, 0, 255], x: 0.5, y: 0.5, sx: 0.0015, sy: -0.0013 }
      ];
      
      const draw = () => {
          this.ctx.fillStyle = '#050510';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.filter = 'blur(60px)';
          
          for (let orb of orbs) {
              const x = (Math.sin(time * orb.sx) * 0.5 + 0.5) * this.canvas.width;
              const y = (Math.cos(time * orb.sy) * 0.5 + 0.5) * this.canvas.height;
              
              const grad = this.ctx.createRadialGradient(x, y, 0, x, y, orb.r);
              grad.addColorStop(0, `rgba(${orb.c[0]}, ${orb.c[1]}, ${orb.c[2]}, 0.8)`);
              grad.addColorStop(1, `rgba(${orb.c[0]}, ${orb.c[1]}, ${orb.c[2]}, 0)`);
              
              this.ctx.fillStyle = grad;
              this.ctx.beginPath();
              this.ctx.arc(x, y, orb.r, 0, Math.PI * 2);
              this.ctx.fill();
          }
          this.ctx.filter = 'none';
          
          time += isLowEnd ? 30 : 16;
          this.animationId = requestAnimationFrame(draw);
      };
      draw();
  }

  animateStellar() {
      let time = 0;
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;
      
      const draw = () => {
          this.ctx.fillStyle = '#000000';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          
          const maxR = Math.max(cx, cy) * 1.5;
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          this.ctx.lineWidth = 1;
          
          for (let i = 1; i <= 3; i++) {
              const r = maxR * (i / 3);
              this.ctx.beginPath();
              this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
              this.ctx.stroke();
              
              // Draw moving dots
              const angle = time * 0.0005 * (4 - i);
              const dx = cx + Math.cos(angle) * r;
              const dy = cy + Math.sin(angle) * r;
              
              this.ctx.beginPath();
              this.ctx.arc(dx, dy, 3, 0, Math.PI * 2);
              this.ctx.fillStyle = '#ffffff';
              this.ctx.fill();
              this.ctx.shadowBlur = 10;
              this.ctx.shadowColor = '#ffffff';
              this.ctx.shadowBlur = 0;
          }
          
          time += isLowEnd ? 30 : 16;
          this.animationId = requestAnimationFrame(draw);
      };
      draw();
  }

  animateRetroSynth() {
      let time = 0;
      const speed = 2;
      
      const draw = () => {
          this.ctx.fillStyle = '#1a0525';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          
          const cy = this.canvas.height * 0.6;
          
          // Horizon glow
          const grad = this.ctx.createLinearGradient(0, cy - 100, 0, cy + 100);
          grad.addColorStop(0, 'rgba(255, 0, 128, 0)');
          grad.addColorStop(0.5, 'rgba(255, 0, 128, 0.3)');
          grad.addColorStop(1, 'rgba(255, 0, 128, 0)');
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(0, cy - 100, this.canvas.width, 200);
          
          // Grid
          this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
          this.ctx.lineWidth = 1;
          
          // Vertical lines (perspective)
          for (let i = -10; i <= 10; i++) {
              this.ctx.beginPath();
              this.ctx.moveTo(this.canvas.width / 2, cy);
              this.ctx.lineTo(this.canvas.width / 2 + i * 200, this.canvas.height);
              this.ctx.stroke();
          }
          
          // Horizontal lines (moving)
          const offset = (time * speed) % 50;
          for (let y = 0; y < this.canvas.height - cy; y += 50) {
              const actualY = cy + y + offset;
              if (actualY > this.canvas.height) continue;
              
              this.ctx.beginPath();
              this.ctx.moveTo(0, actualY);
              this.ctx.lineTo(this.canvas.width, actualY);
              // Fade out near horizon
              this.ctx.globalAlpha = Math.min(1, (actualY - cy) / 100);
              this.ctx.stroke();
          }
          this.ctx.globalAlpha = 1;
          
          time++;
          this.animationId = requestAnimationFrame(draw);
      };
      draw();
  }

  animateAbyss() {
      let particles = [];
      const numParticles = isLowEnd ? 6 : 20;
      for (let i = 0; i < numParticles; i++) {
          particles.push({
              x: Math.random() * this.canvas.width,
              y: Math.random() * this.canvas.height,
              s: Math.random() * 2 + 1,
              a: Math.random() * Math.PI * 2,
              v: Math.random() * 0.5 + 0.5
          });
      }
      
      const draw = () => {
          const grad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
          grad.addColorStop(0, '#001122');
          grad.addColorStop(1, '#000000');
          this.ctx.fillStyle = grad;
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          
          this.ctx.fillStyle = 'rgba(0, 255, 200, 0.4)';
          for (let p of particles) {
              p.y -= p.v;
              p.x += Math.sin(p.a) * 0.5;
              p.a += 0.02;
              
              if (p.y < -10) {
                  p.y = this.canvas.height + 10;
                  p.x = Math.random() * this.canvas.width;
              }
              
              this.ctx.beginPath();
              this.ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
              this.ctx.fill();
          }
          
          this.animationId = requestAnimationFrame(draw);
      };
      draw();
  }

  animateBlueprint() {
      const draw = () => {
          this.ctx.fillStyle = '#0047AB';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          this.ctx.lineWidth = 1;
          
          const gridSize = 40;
          for (let x = 0; x < this.canvas.width; x += gridSize) {
              this.ctx.beginPath();
              this.ctx.moveTo(x, 0);
              this.ctx.lineTo(x, this.canvas.height);
              this.ctx.stroke();
          }
          for (let y = 0; y < this.canvas.height; y += gridSize) {
              this.ctx.beginPath();
              this.ctx.moveTo(0, y);
              this.ctx.lineTo(this.canvas.width, y);
              this.ctx.stroke();
          }
          
          // No active animation for blueprint by default to save power,
          // it just renders once if reducedMotion is true, or loops slowly.
          // Let's just make it static.
          this.animationId = null;
      };
      draw();
  }

  // Fallbacks to old themes if still selected
  animateSakura() {
    let petals = [];
    const num = isLowEnd ? 15 : 40;
    for (let i=0; i<num; i++) {
        petals.push({ x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height, s: Math.random() * 2 + 1, d: Math.random() * 2 });
    }
    const draw = () => {
        this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        this.ctx.fillStyle = 'rgba(255,183,197,0.6)';
        for (let p of petals) {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.s, 0, Math.PI*2);
            this.ctx.fill();
            p.y += p.d;
            p.x += Math.sin(p.y/50);
            if (p.y > this.canvas.height) { p.y = -10; p.x = Math.random() * this.canvas.width; }
        }
        this.animationId = requestAnimationFrame(draw);
    };
    draw();
  }

  animateAurora() { this.animateAuroraFlow(); }
  animateSynth() { this.animateRetroSynth(); }
  animateMatrix() {
    const chars = '01'.split('');
    const drops = [];
    const cols = this.canvas.width / 20;
    for(let i=0;i<cols;i++) drops[i] = 1;
    const draw = () => {
        this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
        this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        this.ctx.fillStyle = '#0f0';
        this.ctx.font = '15px monospace';
        for(let i=0;i<drops.length;i++) {
            const text = chars[Math.floor(Math.random()*chars.length)];
            this.ctx.fillText(text, i*20, drops[i]*20);
            if(drops[i]*20 > this.canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
        this.animationId = requestAnimationFrame(draw);
    };
    draw();
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  destroy() {
    this.stopAnimation();
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
    }
  }
}

let themeManagerInstance = null;
export function getThemeManager() {
  if (!themeManagerInstance) {
    themeManagerInstance = new ThemeManager();
  }
  return themeManagerInstance;
}