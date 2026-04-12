// ProximityRanker — pure function that sorts presence entries by RTT and
// tags each with a bucket used by the mini-radar screen to place dots on
// concentric rings.
//
// Thresholds are chosen for "same LAN feels instant, same city feels fine,
// different continent feels present-but-distant". They're cheap to tune.

const NEAR_MAX_MS = 50;
const MID_MAX_MS = 200;

/** @returns {'near' | 'mid' | 'far'} */
export function classifyRtt(rtt) {
  if (rtt == null || !Number.isFinite(rtt)) return 'far';
  if (rtt <= NEAR_MAX_MS) return 'near';
  if (rtt <= MID_MAX_MS) return 'mid';
  return 'far';
}

/**
 * Return a sorted copy of `entries`. Entries with a known RTT come first,
 * ordered ascending; unknown RTT falls back to lastSeenAt.
 *
 * @param {Array<{id: string, rtt?: number, lastSeenAt?: number}>} entries
 */
export function rankByProximity(entries) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  for (const e of list) {
    e.bucket = classifyRtt(e.rtt);
  }
  list.sort((a, b) => {
    const ar = a.rtt == null ? Number.POSITIVE_INFINITY : a.rtt;
    const br = b.rtt == null ? Number.POSITIVE_INFINITY : b.rtt;
    if (ar !== br) return ar - br;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });
  return list;
}
