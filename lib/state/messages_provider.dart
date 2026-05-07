// Reactive per-peer message stream. Keyed by peerId via `family` so opening
// two chats side-by-side (split view, future tablet layout) each get their
// own Drift subscription without interference.
//
// `autoDispose` is deliberate here — when the user closes a chat we don't
// want the query sitting around holding rows for every peer they've ever
// talked to. Riverpod tears the family entry down after a short grace period,
// and the next open re-subscribes cheaply.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/db.dart' as db;

/// The UI pages default to 50 rows in a chat; expose a matching family.
/// Additional screens that need more (search, export) should use
/// `messagesForPeerLimitedProvider` below.
final messagesForPeerProvider =
    StreamProvider.autoDispose.family<List<Map<String, Object?>>, String>(
  (ref, peerId) {
    if (peerId.isEmpty) return Stream.value(const []);
    return db.watchMessagesForPeer(peerId);
  },
);

/// Param bundle for the limit-aware variant. Using a record keeps the family
/// key equatable without a hand-rolled `==` + `hashCode`.
typedef MessagesKey = ({String peerId, int limit});

final messagesForPeerLimitedProvider = StreamProvider.autoDispose
    .family<List<Map<String, Object?>>, MessagesKey>((ref, key) {
  if (key.peerId.isEmpty) return Stream.value(const []);
  return db.watchMessagesForPeer(key.peerId, limit: key.limit);
});

/// Reactive pending ("still in outbox, not yet acked") messages for a peer.
/// Chat pages use this to render the orange "pending" badge without taking
/// the full message history into their own state.
final pendingForPeerProvider =
    StreamProvider.autoDispose.family<List<Map<String, Object?>>, String>(
  (ref, peerId) {
    if (peerId.isEmpty) return Stream.value(const []);
    return db.watchPendingForPeer(peerId);
  },
);
