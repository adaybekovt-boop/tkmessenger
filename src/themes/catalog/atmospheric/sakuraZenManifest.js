// Sakura Zen — first atmospheric theme.
//
// Warm pink-purple palette with falling cherry blossom petals. The background
// is a CSS/Canvas hybrid managed by SakuraBackground.jsx, which reads the
// performance budget to adapt particle count on low-end devices.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'sakura-zen',
  name: 'Sakura Zen',
  subtitle: 'Цветущая сакура',
  family: 'atmospheric',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '18 12 16',
    '--orb-surface-rgb':  '32 18 30',
    '--orb-border-rgb':   '80 40 68',
    '--orb-text-rgb':     '255 240 248',
    '--orb-muted-rgb':    '210 175 195',
    '--orb-accent-rgb':   '244 114 182',
    '--orb-success-rgb':  '120 200 130',
    '--orb-danger-rgb':   '244 80 100'
  },

  shape: {
    radiusButton: '16px',
    radiusCard: '20px',
    radiusModal: '24px',
    shadowCard: '0 4px 24px rgba(236, 112, 156, 0.08)',
    blurSurface: '24px'
  },

  typography: {
    fontHeading: "'Noto Sans JP', 'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    letterSpacingHeading: '0.02em',
    lineHeightBody: 1.6
  },

  motion: {
    durationShort: 0.18,
    durationMedium: 0.35,
    durationLong: 0.6,
    ease: [0.4, 0, 0.2, 1],
    reducedMotionFallback: 'subtle'
  },

  features: {
    activeTabOrnament: 'hanko-stamp',
    messageBubbleStyle: 'rounded',
    modalEnter: 'fade-scale',
    particlesEnabled: true,
    reducedMotionMode: 'subtle'
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 30, mobile: 15, lowEnd: 6 }
  },

  background: () => import('./SakuraBackground.jsx')
};

export default manifest;
