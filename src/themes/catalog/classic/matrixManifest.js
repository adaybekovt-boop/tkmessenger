// Matrix — falling green character rain (Canvas-based).

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-matrix',
  name: 'Matrix',
  subtitle: 'Цифровой дождь',
  family: 'atmospheric',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '5 10 7',
    '--orb-surface-rgb':  '10 20 14',
    '--orb-border-rgb':   '24 56 35',
    '--orb-text-rgb':     '240 255 245',
    '--orb-muted-rgb':    '160 215 180',
    '--orb-accent-rgb':   '34 197 94',
    '--orb-success-rgb':  '34 197 94',
    '--orb-danger-rgb':   '244 63 94'
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 40, mobile: 20, lowEnd: 0 }
  },

  background: () => import('./MatrixBackground.jsx')
};

export default manifest;
