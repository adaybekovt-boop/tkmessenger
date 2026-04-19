// Sakura Zen — atmospheric theme, warm washi canvas with falling petals.
//
// Re-palette per the Sakura Zen mockup (orbits_themes_SAKURA ZEN): the theme
// is now *light* — warm washi-cream background, sumi-dark ink, sakura-pink
// accent, rikyu green for the "connected" indicator. Cormorant Garamond for
// headings, Shippori Mincho for the kanji decorative layer (brand, avatars,
// send-button glyph). SakuraBackground keeps the falling petals canvas.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'sakura-zen',
  name: 'Sakura Zen',
  subtitle: 'Цветущая сакура',
  family: 'atmospheric',
  colorScheme: 'light',

  tokens: {
    '--orb-bg-rgb':       '246 239 228',
    '--orb-surface-rgb':  '237 228 212',
    '--orb-border-rgb':   '217 205 184',
    '--orb-text-rgb':     '26 21 18',
    '--orb-muted-rgb':    '107 95 85',
    '--orb-accent-rgb':   '212 117 107',
    '--orb-accent2-rgb':  '228 167 160',
    '--orb-success-rgb':  '107 122 90',
    '--orb-danger-rgb':   '168 51 46'
  },

  shape: {
    radiusButton: '16px',
    radiusCard: '20px',
    radiusModal: '24px',
    shadowCard: '0 4px 24px rgba(212, 117, 107, 0.08)',
    blurSurface: '10px'
  },

  typography: {
    fontHeading: "'Cormorant Garamond', 'Noto Serif', Georgia, serif",
    fontBody: "'Noto Serif', Georgia, serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    letterSpacingHeading: '-0.01em',
    lineHeightBody: 1.55
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
