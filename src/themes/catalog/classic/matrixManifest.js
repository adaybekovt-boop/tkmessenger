// Matrix — falling green character rain (Canvas-based).

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-matrix',
  name: 'Matrix',
  subtitle: 'Цифровой дождь',
  family: 'atmospheric',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '3 8 5',
    '--orb-surface-rgb':  '7 16 10',
    '--orb-border-rgb':   '17 48 28',
    '--orb-text-rgb':     '222 255 235',
    '--orb-muted-rgb':    '134 202 165',
    '--orb-accent-rgb':   '34 197 94',
    '--orb-success-rgb':  '34 197 94',
    '--orb-danger-rgb':   '244 63 94'
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 80, mobile: 40, lowEnd: 0 }
  },

  background: () => import('./MatrixBackground.jsx')
};

export default manifest;
