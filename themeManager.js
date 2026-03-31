/**
 * Premium canvas backgrounds — localStorage key: orbit_theme
 * Pauses RAF when document is hidden (battery / background tabs).
 */

export const THEMES = {
    SAKURA: 'sakura',
    AURORA: 'aurora',
    SYNTH: 'synth',
    MATRIX: 'matrix',
    OBSIDIAN: 'obsidian'
};

const STORAGE_KEY = 'orbit_theme';

let instance = null;

export class ThemeManager {
    constructor() {
        this.animationId = null;
        this.currentTheme = localStorage.getItem(STORAGE_KEY) || THEMES.OBSIDIAN;
        this._sakuraPetals = [];
        this._matrixDrops = [];
        this._matrixCols = 0;
        this._reducedMotion = false;

        this.canvas = document.getElementById('theme-background');
        if (!this.canvas) {
            console.warn('theme-background canvas missing — CSS theme vars only');
            this._applyBodyTheme(this.currentTheme);
            return;
        }
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this._onResize = () => this.resizeCanvas();
        window.addEventListener('resize', this._onResize, { passive: true });
        window.addEventListener('orientationchange', () => {
            window.setTimeout(() => this.resizeCanvas(), 200);
        });

        if (typeof window.matchMedia === 'function') {
            const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            this._reducedMotion = mq.matches;
            const onMotionChange = () => {
                this._reducedMotion = mq.matches;
                if (!this.ctx) return;
                this.resizeCanvas();
            };
            if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
            else if (mq.addListener) mq.addListener(onMotionChange);
        }

        this._onVisibility = () => {
            if (document.hidden) {
                this.stopAnimation();
            } else {
                this.start();
            }
        };
        document.addEventListener('visibilitychange', this._onVisibility);

        this.resizeCanvas();
        this._applyBodyTheme(this.currentTheme);
        // FIX: Bug #4 — do NOT auto-start animation in constructor.
        // Animation starts only when start() is called explicitly from main.js after login.
        this._started = false;
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        this._initSakuraPetals(w, h);
        this._initMatrixDrops(w, h);
        // FIX: Bug #4 — only auto-restart animation if it was previously started.
        if (this._started && !document.hidden) {
            this.start();
        }
    }

