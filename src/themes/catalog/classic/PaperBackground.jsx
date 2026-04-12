// PaperBackground — soft floating bokeh dots over a warm light gradient.
//
// Gentle, non-distracting light theme ambiance. Dots float upward
// slowly with subtle parallax-like movement.

import { useMemo } from 'react';
import { usePerformanceBudget } from '../../usePerformanceBudget.js';

const DOT_COLORS = [
  'rgba(59, 130, 246, 0.12)',
  'rgba(99, 102, 241, 0.1)',
  'rgba(139, 92, 246, 0.08)',
  'rgba(14, 165, 233, 0.1)',
  'rgba(59, 130, 246, 0.06)'
];

function BokehDots({ count }) {
  const dots = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const size = 4 + Math.random() * 24;
      return {
        id: i,
        left: `${Math.random() * 100}%`,
        startY: `${90 + Math.random() * 20}%`,
        size,
        color: DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)],
        delay: `${Math.random() * 18}s`,
        duration: `${18 + Math.random() * 16}s`,
        swayDuration: `${5 + Math.random() * 6}s`,
        swayAmp: 15 + Math.random() * 30,
        blur: size > 16 ? `${2 + Math.random() * 3}px` : `${Math.random() * 1.5}px`
      };
    });
  }, [count]);

  return (
    <>
      {dots.map((d) => (
        <div
          key={d.id}
          className="paper-dot"
          style={{
            left: d.left,
            bottom: `-${d.size}px`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            background: d.color,
            filter: `blur(${d.blur})`,
            animationDelay: d.delay,
            animationDuration: d.duration,
            '--sway-dur': d.swayDuration,
            '--sway-amp': `${d.swayAmp}px`
          }}
        />
      ))}
    </>
  );
}

export default function PaperBackground({ manifest }) {
  const budget = usePerformanceBudget(manifest);
  const showMotion = budget.motion && budget.tier !== 'frozen';
  const dotCount = showMotion ? budget.particles : 0;

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
          'radial-gradient(ellipse at 25% 15%, rgba(59, 130, 246, 0.06) 0%, transparent 55%)',
          'radial-gradient(ellipse at 75% 85%, rgba(139, 92, 246, 0.04) 0%, transparent 50%)',
          'linear-gradient(175deg, #f8f9fc 0%, #f0f2f8 35%, #eef0f6 65%, #f8f9fc 100%)'
        ].join(', ')
      }}
    >
      {dotCount > 0 && <BokehDots count={dotCount} />}

      <style>{`
        .paper-dot {
          position: absolute;
          border-radius: 50%;
          animation: paper-float linear infinite;
          will-change: transform, opacity;
        }
        .paper-dot::after {
          content: '';
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: paper-sway ease-in-out infinite alternate;
          animation-duration: var(--sway-dur, 5s);
        }

        @keyframes paper-float {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateY(-110vh);
            opacity: 0;
          }
        }

        @keyframes paper-sway {
          0% {
            transform: translateX(calc(var(--sway-amp, 20px) * -1));
          }
          100% {
            transform: translateX(var(--sway-amp, 20px));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .paper-dot {
            animation: none !important;
          }
          .paper-dot::after {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
