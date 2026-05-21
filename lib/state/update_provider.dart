// Riverpod glue for the in-app update checker.
//
// `updateCheckProvider` kicks off a single GitHub-API check the first
// time anything in the tree watches it (the AppShell does, post-auth).
// The future never throws — it resolves to `null` for "no update" and
// to an `UpdateInfo` when there's a newer release. Both error and
// no-update cases collapse to `null` so the UI side stays simple.
//
// Dismissal is persisted in SharedPreferences: when the user taps
// «Позже» on the dialog we remember the version they skipped, and on
// the next launch the provider hides updates for that exact version.
// Bumping the release tag (e.g. 0.2.0 → 0.2.1) shows the prompt again
// — we never silently suppress a *new* update because of an old skip.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/update_checker.dart';

/// SharedPreferences key for "the user tapped «Позже» on this version".
/// Storing it as a plain string under the orbits namespace keeps it
/// alongside the other non-secret prefs.
const String _kSkippedVersionPrefKey = 'orbits_update_skipped_version';

final updateCheckProvider = FutureProvider<UpdateInfo?>((ref) async {
  final info = await checkForUpdate();
  if (info == null) return null;

  // Honour a previous "Позже" — only if the skipped version exactly
  // matches the latest. Any version drift past the skipped one re-
  // surfaces the dialog, so users on slightly older skipped versions
  // still see future updates.
  final prefs = await SharedPreferences.getInstance();
  final skipped = prefs.getString(_kSkippedVersionPrefKey);
  if (skipped != null && skipped == info.version) return null;

  return info;
});

/// Persist the «Позже» decision. Called from the update dialog when
/// the user dismisses; survives app restarts.
Future<void> markUpdateSkipped(String version) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_kSkippedVersionPrefKey, version);
}

/// Clear the skipped-version memory. Useful from settings ("проверить
/// обновления заново") if we ever wire that button.
Future<void> clearUpdateSkipped() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(_kSkippedVersionPrefKey);
}