    _initSakuraPetals(w, h) {
        const n = Math.min(22, Math.max(15, Math.floor((w * h) / 42000) + 10));
        this._sakuraPetals = [];
        for (let i = 0; i < n; i++) {
            this._sakuraPetals.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: 3 + Math.random() * 5,
                speed: 0.4 + Math.random() * 1.2,
                drift: (Math.random() - 0.5) * 0.6,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.04
            });
        }
    }

    _initMatrixDrops(w, h) {
        const cols = Math.min(40, Math.max(30, Math.round(w / 14)));
        this._matrixCols = cols;
        this._matrixDrops = [];
        for (let i = 0; i < this._matrixCols; i++) {
            this._matrixDrops[i] = Math.random() * h;
        }
    }

    start() {
        if (!this.ctx || document.hidden) return;
        this._started = true; // FIX: Bug #4 — mark as started
        this.stopAnimation();
        this.applyTheme();
    }

    applyTheme() {
        if (!this.ctx) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        /* No animated canvas when user prefers reduced motion; keep saved theme in localStorage. */
        if (this._reducedMotion) {
            this.stopAnimation();
            this.renderObsidian(w, h);
            return;
        }
        switch (this.currentTheme) {
            case THEMES.SAKURA:
                this.animateSakura(w, h);
                break;
            case THEMES.AURORA:
                this.animateAurora(w, h);
                break;
            case THEMES.SYNTH:
                this.animateSynth(w, h);
                break;
            case THEMES.MATRIX:
                this.animateMatrix(w, h);
                break;
            case THEMES.OBSIDIAN:
            default:
                this.renderObsidian(w, h);
                break;
        }
    }

    stopAnimation() {
        if (this.animationId != null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    setTheme(theme) {
        const valid = Object.values(THEMES);
        if (!valid.includes(theme)) return;
        if (this.currentTheme === theme) return;
        this.currentTheme = theme;
        localStorage.setItem(STORAGE_KEY, theme);
        this._applyBodyTheme(theme);
        this.start();
    }

    _applyBodyTheme(theme) {
        document.body.dataset.orbitTheme = theme;
        const map = {
            [THEMES.SAKURA]: { accent: '#ff7a9a', accentHover: '#ffa8bc', bg: '#1a0f14', sidebar: '#140a10' },
            [THEMES.AURORA]: { accent: '#6de3ff', accentHover: '#9bf0ff', bg: '#0a1520', sidebar: '#081018' },
            [THEMES.SYNTH]: { accent: '#00ffff', accentHover: '#66ffff', bg: '#0a0018', sidebar: '#060014' },
            [THEMES.MATRIX]: { accent: '#00ff41', accentHover: '#66ff7a', bg: '#000500', sidebar: '#000802' },
            [THEMES.OBSIDIAN]: { accent: '#a8b0c4', accentHover: '#d0d6e8', bg: '#000000', sidebar: '#0a0a0b' }
        };
        const t = map[theme] || map[THEMES.OBSIDIAN];
        document.documentElement.style.setProperty('--accent', t.accent);
        document.documentElement.style.setProperty('--accent-hover', t.accentHover);
        document.documentElement.style.setProperty('--bg-dark', t.bg);
        document.documentElement.style.setProperty('--bg-sidebar', t.sidebar);
    }

    animateSakura(w, h) {
        const petals = this._sakuraPetals;
        const animate = () => {
            if (this.currentTheme !== THEMES.SAKURA || document.hidden) return;
            const ctx = this.ctx;
            ctx.fillStyle = '#fff5f7';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ffb7c5';
            for (const p of petals) {
                p.y += p.speed;
                p.x += p.drift;
                p.rot += p.rotSpeed;
                if (p.y > h + 10) {
                    p.y = -10;
                    p.x = Math.random() * w;
                }
                if (p.x < -20) p.x = w + 20;
                if (p.x > w + 20) p.x = -20;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.beginPath();
                ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    animateAurora(w, h) {
        let offset = 0;
        const animate = () => {
            if (this.currentTheme !== THEMES.AURORA || document.hidden) return;
            offset = (offset + 0.003) % 1;
            const g = this.ctx.createLinearGradient(0, 0, w, h * 0.85);
            g.addColorStop((0 + offset) % 1, '#0f2027');
            g.addColorStop((0.28 + offset) % 1, '#203a43');
            g.addColorStop((0.55 + offset) % 1, '#2c5364');
            g.addColorStop((0.92 + offset) % 1, '#0a1628');
            this.ctx.fillStyle = g;
            this.ctx.fillRect(0, 0, w, h);
            const g2 = this.ctx.createRadialGradient(w * 0.3, 0, 0, w * 0.3, h * 0.2, w * 0.6);
            g2.addColorStop(0, 'rgba(120, 200, 255, 0.15)');
            g2.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = g2;
            this.ctx.fillRect(0, 0, w, h);
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    animateSynth(w, h) {
        let t = 0;
        const horizon = h * 0.42;
        const rows = 14;
        const animate = () => {
            if (this.currentTheme !== THEMES.SYNTH || document.hidden) return;
            t += 0.028;
            const ctx = this.ctx;
            ctx.fillStyle = '#030006';
            ctx.fillRect(0, 0, w, h);
            ctx.lineWidth = 1.2;
            /* Perspective grid toward horizon (retro synth) */
            for (let i = 0; i <= rows; i++) {
                const p = i / rows;
                const y = horizon + (h - horizon) * (p * p);
                const spread = w * 0.08 + p * p * w * 0.42;
                const sway = Math.sin(t * 1.4 + i * 0.5) * (3 + p * 6);
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.12 + p * 0.22})`;
                ctx.beginPath();
                ctx.moveTo(w * 0.5 - spread + sway, y);
                ctx.lineTo(w * 0.5 + spread + sway, y);
                ctx.stroke();
            }
            const vanes = 11;
            for (let v = 0; v <= vanes; v++) {
                const ang = Math.max(-0.82, Math.min(0.82, (v / vanes - 0.5) * 1.1 + Math.sin(t * 0.6) * 0.04));
                ctx.strokeStyle = `rgba(255, 0, 220, ${0.1 + (v % 2) * 0.08})`;
                ctx.beginPath();
                ctx.moveTo(w * 0.5, horizon - 2);
                ctx.lineTo(w * 0.5 + Math.tan(ang) * (h - horizon), h + 2);
                ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(0, 255, 200, 0.18)';
            ctx.beginPath();
            ctx.arc(w * 0.5, horizon + 4, 8 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
            ctx.stroke();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    animateMatrix(w, h) {
        const chars =
            '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const cols = this._matrixCols;
        if (this._matrixDrops.length !== cols) this._initMatrixDrops(w, h);
        const charW = w / cols;
        const fontSize = Math.max(10, charW * 0.85);
        const drops = this._matrixDrops;

        const animate = () => {
            if (this.currentTheme !== THEMES.MATRIX || document.hidden) return;
            const ctx = this.ctx;
            ctx.fillStyle = 'rgba(0, 8, 0, 0.12)';
            ctx.fillRect(0, 0, w, h);
            ctx.font = `${fontSize}px ui-monospace, monospace`;
            ctx.textBaseline = 'top';
            for (let i = 0; i < cols; i++) {
                const char = chars[(Math.random() * chars.length) | 0];
                const x = i * charW;
                let y = drops[i];
                const headBright = Math.random() > 0.96;
                ctx.fillStyle = headBright ? '#e8ffe8' : '#00cc00';
                ctx.fillText(char, x, y);
                drops[i] += fontSize * 0.55;
                if (drops[i] > h) {
                    drops[i] = Math.random() * h * 0.35;
                }
            }
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    renderObsidian(w, h) {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, w, h);
        this.animationId = null;
    }

    destroy() {
        this.stopAnimation();
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
    }
}

export function getThemeManager() {
    if (!instance) {
        instance = new ThemeManager();
    }
    return instance;
}
