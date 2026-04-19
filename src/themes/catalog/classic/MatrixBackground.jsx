// MatrixBackground — quiet terminal wash.
//
// The original MatrixBackground painted falling katakana/latin "rain" on a
// Canvas. The 2026-04 Matrix mockup (Orbits_theme_MATRIX) moved the theme
// toward a calmer terminal aesthetic: flat warm-black background, faint
// horizontal scanlines, a subtle static noise grain. No per-frame work.
//
// UI differentiation happens via theme-skins.css (square corners, prompt
// glyphs, lowercase names) — this background just provides the tactile
// "phosphor terminal" surface the rest of the theme sits on.
//
// Keeping the component exported so the manifest's `background:` loader
// still resolves; we simply render a zero-cost CSS-only layer now.

const SCANLINE =
  "repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(126, 231, 135, 0.03) 3px, rgba(126, 231, 135, 0.03) 4px)";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0.494  0 0 0 0 0.906  0 0 0 0 0.529  0 0 0 0.3 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.14'/%3E%3C/svg%3E\")";

export default function MatrixBackground() {
  return (
    <div
      className="matrix-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: `radial-gradient(ellipse at 50% 0%, rgba(126, 231, 135, 0.035) 0%, transparent 50%), linear-gradient(180deg, #0C120E 0%, #0A0F0B 100%)`
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: SCANLINE,
          mixBlendMode: 'screen',
          opacity: 0.85
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundSize: '180px 180px',
          mixBlendMode: 'screen',
          opacity: 0.45
        }}
      />
    </div>
  );
}
