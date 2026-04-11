// Classic Dark — the default Obsidian theme.
//
// Deep space background with twinkling stars and subtle nebula drift.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-dark',
  name: 'Obsidian',
  subtitle: 'Глубокий космос',
  family: 'atmospheric',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '5 5 10',
    '--orb-surface-rgb':  '11 11 18',
    '--orb-border-rgb':   '31 34 51',
    '--orb-text-rgb':     '231 233 255',
    '--orb-muted-rgb':    '165 168 199',
    '--orb-accent-rgb':   '59 130 246',
    '--orb-success-rgb':  '34 197 94',
    '--orb-danger-rgb':   '244 63 94'
  },

  performance: {
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticles: { desktop: 90, mobile: 50, lowEnd: 25 }
  },

  background: () => import('./ObsidianBackground.jsx')
};

export default manifest;
