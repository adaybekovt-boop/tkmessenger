// Riverpod state holder for the active theme id. Equivalent to the JS
// `ThemeProvider` context — keeps the picker, the persisted preference,
// and the live `ThemeData` in lockstep.
//
// Storage:
//   - SharedPreferences key `orbits_theme` (constant in `registry.dart`)
//   - Same key the JS app uses on web localStorage, so a user moving
//     between Flutter and the React build keeps their pick.
//
// Surface:
//   - `themeNotifierProvider` — `AsyncNotifier<String>` that the app reads
//     to drive `MaterialApp.theme`. The `String` is the canonical id
//     (e.g. `'classic-graphite'`).
//   - `themeManifestProvider` — convenience derived provider that maps the
//     active id to its `ThemeManifest`. Most consumers should read this.
//
// Migration of legacy ids happens once on first read: whatever's persisted
// gets fed through `canonicalizeThemeId`, and if the result differs from
// what was on disk we silently rewrite it. After that the round-trip is a
// no-op.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'manifest.dart';
import 'registry.dart';

/// Holds the canonical id of the active theme. Mutate via [setThemeId].
class ThemeNotifier extends AsyncNotifier<String> {
  @override
  Future<String> build() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(themePrefsKey);
    final canonical = canonicalizeThemeId(raw);

    // If we just upgraded a legacy id (`obsidian` → `classic-graphite`),
    // rewrite storage so we don't keep doing the dance on every cold start.
    if (raw != null && raw != canonical) {
      // Fire-and-forget: persistence is best-effort, the in-memory state
      // is already correct.
      // ignore: discarded_futures
      prefs.setString(themePrefsKey, canonical);
    }
    return canonical;
  }

  /// Switch to a new theme. Unknown ids are coerced through
  /// `canonicalizeThemeId` so we can never get stuck on a broken id.
  Future<void> setThemeId(String id) async {
    final canonical = canonicalizeThemeId(id);
    state = AsyncData(canonical);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(themePrefsKey, canonical);
  }
}

/// Provider for the active theme id. Returns the canonical id once
/// SharedPreferences has been read; until then exposes
/// `AsyncValue.loading()`.
final themeNotifierProvider =
    AsyncNotifierProvider<ThemeNotifier, String>(ThemeNotifier.new);

/// Convenience: the active manifest, or the default while loading. Most
/// consumers want this — they don't care about the loading distinction.
final themeManifestProvider = Provider<ThemeManifest>((ref) {
  final asyncId = ref.watch(themeNotifierProvider);
  final id = asyncId.value ?? defaultThemeId;
  return loadThemeManifest(id);
});
