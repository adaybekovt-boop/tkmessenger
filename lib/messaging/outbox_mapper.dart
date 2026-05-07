// Port of `src/messaging/outboxMapper.js`.
//
// Pure mapper for pending rows from the messages table (see
// `storage/db.dart::getPendingMessages`) → UI outbox entries. Extracted in
// the JS codebase from `usePeer.js::loadPendingForPeer`; kept split here so
// the eventual Riverpod-backed outbox state can reuse the exact mapping
// without pulling in the peer hook.
//
// Port choices that deviate from the literal JS:
// - JS plain objects → Dart `Map<String, Object?>` (aliased `JsonMap`).
// - `typeof row.payload === 'object'` → `row['payload'] is Map`.
// - `.filter(Boolean)` → `whereType<JsonMap>()` to drop `null`s returned
//   by [pendingRowToOutboxEntry] while keeping everything else.

typedef JsonMap = Map<String, Object?>;

/// Map one pending row to the minimal outbox shape the UI displays
/// alongside queued messages. Returns `null` if the row has no payload.
JsonMap? pendingRowToOutboxEntry(JsonMap? row) {
  if (row == null) return null;
  final payloadRaw = row['payload'];
  final payload =
      payloadRaw is Map ? Map<String, Object?>.from(payloadRaw) : null;
  if (payload == null) return null;
  return <String, Object?>{
    'id': row['id'],
    'from': payload['from'],
    'to': payload['to'],
    'text': payload['text'],
    'ts': payload['ts'],
    'delivery': 'queued',
  };
}

/// Map a list of pending rows to UI outbox entries. Invalid rows are
/// dropped silently.
List<JsonMap> pendingRowsToOutbox(List<JsonMap>? rows) {
  if (rows == null) return <JsonMap>[];
  return rows
      .map(pendingRowToOutboxEntry)
      .whereType<JsonMap>()
      .toList(growable: true);
}
