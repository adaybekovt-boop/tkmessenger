// Port of `src/messaging/messageMapper.js`.
//
// Pure mapper: persisted message row (from `storage/db.dart::getMessages`)
// → in-memory UI message shape used by the chats screen. Extracted in the
// JS codebase from `usePeer.js` (`onOpen` history loader + `loadMoreMessages`)
// so it could be unit-tested without the hook. The Dart port keeps the same
// split so the eventual Riverpod-backed chat notifier can reuse these
// mappers verbatim.
//
// Port choices that deviate from the literal JS:
// - JS uses plain objects; Dart uses `Map<String, Object?>` (aliased to
//   `JsonMap` to match `message_protocol.dart`).
// - `row.payload` comes off Drift as a decoded map (see
//   `storage/row_codec.dart`); the JS `typeof row.payload === 'object'`
//   guard becomes `row['payload'] is Map`.
// - `.filter(Boolean)` drops `null`s returned by [rowToUiMessage]; in Dart
//   we use `whereType<JsonMap>()` which preserves the exact semantics
//   (`null`s eliminated, everything else kept).
// - Sort comparator uses `int` subtraction on timestamps (ms since epoch);
//   JS used plain subtraction which is the same thing for our range.

typedef JsonMap = Map<String, Object?>;

/// Derive the UI delivery status from an IDB/Drift message row.
/// `direction == 'in'` always maps to `received`; outbound rows map their
/// `status` field into the delivery flag the UI understands.
String rowToDelivery(JsonMap? row) {
  if (row == null) return 'queued';
  if (row['direction'] == 'in') return 'received';
  switch (row['status']) {
    case 'pending':
      return 'queued';
    case 'delivered':
    case 'read':
      return 'delivered';
    case 'sent':
      return 'sent';
    default:
      return 'queued';
  }
}

/// Convert a persisted row to the UI message shape used by the chats screen.
/// Returns `null` if the row has no payload object.
JsonMap? rowToUiMessage(JsonMap? row) {
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
    'delivery': rowToDelivery(row),
    // JS used `payload.type || 'text'` — a falsy-coerce, so empty strings
    // fall back to 'text'. `??` alone would let `''` through.
    'type': (payload['type'] is String && (payload['type'] as String).isNotEmpty)
        ? payload['type']
        : 'text',
    'sticker': payload['sticker'],
    'replyTo': payload['replyTo'],
    'voice': payload['voice'],
    'attachment': payload['attachment'],
    'editedAt': payload['editedAt'],
  };
}

/// Map a list of persisted rows to sorted UI messages (oldest first).
/// Invalid rows are dropped silently.
List<JsonMap> rowsToSortedUiMessages(List<JsonMap>? rows) {
  if (rows == null) return <JsonMap>[];
  final mapped = rows
      .map(rowToUiMessage)
      .whereType<JsonMap>()
      .toList(growable: true);
  mapped.sort((a, b) {
    final at = a['ts'] is num ? (a['ts'] as num).toInt() : 0;
    final bt = b['ts'] is num ? (b['ts'] as num).toInt() : 0;
    return at - bt;
  });
  return mapped;
}
