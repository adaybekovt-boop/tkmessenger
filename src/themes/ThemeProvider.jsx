// ThemeProvider — React glue between the manifest registry and the DOM.
//
// Responsibilities:
//   1. Read the initial theme id from localStorage (with legacy mapping).
//   2. Lazy-load the manifest; apply its CSS tokens via applyThemeTokens.
//   3. Mount the manifest's Background component (if any) in a fixed layer.
//   4. Expose `useTheme()` with { manifest, themeId, setTheme, availableIds }.
//   5. Animate the crossfade when the user switches themes so it doesn't
//      pop jarringly.
//
// The provider is a *thin* shell: every theme-specific decision lives in
// the manifest. To add a theme you write one manifest file + one Background
// component — no edits here.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  canonicalizeThemeId,
  DEFAULT_THEME_ID,
  listThemeIds,
  loadThemeManifest
} from './registry.js';
import { applyThemeTokens, clearThemeTokens } from './applyTokens.js';

const STORAGE_KEY = 'orbits_theme';

const ThemeContext = createContext({
  manifest: null,
  themeId: DEFAULT_THEME_ID,
  setTheme: () => {},
  availableIds: [],
  isLoading: false
});

export function ThemeProvider({ children }) {
  // Initial id: read once, run through legacy mapping, persist canonical.
  const [themeId, setThemeIdState] = useState(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('orbit_theme');
    const canonical = canonicalizeThemeId(raw);
    if (raw !== canonical) {
      try { localStorage.setItem(STORAGE_KEY, canonical); } catch (_) {}
    }
    // Clean up the legacy key so we don't read stale data on the next boot.
    try { localStorage.removeItem('orbit_theme'); } catch (_) {}
    return canonical;
  });

  const [manifest, setManifest] = useState(null);
  const [BackgroundComponent, setBackgroundComponent] = useState(() => null);
  const [isLoading, setIsLoading] = useState(true);
  const [crossfadeTick, setCrossfadeTick] = useState(0); // bumps on switch

  // Track the latest request so stale async loads don't clobber a newer one.
  const loadSeqRef = useRef(0);

  // Load manifest + apply tokens every time themeId changes.
  useEffect(() => {
    const seq = ++loadSeqRef.current;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const mf = await loadThemeManifest(themeId);
      if (cancelled || seq !== loadSeqRef.current) return;

      applyThemeTokens(mf);
      setManifest(mf);

      // Classic themes have no background — skip the dynamic import.
      if (!mf.background) {
        setBackgroundComponent(() => null);
        setIsLoading(false);
        setCrossfadeTick((n) => n + 1);
        return;
      }

      try {
        const mod = await mf.background();
        if (cancelled || seq !== loadSeqRef.current) return;
        setBackgroundComponent(() => mod.default || null);
      } catch (err) {
        try { console.warn('[themes] background load failed', err); } catch (_) {}
        setBackgroundComponent(() => null);
      } finally {
        if (!cancelled && seq === loadSeqRef.current) {
          setIsLoading(false);
          setCrossfadeTick((n) => n + 1);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [themeId]);

  // Clean up CSS vars on unmount (e.g. HMR / StrictMode remount).
  useEffect(() => () => { clearThemeTokens(); }, []);

  const setTheme = useCallback((rawId) => {
    const next = canonicalizeThemeId(rawId);
    setThemeIdState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  }, []);

  const value = useMemo(() => ({
    manifest,
    themeId,
    setTheme,
    availableIds: listThemeIds(),
    isLoading
  }), [manifest, themeId, setTheme, isLoading]);

  return (
    <ThemeContext.Provider value={value}>
      <ThemeBackground
        key={crossfadeTick}
        Component={BackgroundComponent}
        manifest={manifest}
      />
      {children}
    </ThemeContext.Provider>
  );
}

/** Fixed, pointer-events-none layer that hosts the active Background. */
function ThemeBackground({ Component, manifest }) {
  if (!Component || !manifest) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      data-theme-bg={manifest.id}
    >
      <Component manifest={manifest} />
    </div>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
