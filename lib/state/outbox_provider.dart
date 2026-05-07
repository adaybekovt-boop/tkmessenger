// Global outbox stream — all pending messages across every peer, ordered by
// `timestamp ASC` so the retry worker processes them oldest-first. The JS
// codebase called this the "outbox drain loop" and it's the right shape for
// the Drift `watchPendingGlobal()` cursor.
//
// This provider is NOT autoDispose: the retry worker and the small outbox
// badge in the status pill are both long-lived subscribers. Tearing down and
// re-subscribing every time the chat screen unmounts would churn the Drift
// query cache for no benefit.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/db.dart' as db;

final outboxProvider = StreamProvider<List<Map<String, Object?>>>((ref) {
  return db.watchPendingGlobal();
});

/// Just the pending count, selected off the outbox stream. The status pill
/// only cares about the badge number, so `.select` avoids rebuilding it on
/// every row mutation when the count hasn't changed.
final outboxCountProvider = Provider<int>((ref) {
  final async = ref.watch(outboxProvider);
  return async.maybeWhen(data: (rows) => rows.length, orElse: () => 0);
});
