// Reactive list of known peers. Wraps the Drift `watchAllPeers()` stream in
// a StreamProvider so widgets (chat list, contacts screen, pickers) don't
// have to manage StreamBuilders or keep stale local copies.
//
// The stream stays live for as long as at least one widget is listening; when
// the last listener drops, Riverpod cancels the subscription automatically
// which in turn tells Drift to close the underlying query. Re-subscribing is
// cheap — Drift caches the compiled SELECT.
//
// Rows are emitted as the same raw `Map<String, Object?>` shape the rest of
// the app already uses (decoded peer.data JSON). Typed wrappers (Peer class,
// ChatSummary, etc.) live one layer up so we don't recreate them on every
// stream tick.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/db.dart' as db;

final peersProvider = StreamProvider<List<Map<String, Object?>>>((ref) {
  return db.watchAllPeers();
});
