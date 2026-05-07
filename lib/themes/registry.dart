// Theme registry — Flutter port of `git_push/src/themes/registry.js`.
//
// JS code-splits each manifest behind a dynamic `import()`. On Flutter every
// manifest is part of the same bundle (no chunk-splitting on the web build
// today; all themes are tiny anyway), so the catalog is a simple `const`
// map. That also means `loadThemeManifest` is synchronous — no `Future`,
// no error-recovery dance.
//
// `canonicalizeThemeId` keeps doing the same job as JS: any historical id
// from older builds (`obsidian`, `sakura`, `aurora`, …) maps to the closest
// 2026-04 equivalent so users who upgrade don't land on a broken theme.

import 'manifest.dart';
import 'catalog/atmospheric/sakura_zen_manifest.dart';
import 'catalog/classic/graphite_manifest.dart';
import 'catalog/classic/light_manifest.dart';
import 'catalog/classic/matrix_manifest.dart';

/// Stable id of the theme used when the user has never picked one (or when
/// the persisted id can't be resolved). Matches JS `DEFAULT_THEME_ID`.
const String defaultThemeId = 'classic-graphite';

/// SharedPreferences key holding the user's persisted choice. Same value
/// as the JS localStorage key so a cross-platform user shares preferences.
const String themePrefsKey = 'orbits_theme';

/// id → manifest. Ordering here drives ordering in the picker. Mirrors the
/// JS `CATALOG` object (with an unhelpful map type in JS, here typed for us).
///
/// Const because every manifest is itself const — each one's `background:`
/// is a top-level function tear-off (`_buildGraphite`, …) which Dart treats
/// as a compile-time constant. The function bodies still close over the
/// matching `graphiteManifest` (etc.) without breaking const evaluation.
const Map<String, ThemeManifest> themeCatalog = <String, ThemeManifest>{
  'classic-graphite': graphiteManifest,
  'classic-light': paperManifest,
  'classic-matrix': matrixManifest,
  'sakura-zen': sakuraZenManifest,
};

/// Legacy → current id mapping. Applied once on read so a user with an old
/// `localStorage.orbits_theme = 'obsidian'` keeps a working theme.
///
/// Sources of legacy ids (per the JS `registry.js` audit):
///  - `App.jsx`         — `obsidian`, `sakura`, `matrix`
///  - `themeManager.js` — `sakura_zen`, `aurora_flow`, `retro_synth`,
///                        `matrix`, `obsidian`, `none`
///  - themeManager's own legacy list — `aurora`, `stellar`, `retro`, `japan`,
///    `abyss`, `draft`
const Map<String, String> legacyThemeMap = <String, String>{
  // Retired pre-refresh dark themes → Graphite (the 2026-04 default).
  'classic-dark': 'classic-graphite',
  'obsidian': 'classic-graphite',
  'sakura': 'classic-graphite',
  'matrix': 'classic-matrix',

  // From the (now-dead) themeManager catalog.
  'sakura_zen': 'sakura-zen',
  'aurora_flow': 'classic-graphite',
  'retro_synth': 'classic-graphite',
  'none': 'classic-graphite',

  // From themeManager's own legacy fallbacks.
  'aurora': 'classic-graphite',
  'stellar': 'classic-graphite',
  'retro': 'classic-graphite',
  'japan': 'classic-graphite',
  'abyss': 'classic-graphite',
  'draft': 'classic-graphite',
};

/// All currently-valid theme ids in catalog order.
List<String> listThemeIds() => themeCatalog.keys.toList(growable: false);

/// `true` if [id] is a *current* (not legacy) theme.
bool hasTheme(String id) => themeCatalog.containsKey(id);

/// Resolve any historical id to a current manifest id. Idempotent: passing
/// an already-valid id returns it unchanged. Empty/unknown → [defaultThemeId].
String canonicalizeThemeId(String? rawId) {
  if (rawId == null || rawId.isEmpty) return defaultThemeId;
  if (hasTheme(rawId)) return rawId;
  final mapped = legacyThemeMap[rawId];
  if (mapped != null && hasTheme(mapped)) return mapped;
  return defaultThemeId;
}

/// Load a manifest by id. Falls back to [defaultThemeId] if the id resolves
/// to nothing — there's no scenario where we hand back null and let the
/// caller crash.
ThemeManifest loadThemeManifest(String? id) {
  final canonical = canonicalizeThemeId(id);
  return themeCatalog[canonical] ?? themeCatalog[defaultThemeId]!;
}
