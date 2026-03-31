/**
 * performance.mark/measure, long-task observer, optional FPS overlay (dev).
 */
const DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export function mark(name) {
  try {
    performance.mark(name);
  } catch (_) {}
}

export function measure(label, start, end) {
  try {
    performance.measure(label, start, end);
    if (DEV && performance.getEntriesByName(label, 'measure').length) {
      const m = performance.getEntriesByName(label, 'measure').pop();
      if (m?.duration > 16) console.warn(`[perf] ${label}: ${m.duration.toFixed(1)}ms`);
    }
  } catch (_) {}
}

export function initLongTaskObserver(onLong) {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 50) onLong?.(e);
      }
    });
    po.observe({ entryTypes: ['longtask'] });
    return () => po.disconnect();
  } catch (_) {
    return () => {};
  }
}

let _fpsRaf = 0;
let _fpsLast = 0;
let _fpsFrames = 0;
let _fpsEl = null;

export function startFpsOverlay() {
  if (!DEV) return () => {};
  _fpsEl = document.createElement('div');
  _fpsEl.style.cssText =
    'position:fixed;bottom:4px;left:4px;z-index:99999;font:11px monospace;background:#000a;color:#0f0;padding:2px 6px;border-radius:4px;pointer-events:none;';
  document.body.appendChild(_fpsEl);
  _fpsLast = performance.now();
  function tick(t) {
    _fpsFrames++;
    if (t - _fpsLast >= 1000) {
      const fps = Math.round((_fpsFrames * 1000) / (t - _fpsLast));
      if (_fpsEl) _fpsEl.textContent = `FPS ~${fps}`;
      _fpsFrames = 0;
      _fpsLast = t;
    }
    _fpsRaf = requestAnimationFrame(tick);
  }
  _fpsRaf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(_fpsRaf);
    _fpsEl?.remove();
    _fpsEl = null;
  };
}

const _isLocalhost =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

let _baselineHeap = null;

/**
 * Dev / localhost overlay: FPS, JS heap (if available), connections, visible rows.
 */
export function startDevPerfOverlay(getters) {
  const enabled = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) || _isLocalhost;
  if (!enabled) return () => {};

  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;bottom:4px;left:4px;z-index:99999;font:10px monospace;background:#000c;color:#9f9;padding:6px 8px;border-radius:6px;pointer-events:none;max-width:min(96vw,420px);line-height:1.35;';
  document.body.appendChild(el);

  let raf = 0;
  let last = performance.now();
  let frames = 0;

  function tick(t) {
    frames++;
    if (t - last >= 1000) {
      const fps = Math.round((frames * 1000) / (t - last));
      frames = 0;
      last = t;
      const mem = performance.memory;
      const used = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
      const total = mem ? Math.round(mem.totalJSHeapSize / 1048576) : null;
      if (_baselineHeap == null && used != null) _baselineHeap = used;
      const growth = (used != null && _baselineHeap != null) ? used - _baselineHeap : 0;
      const lines = [
        `FPS ~${fps}`,
        used != null ? `Heap ${used}/${total} MB` : 'Heap n/a',
        growth !== 0 ? `Δheap ${growth >= 0 ? '+' : ''}${growth}MB` : '',
        `Conn ${getters.getActiveConnections?.() ?? '?'}`,
        `DOM rows ${getters.getRenderedDomCount?.() ?? '?'}`,
        `Model ${getters.getMessageModelCount?.() ?? '?'}`,
      ].filter(Boolean);
      el.textContent = lines.join(' · ');
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.remove();
  };
}
