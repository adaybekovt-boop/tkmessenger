// Classic Dark — the default. Values are bit-for-bit identical to the old
// `:root` + `html[data-theme='obsidian']` CSS block in src/styles/index.css,
// so users who upgrade from the old theme system see zero visual change.
//
// This manifest has no background component — the radial-gradient fallback
// baked into index.css `html { background: ... }` still runs.

/** @type {import('../../types.js').ThemeManifest} */
const manifest = {
  id: 'classic-dark',
  name: 'Obsidian',
  subtitle: 'Классическая тёмная',
  family: 'classic',
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

  background: null
};

export default manifest;
