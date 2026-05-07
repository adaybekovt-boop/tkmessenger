// Thin derived provider. `authNotifierProvider` already holds the full auth
// state machine; the rest of the widget tree almost never cares whether the
// user is loading/guest/locked — it just wants «who is the current user, or
// nobody». This provider exposes `AuthedUser?` so chat/peer layers can read
// it with a one-liner and auto-rebuild on login/logout without importing the
// sealed state types.
//
// Mirrors the JS `useAuth()` hook's `user` field (context is the
// authenticated user object, or `null`).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_notifier.dart';

final localProfileProvider = Provider<AuthedUser?>((ref) {
  final state = ref.watch(authNotifierProvider);
  return switch (state) {
    AuthAuthed(:final user) => user,
    _ => null,
  };
});

/// Convenience: current peerId, or null if not authed. Saves readers from
/// double-reading `localProfileProvider?.peerId` when they only need the id.
final currentPeerIdProvider = Provider<String?>((ref) {
  return ref.watch(localProfileProvider.select((u) => u?.peerId));
});
