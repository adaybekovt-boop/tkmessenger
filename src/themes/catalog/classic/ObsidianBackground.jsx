// ObsidianBackground — deep space with twinkling stars and subtle nebula.
//
// CSS-only: random star positions with pulsing opacity animation.
// Uses usePerformanceBudget() for star count adaptation.

import { useMemo } from 'react';
import { usePerformanceBudget } from '../../usePerformanceBudget.js';

function Stars({ count }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const size = Math.random() > 0.92 ? 2 + Math.random() * 1.5 : 1 + Math.random();
      return {
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size,
        opacity: 0.15 + Math.random() * 0.7,
        delay: `${Math.random() * 8}s`,
        duration: `${3 + Math.random() * 5}s`,
        glow: size > 2.5
      };
    });
  }, [count]);

  return (
    <>
      {stars.map((s) => (
        <div
          key={s.id}
          className="obsidian-star"
          style={{
            left: s.left,
            top: s.top,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDelay: s.delay,
            animationDuration: s.duration,
            boxShadow: s.glow
              ? `0 0 ${s.size * 3}px rgba(120, 160, 255, 0.4)`
              : 'none'
          }}
        />
      ))}
    </>
  );
}

// Slow-drifting nebula clouds
function Nebulae() {
  return (
    <>
      <div className="obsidian-nebula obsidian-nebula-1" />
      <div className="obsidian-nebula obsidian-nebula-2" />
    </>
  );
}

export default function ObsidianBackground({ manifest }) {
  const budget = usePerformanceBudget(manifest);
  const showMotion = budget.motion && budget.tier !== 'frozen';
  const starCount = showMotion ? budget.particles : Math.min(budget.particles, 40);

  return (
    <div
      className="obsidian-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: [
          'radial-gradient(ellipse at 15% 25%, rgba(20, 40, 100, 0.25) 0%, transparent 55%)',
          'radial-gradient(ellipse at 85% 70%, rgba(40, 20, 80, 0.2) 0%, transparent 50%)',
          'radial-gradient(ellipse at 50% 90%, rgba(10, 30, 60, 0.15) 0%, transparent 45%)',
          'linear-gradient(180deg, #030308 0%, #050510 40%, #08081a 70%, #030308 100%)'
        ].join(', ')
      }}
    >
      {starCount > 0 && <Stars count={starCount} />}
      {showMotion && <Nebulae />}

      <style>{`
        .obsidian-star {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(200, 220, 255, 0.95) 0%, rgba(140, 170, 255, 0.5) 50%, transparent 100%);
          animation: obsidian-twinkle ease-in-out infinite alternate;
          will-change: opacity;
        }

        .obsidian-nebula {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          opacity: 0.08;
          animation: obsidian-drift linear infinite;
          will-change: transform;
        }
        .obsidian-nebula-1 {
          width: 400px;
          height: 300px;
          top: 15%;
          left: 10%;
          background: radial-gradient(ellipse, rgba(59, 130, 246, 0.5) 0%, transparent 70%);
          animation-duration: 45s;
        }
        .obsidian-nebula-2 {
          width: 350px;
          height: 250px;
          bottom: 20%;
          right: 5%;
          background: radial-gradient(ellipse, rgba(100, 50, 180, 0.4) 0%, transparent 70%);
          animation-duration: 55s;
          animation-direction: reverse;
        }

        @keyframes obsidian-twinkle {
          0% { opacity: var(--tw-start, 0.15); }
          100% { opacity: 1; }
        }

        @keyframes obsidian-drift {
          0% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -20px) scale(1.1); }
          50% { transform: translate(-15px, 15px) scale(0.95); }
          75% { transform: translate(20px, 25px) scale(1.05); }
          100% { transform: translate(0, 0) scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .obsidian-star,
          .obsidian-nebula {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
