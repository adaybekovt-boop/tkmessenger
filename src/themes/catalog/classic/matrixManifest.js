// Classic Matrix — bit-for-bit equivalent to the old
// `html[data-theme='matrix']` block in src/styles/index.css. Still classic
// (tokens only, no background), atmospheric Matrix‑style themes (Glitch
// Realm) ship as their own manifests later.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-matrix',
  name: 'Matrix',
  subtitle: 'Изумрудный тёмный',
  family: 'classic',
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

  background: null
};

export default manifest;
