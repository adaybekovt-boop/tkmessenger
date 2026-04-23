// Matrix — quiet terminal.
//
// Re-palette per the Matrix mockup (Orbits_theme_MATRIX). The previous
// incarnation had a falling-rain canvas; the mockup moved Matrix away
// from that and toward a calmer shell/terminal surface — square 0-radius
// corners throughout, 1px pastel-green borders (#7EE787), JetBrains Mono
// everywhere, `> ` prompt prefixes on inputs. UI differentiation lives in
// src/styles/theme-skins.css; MatrixBackground now only paints scanlines
// and a faint grain on a warm-black wash.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-matrix',
  name: 'Matrix',
  subtitle: 'Тихий терминал',
  family: 'atmospheric',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '12 18 14',
    '--orb-surface-rgb':  '17 24 19',
    '--orb-border-rgb':   '27 37 32',
    '--orb-text-rgb':     '208 221 210',
    '--orb-muted-rgb':    '106 128 112',
    '--orb-accent-rgb':   '126 231 135',
    '--orb-accent2-rgb':  '106 211 115',
    '--orb-success-rgb':  '126 231 135',
    '--orb-danger-rgb':   '244 63 94'
  },

  shape: {
    radiusButton: '0px',
    radiusCard: '0px',
    radiusModal: '2px',
    shadowCard: 'none',
    blurSurface: '0px'
  },

  typography: {
    fontHeading: "'JetBrains Mono', ui-monospace, monospace",
    fontBody: "'JetBrains Mono', ui-monospace, monospace",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    letterSpacingHeading: '0',
    lineHeightBody: 1.6
  },

  performance: {
    // No canvas rain anymore — the background is pure CSS. Particle count
    // is irrelevant but we keep the hook in case we ever want to re-introduce
    // a subtle cursor-blink sprite later.
    minFPS: 24,
    degradeOnLowBattery: false,
    maxParticles: { desktop: 0, mobile: 0, lowEnd: 0 }
  },

  background: () => import('./MatrixBackground.jsx')
};

export default manifest;
