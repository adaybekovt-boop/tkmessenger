// Classic Dark — clean minimalist dark theme.
//
// Pure black background (#050505), calm and spacious design.
// No particles, no glow, no visual noise — premium minimalism.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-dark',
  name: 'Obsidian',
  subtitle: 'Минимализм',
  family: 'classic',
  colorScheme: 'dark',

  tokens: {
    '--orb-bg-rgb':       '5 5 5',
    '--orb-surface-rgb':  '18 18 18',
    '--orb-border-rgb':   '38 38 42',
    '--orb-text-rgb':     '235 235 240',
    '--orb-muted-rgb':    '140 140 155',
    '--orb-accent-rgb':   '90 120 160',
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
