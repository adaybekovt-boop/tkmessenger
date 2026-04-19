// PaperBackground — warm cream washi canvas with a subtle noise grain.
//
// Matches the Paper mockup (Orbits_themes_PAPER): a tactile "paper" feel
// rather than the floating-bokeh treatment the previous Paper theme had. The
// noise is a single SVG blob rendered via `background-image: url(data:…)`,
// so there's no per-frame work — only the natural grain texture that gives
// the background its warmth. Low-end devices still pay zero GPU cost because
// there are no running animations.

export default function PaperBackground() {
  return (
    <div
      className="paper-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: [
          'radial-gradient(ellipse at 20% 10%, rgba(178, 58, 38, 0.04) 0%, transparent 55%)',
          'radial-gradient(ellipse at 80% 85%, rgba(92, 74, 58, 0.05) 0%, transparent 50%)',
          'linear-gradient(175deg, #F3EEE3 0%, #EFE8D8 50%, #F3EEE3 100%)'
        ].join(', ')
      }}
    >
      <div className="paper-grain" />
      <style>{`
        .paper-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.45;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0.08  0 0 0 0 0.07  0 0 0 0 0.06  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/></svg>");
        }
      `}</style>
    </div>
  );
}
