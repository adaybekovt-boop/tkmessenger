// Classic Light — freshly authored counterpart to classic-dark.
//
// Keeps the exact same hue family as Obsidian (#3b82f6 blue accent) and
// mirrors the same contrast ratios, just inverted. Success/danger stay
// recognisable across both schemes.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-light',
  name: 'Paper',
  subtitle: 'Классическая светлая',
  family: 'classic',
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

  background: null
};

export default manifest;
