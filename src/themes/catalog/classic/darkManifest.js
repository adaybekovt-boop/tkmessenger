// Classic Dark — clean dark theme with indigo-purple accent gradients.
//
// Deep blue-tinted background, vibrant indigo→purple gradients on
// user bubbles and key actions. Inspired by modern messenger aesthetics.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-dark',
  name: 'Obsidian',
  subtitle: 'Градиент',
  family: 'classic',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '10 10 20',
    '--orb-surface-rgb':  '22 22 38',
    '--orb-border-rgb':   '45 45 65',
    '--orb-text-rgb':     '240 240 250',
    '--orb-muted-rgb':    '140 140 175',
    '--orb-accent-rgb':   '99 102 241',
    '--orb-accent2-rgb':  '147 51 234',
    '--orb-success-rgb':  '34 197 94',
    '--orb-danger-rgb':   '244 63 94'
  },

  performance: {
    minFPS: 60,
    degradeOnLowBattery: false,
    maxParticles: { desktop: 0, mobile: 0, lowEnd: 0 }
  },

  // No animated background — pure solid color for maximum performance and calm
  background: null
};

export default manifest;
