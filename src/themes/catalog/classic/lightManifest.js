// Classic Light — Paper theme with floating bokeh dots.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-light',
  name: 'Paper',
  subtitle: 'Воздушная светлая',
  family: 'atmospheric',
  colorScheme: 'light',

  tokens: {
    '--orb-bg-rgb':       '248 249 252',
    '--orb-surface-rgb':  '255 255 255',
    '--orb-border-rgb':   '219 222 235',
    '--orb-text-rgb':     '17 22 46',
    '--orb-muted-rgb':    '108 115 142',
    '--orb-accent-rgb':   '59 130 246',
    '--orb-success-rgb':  '16 163 74',
    '--orb-danger-rgb':   '220 38 58'
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 45, mobile: 25, lowEnd: 10 }
  },

  background: () => import('./PaperBackground.jsx')
};

export default manifest;
