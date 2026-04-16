// applyTokens — writes a theme manifest's CSS variables onto <html>.
//
// We intentionally *don't* use a class-based scoping approach (`.theme-xyz`)
// because most existing code reads tokens via `rgb(var(--orb-accent-rgb))`,
// which cannot live inside a scoped selector without extra machinery. The
// variables sit on `<html>` so every descendant picks them up transparently.
//
// Three sub-groups are applied:
//   1. `tokens.*`         — raw --orb-* vars (colour palette, opacity)
//   2. `shape.*`          — radii, shadows, blur
//   3. `typography.*`     — font-family, letter-spacing, line-height
//
// We also snapshot which keys we wrote so the next apply can cleanly remove
// stale vars (otherwise a theme that defines --orb-glow-rgb leaves it
// leaking when you switch to a theme that doesn't).

const WRITTEN_KEYS = new Set();

/**
 * @param {import('./types.js').ThemeManifest} manifest
 */
export function applyThemeTokens(manifest) {
  if (typeof document === 'undefined' || !manifest) return;
  const root = document.documentElement;
  if (!root || !root.style) return;

  // 1. Clear anything we wrote last time but the new manifest doesn't declare.
  const next = collectKeys(manifest);
  for (const key of WRITTEN_KEYS) {
    if (!next.has(key)) {
      root.style.removeProperty(key);
    }
  }
  WRITTEN_KEYS.clear();

  // 2. Write fresh vars.
  if (manifest.tokens) {
    for (const [key, value] of Object.entries(manifest.tokens)) {
      if (!key || value == null) continue;
      const cssKey = key.startsWith('--') ? key : `--${key}`;
      root.style.setProperty(cssKey, String(value));
      WRITTEN_KEYS.add(cssKey);
    }
  }

  if (manifest.shape) {
    const s = manifest.shape;
    setVar(root, '--orb-radius-button', s.radiusButton);
    setVar(root, '--orb-radius-card', s.radiusCard);
    setVar(root, '--orb-radius-modal', s.radiusModal);
    setVar(root, '--orb-shadow-card', s.shadowCard);
    setVar(root, '--orb-blur-surface', s.blurSurface);
  }

  if (manifest.typography) {
    const t = manifest.typography;
    setVar(root, '--orb-font-heading', t.fontHeading);
    setVar(root, '--orb-font-body', t.fontBody);
    setVar(root, '--orb-font-mono', t.fontMono);
    setVar(root, '--orb-letter-spacing-heading', t.letterSpacingHeading);
    if (t.lineHeightBody != null) {
      setVar(root, '--orb-line-height-body', String(t.lineHeightBody));
    }
  }

  // 3. Bookkeeping on <html> itself so selectors like
  //    `html[data-theme='sakura-zen']` or `html[data-theme-family='classic']`
  //    can still target specific themes for one-off CSS tweaks if needed.
  root.dataset.theme = manifest.id;
  if (manifest.family) root.dataset.themeFamily = manifest.family;
  if (manifest.colorScheme) root.style.colorScheme = manifest.colorScheme;
}

/** Strip every variable we've written so far. Used by the provider on unmount. */
export function clearThemeTokens() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root || !root.style) return;
  for (const key of WRITTEN_KEYS) {
    root.style.removeProperty(key);
  }
  WRITTEN_KEYS.clear();
}

function setVar(root, cssKey, value) {
  if (value == null || value === '') return;
  root.style.setProperty(cssKey, String(value));
  WRITTEN_KEYS.add(cssKey);
}

/** Compute the set of keys a manifest will write, for stale-cleanup. */
function collectKeys(manifest) {
  const keys = new Set();
  if (manifest.tokens) {
    for (const k of Object.keys(manifest.tokens)) {
      keys.add(k.startsWith('--') ? k : `--${k}`);
    }
  }
  const s = manifest.shape || {};
  if (s.radiusButton) keys.add('--orb-radius-button');
  if (s.radiusCard) keys.add('--orb-radius-card');
  if (s.radiusModal) keys.add('--orb-radius-modal');
  if (s.shadowCard) keys.add('--orb-shadow-card');
  if (s.blurSurface) keys.add('--orb-blur-surface');
  const t = manifest.typography || {};
  if (t.fontHeading) keys.add('--orb-font-heading');
  if (t.fontBody) keys.add('--orb-font-body');
  if (t.fontMono) keys.add('--orb-font-mono');
  if (t.letterSpacingHeading) keys.add('--orb-letter-spacing-heading');
  if (t.lineHeightBody != null) keys.add('--orb-line-height-body');
  return keys;
}
