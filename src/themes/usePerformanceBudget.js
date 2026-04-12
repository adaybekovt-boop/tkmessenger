// usePerformanceBudget — single source of truth for "how hard can this theme
// push the device right now".
//
// Returns a reactive budget object consumed by Background components:
//
//   {
//     tier:         'full' | 'reduced' | 'frozen',
//     particles:    number,    // derived from the manifest's maxParticles + tier
//     fpsCap:       number,    // 0 = uncapped
//     motion:       boolean,   // false → background should render a static frame
//     reason:       string     // why we're in the current tier (debug / telemetry)
//   }
//
// Inputs that can shift the tier mid-session:
//   - prefers-reduced-motion media query (live listener)
//   - document.visibilityState (pause while tab hidden)
//   - Battery Status API (low battery + not charging → reduced)
//   - navigator.hardwareConcurrency + navigator.deviceMemory (boot-time)
//   - live FPS monitor via requestAnimationFrame (downgrades if < minFPS)
//
// The hook is intentionally permissive: if the browser lacks any API, we
// assume the best and run at full tier. Privacy > precision.

import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_MAX = { desktop: 140, mobile: 80, lowEnd: 30 };

/**
 * @param {import('./types.js').ThemeManifest} manifest
 */
export function usePerformanceBudget(manifest) {
  const perf = manifest?.performance || {};
  const maxParticles = perf.maxParticles || DEFAULT_MAX;
  const minFPS = perf.minFPS ?? 30;
  const degradeOnLowBattery = perf.degradeOnLowBattery !== false;

  // ─── Boot-time device class ────────────────────────────────────────────
  const deviceClass = useMemo(() => classifyDevice(), []);

  // ─── Live signals ──────────────────────────────────────────────────────
  const [reducedMotion, setReducedMotion] = useState(() => queryReducedMotion());
  const [visible, setVisible] = useState(() => !isHidden());
  const [lowBattery, setLowBattery] = useState(false);
  const [fpsTier, setFpsTier] = useState('full'); // 'full' | 'reduced'

  // Live listener: prefers-reduced-motion.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReducedMotion(e.matches);
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange);
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange);
      else mq.removeListener?.(onChange);
    };
  }, []);

  // Live listener: document visibility.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Live listener: Battery API. Not available on Safari — we just skip.
  useEffect(() => {
    if (!degradeOnLowBattery) return;
    if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') return;
    let battery = null;
    let mounted = true;
    const recompute = () => {
      if (!battery || !mounted) return;
      const low = battery.charging === false && typeof battery.level === 'number' && battery.level < 0.2;
      setLowBattery(low);
    };
    navigator.getBattery().then((b) => {
      if (!mounted) return;
      battery = b;
      b.addEventListener?.('chargingchange', recompute);
      b.addEventListener?.('levelchange', recompute);
      recompute();
    }).catch(() => {});
    return () => {
      mounted = false;
      if (battery) {
        battery.removeEventListener?.('chargingchange', recompute);
        battery.removeEventListener?.('levelchange', recompute);
      }
    };
  }, [degradeOnLowBattery]);

  // Live FPS monitor: two-second rolling window, downgrades once and sticks.
  const fpsFramesRef = useRef(0);
  const fpsStartRef = useRef(0);
  const fpsRafRef = useRef(null);
  useEffect(() => {
    // Only run while we're rendering at full or reduced tier, and the tab
    // is visible, and the manifest actually has a background. There's no
    // point measuring a static theme — it'll sit at 60fps trivially.
    if (!manifest?.background || !visible || reducedMotion) return;
    if (fpsTier === 'reduced') return; // once down, stay down for this session

    let cancelled = false;
    fpsFramesRef.current = 0;
    fpsStartRef.current = 0;
    let lowWindows = 0;

    const tick = (time) => {
      if (cancelled) return;
      if (!fpsStartRef.current) fpsStartRef.current = time;
      fpsFramesRef.current += 1;
      const elapsed = time - fpsStartRef.current;
      if (elapsed >= 2000) {
        const fps = (fpsFramesRef.current * 1000) / elapsed;
        if (fps < minFPS) {
          lowWindows += 1;
          if (lowWindows >= 2) {
            setFpsTier('reduced');
            return;
          }
        } else {
          lowWindows = 0;
        }
        fpsFramesRef.current = 0;
        fpsStartRef.current = time;
      }
      fpsRafRef.current = requestAnimationFrame(tick);
    };
    fpsRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (fpsRafRef.current != null) cancelAnimationFrame(fpsRafRef.current);
      fpsRafRef.current = null;
    };
  }, [manifest, visible, reducedMotion, fpsTier, minFPS]);

  // ─── Aggregate into a single budget object ─────────────────────────────
  return useMemo(() => {
    // Tier selection cascade — most restrictive wins.
    if (reducedMotion) {
      return { tier: 'frozen', particles: 0, fpsCap: 0, motion: false, reason: 'reduced-motion' };
    }
    if (!visible) {
      return { tier: 'frozen', particles: 0, fpsCap: 0, motion: false, reason: 'tab-hidden' };
    }

    let tier = 'full';
    let reason = 'default';
    if (deviceClass === 'lowEnd') { tier = 'reduced'; reason = 'low-end-device'; }
    if (lowBattery) { tier = 'reduced'; reason = 'low-battery'; }
    if (fpsTier === 'reduced') { tier = 'reduced'; reason = 'fps-drop'; }

    // Particle budget by tier.
    let particles;
    if (tier === 'reduced') particles = maxParticles.lowEnd;
    else if (deviceClass === 'mobile') particles = maxParticles.mobile;
    else particles = maxParticles.desktop;

    return {
      tier,
      particles,
      fpsCap: tier === 'reduced' ? 30 : 0,
      motion: true,
      reason
    };
  }, [reducedMotion, visible, deviceClass, lowBattery, fpsTier, maxParticles]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function queryReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isHidden() {
  return typeof document !== 'undefined' && document.hidden === true;
}

/** @returns {'desktop' | 'mobile' | 'lowEnd'} */
function classifyDevice() {
  if (typeof navigator === 'undefined') return 'desktop';
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const ram = Number(navigator.deviceMemory) || 4;
  if (cores < 4 || ram < 4) return 'lowEnd';
  // Rough mobile detection — userAgent is unreliable but directionally OK.
  const ua = String(navigator.userAgent || '').toLowerCase();
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
  return mobile ? 'mobile' : 'desktop';
}
