// Background prekey maintenance.
//
// Runs two things on startup and then periodically:
//   1. `ensurePrekeysReady()` — rotates the signed prekey if it's older than
//      the rotation window and tops the OPK pool back up to the target count.
//   2. Pruning: drops retired SPKs past the grace window and used OPKs past
//      their retention. These rows are only kept around to decrypt late
//      inbound messages; hanging onto them forever is a forward-secrecy foot
//      gun and a slow IDB leak.
//
// The maintenance loop is idempotent and safe to kick off more than once,
// but only the first call actually starts the interval. Call
// `stopPrekeyMaintenance()` on logout / vault lock so a new identity's schedule
// is not tangled with the previous one.

import { ensurePrekeysReady, pruneRetiredSPKs, pruneUsedOPKs } from './prekeyStore.js';

// Real-world cadence: check once an hour. The actual rotation work inside
// `ensurePrekeysReady` only fires when the SPK is > 7 days old or the OPK
// pool has dipped below the floor, so 99% of ticks are near-free lookups.
const TICK_MS = 60 * 60 * 1000;

let timer = null;
let running = false;

async function runOnce() {
  if (running) return; // A previous tick is still in flight — skip.
  running = true;
  try {
    await ensurePrekeysReady();
    await pruneRetiredSPKs();
    await pruneUsedOPKs();
  } catch (err) {
    try { console.warn('[prekey-maint] tick failed', err); } catch (_) {}
  } finally {
    running = false;
  }
}

/**
 * Kick off maintenance. Runs one tick immediately (so a freshly unlocked
 * profile with no prekeys at all gets bootstrapped before the first outgoing
 * bundle_req lands) and schedules subsequent ticks every hour.
 *
 * Returns a promise that resolves when the initial tick finishes — callers
 * that want to hand out a fresh bundle right away can await it.
 */
export function startPrekeyMaintenance({ tickMs = TICK_MS } = {}) {
  if (timer) return Promise.resolve();
  const firstTick = runOnce();
  timer = setInterval(() => { void runOnce(); }, tickMs);
  return firstTick;
}

/** Stop the interval. Safe to call even if nothing was running. */
export function stopPrekeyMaintenance() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Exposed for tests so they can drive a tick deterministically without waiting.
export async function __tickForTests() {
  await runOnce();
}

export function __isRunningForTests() {
  return !!timer;
}
