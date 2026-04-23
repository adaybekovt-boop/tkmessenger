// Graphite — cool blue-grey dark theme with drifting ambient orbs.
//
// Palette lifted from the Graphite mockup (Orbits_themes_STANDART): deep
// graphite bg, slate-blue accent with a sage-green online indicator. Manrope
// for body / headings, JetBrains Mono for technical metadata (timestamps,
// status line). A soft ambient-orb background layer gives it life without the
// cost of a per-frame canvas.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-graphite',
  name: 'Graphite',
  subtitle: 'Слоистый графит',
  family: 'classic',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '15 19 25',
    '--orb-surface-rgb':  '27 34 48',
    '--orb-border-rgb':   '37 45 60',
    '--orb-text-rgb':     '228 233 241',
    '--orb-muted-rgb':    '139 150 167',
    '--orb-accent-rgb':   '138 180 212',
    '--orb-accent2-rgb':  '165 198 224',
    '--orb-success-rgb':  '138 180 176',
    '--orb-danger-rgb':   '212 117 107'
  },

  shape: {
    radiusButton: '10px',
    radiusCard: '14px',
    radiusModal: '18px',
    shadowCard: '0 4px 16px rgba(10, 12, 16, 0.4)',
    blurSurface: '12px'
  },

  typography: {
    fontHeading: "'Manrope', system-ui, sans-serif",
    fontBody: "'Manrope', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    letterSpacingHeading: '-0.015em',
    lineHeightBody: 1.55
  },

  motion: {
    durationShort: 0.2,
    durationMedium: 0.35,
    durationLong: 0.55,
    ease: [0.2, 0, 0, 1],
    reducedMotionFallback: 'subtle'
  },

  performance: {
    minFPS: 30,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 3, mobile: 2, lowEnd: 0 }
  },

  background: () => import('./GraphiteBackground.jsx')
};

export default manifest;
