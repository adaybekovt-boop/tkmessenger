// Theme registry — lazy-loaded catalog of manifests.
//
// Every entry is a function that returns a dynamic import, so vite code-splits
// each theme (and its background component + assets) into its own chunk. The
// classic themes are bundled together because they're tiny (tokens only, no
// background) and the user almost certainly wants one of them as fallback.
//
// Legacy-id mapping lives here so the provider can silently upgrade old
// localStorage values without the user noticing. See LEGACY_THEME_MAP.

/** @type {Record<string, () => Promise<{default: import('./types.js').ThemeManifest}>>} */
const CATALOG = {
  // Four refreshed themes based on the 2026-04 design handoff. Graphite is
  // the "standard" default (from STANDART.HTML mockup); the others are each
  // paired with a dedicated Background component.
  'classic-graphite': () => import('./catalog/classic/graphiteManifest.js'),
  'classic-light':    () => import('./catalog/classic/lightManifest.js'),
  'classic-matrix':   () => import('./catalog/classic/matrixManifest.js'),
  'sakura-zen':       () => import('./catalog/atmospheric/sakuraZenManifest.js'),
};

/**
 * Legacy → current id map. Applied once when ThemeProvider reads localStorage
 * so a user who installed the old build keeps their preference.
 *
 * Historical ids come from two sources:
 *  - App.jsx: `obsidian`, `sakura`, `matrix` (via <html data-theme>)
 *  - themeManager.js: `sakura_zen`, `aurora_flow`, `retro_synth`, `matrix`,
 *    `obsidian`, `none`, plus its own legacy list (`aurora`, `stellar`, …)
 */
export const LEGACY_THEME_MAP = Object.freeze({
  // Retired Obsidian (classic-dark) and every pre-refresh dark theme fall back
  // to Graphite — the 2026-04 default.
  'classic-dark': 'classic-graphite',
  obsidian:       'classic-graphite',
  sakura:         'classic-graphite',
  matrix:         'classic-matrix',

  // From the (dead) themeManager catalog
  sakura_zen:  'sakura-zen',
  aurora_flow: 'classic-graphite',
  retro_synth: 'classic-graphite',
  none:        'classic-graphite',

  // From themeManager's own legacy map
  aurora:  'classic-graphite',
  stellar: 'classic-graphite',
  retro:   'classic-graphite',
  japan:   'classic-graphite',
  abyss:   'classic-graphite',
  draft:   'classic-graphite'
});

export const DEFAULT_THEME_ID = 'classic-graphite';

export function listThemeIds() {
  return Object.keys(CATALOG);
}

export function hasTheme(id) {
  return Object.prototype.hasOwnProperty.call(CATALOG, id);
}

/**
 * Resolve any historical id to a currently-valid manifest id. Idempotent:
 * passing an already-valid id returns it unchanged.
 */
export function canonicalizeThemeId(rawId) {
  if (!rawId || typeof rawId !== 'string') return DEFAULT_THEME_ID;
  if (hasTheme(rawId)) return rawId;
  const mapped = LEGACY_THEME_MAP[rawId];
  if (mapped && hasTheme(mapped)) return mapped;
  return DEFAULT_THEME_ID;
}

/**
 * Load a manifest by id. Falls back to DEFAULT_THEME_ID on any failure
 * so the UI is never stuck on a broken theme.
 *
 * @returns {Promise<import('./types.js').ThemeManifest>}
 */
export async function loadThemeManifest(id) {
  const canonical = canonicalizeThemeId(id);
  const loader = CATALOG[canonical] || CATALOG[DEFAULT_THEME_ID];
  try {
    const mod = await loader();
    return mod.default;
  } catch (err) {
    try { console.warn(`[themes] failed to load "${canonical}"`, err); } catch (_) {}
    if (canonical !== DEFAULT_THEME_ID) {
      // Try the fallback once, and give up if that fails too.
      const fb = await CATALOG[DEFAULT_THEME_ID]();
      return fb.default;
    }
    throw err;
  }
}
