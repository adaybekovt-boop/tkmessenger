// MatrixBackground — falling green characters (Matrix rain effect).
//
// Uses Canvas for efficient rendering of many falling character columns.
// Adapts column count and speed based on usePerformanceBudget().

import { useCallback, useEffect, useRef } from 'react';
import { usePerformanceBudget } from '../../usePerformanceBudget.js';

// Characters: katakana + numbers + some Latin
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZ';

export default function MatrixBackground({ manifest }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const columnsRef = useRef([]);
  const budget = usePerformanceBudget(manifest);
  const showMotion = budget.motion && budget.tier !== 'frozen';

  const initColumns = useCallback((width, fontSize) => {
    const colCount = Math.floor(width / fontSize);
    columnsRef.current = Array.from({ length: colCount }, () => ({
      y: Math.random() * -100,
      speed: 0.3 + Math.random() * 0.7,
      chars: Array.from({ length: 30 }, () =>
        CHARS[Math.floor(Math.random() * CHARS.length)]
      )
    }));
  }, []);

  useEffect(() => {
    if (!showMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 14;
    let w, h;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      initColumns(w, fontSize);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      // Fade trail
      ctx.fillStyle = 'rgba(3, 8, 5, 0.06)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${fontSize}px monospace`;
      const columns = columnsRef.current;

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const x = i * fontSize;
        const baseY = col.y * fontSize;

        // Draw several chars in the trail
        for (let j = 0; j < 18; j++) {
          const cy = baseY - j * fontSize;
          if (cy < -fontSize || cy > h + fontSize) continue;

          const charIdx = (Math.floor(col.y) + j) % col.chars.length;
          const ch = col.chars[charIdx];

          if (j === 0) {
            // Head — bright white-green
            ctx.fillStyle = 'rgba(180, 255, 200, 0.95)';
          } else if (j < 3) {
            ctx.fillStyle = `rgba(34, 197, 94, ${0.8 - j * 0.1})`;
          } else {
            const fade = Math.max(0, 0.5 - j * 0.03);
            ctx.fillStyle = `rgba(34, 197, 94, ${fade})`;
          }

          ctx.fillText(ch, x, cy);
        }

        // Randomly swap a char in the trail
        if (Math.random() > 0.96) {
          const swapIdx = Math.floor(Math.random() * col.chars.length);
          col.chars[swapIdx] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        col.y += col.speed;
        if (col.y * fontSize > h + 300) {
          col.y = Math.random() * -20;
          col.speed = 0.3 + Math.random() * 0.7;
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    // Pre-fill canvas with dark bg
    ctx.fillStyle = 'rgba(3, 8, 5, 1)';
    ctx.fillRect(0, 0, w, h);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [showMotion, initColumns]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: showMotion
          ? 'transparent'
          : 'linear-gradient(180deg, #030805 0%, #061210 50%, #030805 100%)'
      }}
    >
      {showMotion && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%'
          }}
        />
      )}
    </div>
  );
}
