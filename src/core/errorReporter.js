// Centralised frontend error reporting. Captures:
//   - React component errors (via ErrorBoundary)
//   - Uncaught synchronous errors (window.error)
//   - Unhandled promise rejections
//
// By default all errors are logged to the console. External sinks (Sentry,
// Rollbar, custom analytics endpoint) can be registered with `registerSink`
// without touching call sites.

const sinks = new Set();
let installed = false;

/** Register an external error sink. Returns an unsubscribe function. */
export function registerSink(fn) {
  if (typeof fn !== 'function') return () => {};
  sinks.add(fn);
  return () => sinks.delete(fn);
}

/**
 * Emit an error to all registered sinks plus the console. Safe to call from
 * anywhere — sink failures are swallowed so reporting never crashes the app.
 */
export function reportError(error, extra) {
  const payload = {
    message: String(error?.message || error || 'Unknown error'),
    stack: error?.stack || null,
    timestamp: Date.now(),
    url: typeof window !== 'undefined' ? window.location?.href : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
  try {
    if (typeof console !== 'undefined') {
      console.error('[orbits]', payload.message, error, extra);
    }
  } catch (_) {}
  for (const sink of sinks) {
    try { sink(payload, error); } catch (_) {}
  }
  return payload;
}

/**
 * Wire `window.error` and `unhandledrejection` to reportError(). Idempotent —
 * safe to call multiple times (e.g. from HMR).
 */
export function installGlobalHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (ev) => {
    // ResourceLoadError from <img>/<script> etc. has `ev.error === null` —
    // skip those to avoid noise; a real JS error always sets `ev.error`.
    if (!ev?.error) return;
    reportError(ev.error, { source: 'window.error', filename: ev.filename, lineno: ev.lineno });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    reportError(reason instanceof Error ? reason : new Error(String(reason)),
      { source: 'unhandledrejection' });
  });
}

/**
 * Serialise a report into plain text for user-visible copy-to-clipboard.
 * Intentionally strips anything that could contain secrets (no full payload
 * dump — just message + stack + basic context).
 */
export function formatReportForClipboard(payload) {
  if (!payload) return '';
  const lines = [
    `Orbits error @ ${new Date(payload.timestamp || Date.now()).toISOString()}`,
    `URL: ${payload.url || 'n/a'}`,
    `UA:  ${payload.userAgent || 'n/a'}`,
    '',
    `Message: ${payload.message}`,
  ];
  if (payload.stack) {
    lines.push('', 'Stack:', String(payload.stack).split('\n').slice(0, 20).join('\n'));
  }
  return lines.join('\n');
}
