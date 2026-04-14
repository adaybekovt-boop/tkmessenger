// Maps raw DOMException from getUserMedia / getDisplayMedia into our typed
// CallError hierarchy. The browser-specific names are centralised here so the
// rest of the call module never needs to know about `NotAllowedError` strings.

import {
  CallError,
  PermissionDeniedError,
  DeviceNotFoundError,
  DeviceBusyError
} from './CallError.js';

/**
 * @param {unknown} err          — whatever was thrown by getUserMedia/getDisplayMedia
 * @param {'camera'|'microphone'|'media'|'screen'} kind
 * @returns {CallError}
 */
export function mapMediaError(err, kind = 'media') {
  if (err instanceof CallError) return err;

  const name = err?.name || '';
  const cause = err instanceof Error ? err : undefined;

  // NotAllowedError  — user denied the prompt (or browser policy)
  // SecurityError    — e.g. getUserMedia on non-secure origin
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new PermissionDeniedError(kind, { cause });
  }

  // NotFoundError / OverconstrainedError — no matching device
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return new DeviceNotFoundError(kind, { cause });
  }

  // NotReadableError — device busy (OS has it locked, e.g. another tab)
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new DeviceBusyError(kind, { cause });
  }

  const msg = (err && typeof err === 'object' && 'message' in err && err.message) || 'unknown media error';
  return new CallError(String(msg), { cause });
}
