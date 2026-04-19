// Paper — warm cream canvas with red-ink accent and tactile grain.
//
// Palette follows the Paper mockup (Orbits_themes_PAPER): warm washi-cream
// background (#F3EEE3), deep ink for body text, saturated brick-red ink for
// the accent (unread, active-state rail), moss-green for "connected" status.
// Geist for clean sans body, Instrument Serif for the decorative brand mark.
// PaperBackground provides the subtle paper grain.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-light',
  name: 'Paper',
  subtitle: 'Тёплая бумага',
  family: 'atmospheric',
  colorScheme: 'light',

  tokens: {
    '--orb-bg-rgb':       '243 238 227',
    '--orb-surface-rgb':  '250 246 236',
    '--orb-border-rgb':   '226 219 201',
    '--orb-text-rgb':     '20 18 16',
    '--orb-muted-rgb':    '140 133 122',
    '--orb-accent-rgb':   '178 58 38',
    '--orb-accent2-rgb':  '203 78 55',
    '--orb-success-rgb':  '61 102 57',
    '--orb-danger-rgb':   '178 58 38'
  },

  shape: {
    radiusButton: '8px',
    radiusCard: '12px',
    radiusModal: '16px',
    shadowCard: '0 1px 2px rgba(20, 18, 16, 0.06)',
    blurSurface: '0px'
  },

  typography: {
    fontHeading: "'Instrument Serif', Georgia, serif",
    fontBody: "'Geist', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    letterSpacingHeading: '-0.02em',
    lineHeightBody: 1.5
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 45, mobile: 25, lowEnd: 10 }
  },

  background: () => import('./PaperBackground.jsx')
};

export default manifest;
