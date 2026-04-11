// Pure mapper: IDB message row → in-memory UI message shape.
// Extracted from usePeer.js (onOpen history loader + loadMoreMessages).

/**
 * Derive the UI delivery status from an IDB message row.
 * `direction === 'in'` always maps to `received`; outbound rows map their
 * `status` field into the delivery flag the UI understands.
 */
export function rowToDelivery(row) {
  if (!row) return 'queued';
  if (row.direction === 'in') return 'received';
  switch (row.status) {
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

/**
 * Convert a persisted IDB row to the UI message shape used by Chats.jsx.
 * Returns `null` if the row has no payload object.
 */
export function rowToUiMessage(row) {
  const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : null;
  if (!payload) return null;
  return {
    id: row.id,
    from: payload.from,
    to: payload.to,
    text: payload.text,
    ts: payload.ts,
    delivery: rowToDelivery(row),
    type: payload.type || 'text',
    sticker: payload.sticker || null,
    replyTo: payload.replyTo || null,
    voice: payload.voice || null,
    editedAt: payload.editedAt || null
  };
}

/**
 * Map an array of IDB rows to sorted UI messages (oldest first).
 * Invalid rows are dropped silently.
 */
export function rowsToSortedUiMessages(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(rowToUiMessage)
    .filter(Boolean)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
