// Pure mapper for outbox/pending rows from IDB → UI outbox entries.
// Extracted from usePeer.js `loadPendingForPeer`.

export function pendingRowToOutboxEntry(row) {
  const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : null;
  if (!payload) return null;
  return {
    id: row.id,
    from: payload.from,
    to: payload.to,
    text: payload.text,
    ts: payload.ts,
    delivery: 'queued'
  };
}

export function pendingRowsToOutbox(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(pendingRowToOutboxEntry).filter(Boolean);
}
