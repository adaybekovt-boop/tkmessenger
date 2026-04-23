// GraphiteBackground — three slow-drifting colored orbs + subtle noise grain.
//
// Matches the Graphite mockup: heavy blur, low opacity, long keyframe periods
// (30-45s) so motion reads as ambient rather than animated. Pure CSS — no
// canvas, no per-frame JS. usePerformanceBudget gates the orbs on low-end
// devices; the grain is always on because it's a single static PNG-size asset.

import { usePerformanceBudget } from '../../usePerformanceBudget.js';

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function GraphiteBackground({ manifest }) {
  const budget = usePerformanceBudget(manifest);
  const showMotion = budget.motion && budget.tier !== 'frozen';
  const showOrbs = budget.particles > 0;

  return (
    <div
      className="graphite-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: 'rgb(var(--orb-bg-rgb))'
      }}
    >
      {showOrbs && (
        <>
          <div className="graphite-orb graphite-orb-1" />
          <div className="graphite-orb graphite-orb-2" />
          <div className="graphite-orb graphite-orb-3" />
        </>
      )}
      <div className="graphite-grain" />

      <style>{`
        .graphite-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          will-change: transform, opacity;
        }
        .graphite-orb-1 {
          top: -100px;
          left: -100px;
          width: 500px;
          height: 500px;
          background: rgb(var(--orb-accent-rgb));
          opacity: 0.06;
          animation: graphite-drift-1 32s ease-in-out infinite;
        }
        .graphite-orb-2 {
          bottom: -150px;
          right: -100px;
          width: 600px;
          height: 600px;
          background: rgb(var(--orb-success-rgb));
          opacity: 0.05;
          animation: graphite-drift-2 38s ease-in-out infinite;
        }
        .graphite-orb-3 {
          top: 40%;
          left: 50%;
          width: 400px;
          height: 400px;
          background: rgb(var(--orb-accent2-rgb));
          opacity: 0.04;
          animation: graphite-drift-3 44s ease-in-out infinite;
        }

        .graphite-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.025;
          background-image: ${GRAIN_SVG};
          mix-blend-mode: screen;
        }

        @keyframes graphite-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.06; }
          50%      { transform: translate(60px, 40px) scale(1.15); opacity: 0.09; }
        }
        @keyframes graphite-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.05; }
          50%      { transform: translate(-50px, -40px) scale(1.1); opacity: 0.07; }
        }
        @keyframes graphite-drift-3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.04; }
          50%      { transform: translate(-40%, -60%) scale(1.2); opacity: 0.06; }
        }

        ${!showMotion ? `
          .graphite-orb { animation: none !important; }
        ` : ''}

        @media (prefers-reduced-motion: reduce) {
          .graphite-orb { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
