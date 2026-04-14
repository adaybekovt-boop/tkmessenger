// SakuraBackground — animated cherry blossom petals over a dark gradient.
//
// Requirements:
//   - Dark pink → deep purple-burgundy gradient
//   - 40–60+ petals on desktop, adaptive on mobile/low-end
//   - Petals fall, sway side-to-side, rotate, vary in size/speed/opacity
//   - prefers-reduced-motion → static gradient only
//   - Uses usePerformanceBudget() for particle adaptation

import { useMemo } from 'react';
import { usePerformanceBudget } from '../../usePerformanceBudget.js';

// Three SVG petal shape variants for visual variety
const PETAL_PATHS = [
  'M5 0 C7.5 0 10 2.5 10 5 C10 7.5 7.5 10 5 10 C2.5 10 0 7.5 0 5 C0 2.5 2.5 0 5 0 Z',
  'M5 0 C8 1 10 4 9 7 C8 9 5 10 3 9 C1 7 0 4 1 2 C2 0 4 -0.5 5 0 Z',
  'M4 0 C7 0.5 10 3 10 6 C9 9 6 10 4 10 C1 9 0 6 0 4 C0.5 1 2 -0.5 4 0 Z'
];

// Soft petal fill colors — semi-transparent pinks
const PETAL_FILLS = [
  'rgba(244, 114, 182, 0.55)',
  'rgba(236, 72, 153, 0.45)',
  'rgba(251, 146, 191, 0.5)',
  'rgba(219, 39, 119, 0.35)',
  'rgba(252, 165, 206, 0.4)'
];

function CSSPetals({ count }) {
  const petals = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const size = 8 + Math.random() * 14;
      return {
        id: i,
        left: `${Math.random() * 105 - 2.5}%`,
        // Stagger start positions so not all start at top at once
        startY: `${-10 - Math.random() * 30}%`,
        delay: `${Math.random() * 16}s`,
        fallDuration: `${10 + Math.random() * 14}s`,
        swayDuration: `${3 + Math.random() * 5}s`,
        spinDuration: `${6 + Math.random() * 10}s`,
        size,
        opacity: 0.2 + Math.random() * 0.5,
        shape: Math.floor(Math.random() * PETAL_PATHS.length),
        fill: PETAL_FILLS[Math.floor(Math.random() * PETAL_FILLS.length)],
        swayAmp: 30 + Math.random() * 50,
        flipAxis: Math.random() > 0.5 ? 'Y' : 'X'
      };
    });
  }, [count]);

  return (
    <>
      {petals.map((p) => (
        <div
          key={p.id}
          className="sakura-petal"
          style={{
            left: p.left,
            top: p.startY,
            animationDelay: p.delay,
            animationDuration: p.fallDuration,
            '--sway-dur': p.swayDuration,
            '--sway-amp': `${p.swayAmp}px`,
            '--spin-dur': p.spinDuration,
            '--flip-axis': p.flipAxis,
            opacity: p.opacity
          }}
        >
          <div className="sakura-spin">
            <svg
              width={p.size}
              height={p.size}
              viewBox="0 0 10 10"
              className="sakura-sway"
            >
              <path d={PETAL_PATHS[p.shape]} fill={p.fill} />
            </svg>
          </div>
        </div>
      ))}
    </>
  );
}

export default function SakuraBackground({ manifest }) {
  const budget = usePerformanceBudget(manifest);
  const showMotion = budget.motion && budget.tier !== 'frozen';
  const particleCount = showMotion ? budget.particles : 0;

  return (
    <div
      className="sakura-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        // Deep dark pink → purple-burgundy gradient
        background: [
          'radial-gradient(ellipse at 20% 10%, rgba(120, 20, 60, 0.5) 0%, transparent 55%)',
          'radial-gradient(ellipse at 80% 90%, rgba(60, 10, 80, 0.45) 0%, transparent 55%)',
          'radial-gradient(ellipse at 50% 50%, rgba(90, 15, 50, 0.25) 0%, transparent 70%)',
          'linear-gradient(160deg, #0f0a0d 0%, #1a0c18 25%, #220e22 50%, #180a1e 75%, #0f0a0d 100%)'
        ].join(', ')
      }}
    >
      {showMotion && particleCount > 0 && <CSSPetals count={particleCount} />}

      <style>{`
        .sakura-petal {
          position: absolute;
          animation: sakura-fall linear infinite;
          will-change: transform, opacity;
        }
        .sakura-spin {
          animation: sakura-rotate linear infinite;
          animation-duration: var(--spin-dur, 8s);
        }
        .sakura-sway {
          display: block;
          animation: sakura-sway ease-in-out infinite alternate;
          animation-duration: var(--sway-dur, 4s);
        }

        @keyframes sakura-fall {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          3% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateY(115vh);
            opacity: 0;
          }
        }

        @keyframes sakura-sway {
          0% {
            transform: translateX(calc(var(--sway-amp, 35px) * -1)) rotate3d(0, 1, 0, 0deg);
          }
          50% {
            transform: translateX(0) rotate3d(0, 1, 0, 90deg);
          }
          100% {
            transform: translateX(var(--sway-amp, 35px)) rotate3d(0, 1, 0, 180deg);
          }
        }

        @keyframes sakura-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sakura-petal,
          .sakura-spin,
          .sakura-sway {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
