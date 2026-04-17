// Reduced-motion support for Framer Motion animations.
//
// Respects prefers-reduced-motion: all spring/slide animations
// collapse to instant opacity fades.

import { useReducedMotion } from 'framer-motion';

export function useSafeVariants(variants) {
  const shouldReduce = useReducedMotion();
  if (!shouldReduce) return variants;
  return Object.fromEntries(
    Object.entries(variants).map(([key, val]) => [
      key,
      { opacity: val.opacity ?? 1, transition: { duration: 0 } },
    ])
  );
}
