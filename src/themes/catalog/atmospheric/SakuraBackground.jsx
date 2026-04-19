// SakuraBackground — animated cherry blossom petals over a warm washi canvas.
//
// Palette updated to match the Sakura Zen mockup: the theme is now light, so
// the gradient is cream/washi with a faint sakura blush, and the petals are
// the deeper sakura/beni pinks to read against the pale background.
//
// Requirements:
//   - Warm washi-cream canvas with sakura-pink blush radials
//   - 30 petals on desktop, adaptive on mobile/low-end (set by manifest)
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

// Petal fill colors — deeper sakura/beni pinks so they remain visible
// against the cream washi background. Higher alphas than the old dark-bg
// version because light backgrounds swallow low-opacity tints.
const PETAL_FILLS = [
  'rgba(212, 117, 107, 0.55)',
  'rgba(228, 167, 160, 0.5)',
  'rgba(168, 51, 46, 0.4)',
  'rgba(242, 213, 208, 0.7)',
  'rgba(194, 95, 85, 0.45)'
];

function CSSPetals({ count }) {
  const petals = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const size = 6 + Math.random() * 10;
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
        opacity: 0.15 + Math.random() * 0.3,
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
        // Warm washi canvas with a faint sakura blush at top-left, mirroring
        // the mockup's paper-feel. Base tone matches --orb-bg-rgb (246 239
        // 228) so the animated layer blends seamlessly with UI chrome.
        background: [
          'radial-gradient(ellipse at 20% 15%, rgba(228, 167, 160, 0.22) 0%, transparent 55%)',
          'radial-gradient(ellipse at 80% 85%, rgba(212, 117, 107, 0.14) 0%, transparent 55%)',
          'linear-gradient(160deg, #f6efe4 0%, #f2e9dc 50%, #ede4d4 100%)'
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
