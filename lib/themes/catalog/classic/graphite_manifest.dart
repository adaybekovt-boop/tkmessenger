// Graphite — cool blue-grey dark theme. Direct Flutter port of
// `git_push/src/themes/catalog/classic/graphiteManifest.js`.
//
// The colour values are the same `R G B` triplets as the JS manifest, just
// repacked into `Color.fromARGB`. The background is wired up later in the
// theme-system port (see TODO at the bottom).

import 'package:flutter/material.dart';

import '../../backgrounds/graphite_background.dart';
import '../../manifest.dart';

const ThemeManifest graphiteManifest = ThemeManifest(
  id: 'classic-graphite',
  name: 'Graphite',
  subtitle: 'Слоистый графит',
  family: ThemeFamily.classic,
  colorScheme: Brightness.dark,

  // Sub-records are all const — only the outer `ThemeManifest(...)` is
  // non-const because `background:` closes over `graphiteManifest` itself.
  tokens: ThemeTokenColors(
    bg: Color.fromARGB(255, 15, 19, 25),
    surface: Color.fromARGB(255, 27, 34, 48),
    border: Color.fromARGB(255, 37, 45, 60),
    text: Color.fromARGB(255, 228, 233, 241),
    muted: Color.fromARGB(255, 139, 150, 167),
    accent: Color.fromARGB(255, 138, 180, 212),
    accent2: Color.fromARGB(255, 165, 198, 224),
    success: Color.fromARGB(255, 138, 180, 176),
    danger: Color.fromARGB(255, 212, 117, 107),
    // Read-tick blue lifted from the JS chat — Tailwind `text-blue-200`.
    deliveryRead: Color.fromARGB(255, 191, 219, 254),
  ),

  shape: ThemeShape(
    radiusButton: 10,
    radiusCard: 14,
    radiusModal: 18,
    shadowCard: <BoxShadow>[
      BoxShadow(
        color: Color.fromARGB(102, 10, 12, 16), // rgba(10,12,16,0.40)
        blurRadius: 16,
        offset: Offset(0, 4),
      ),
    ],
    blurSurface: 12,
  ),

  typography: ThemeTypography(
    fontHeading: 'Manrope',
    fontBody: 'Manrope',
    fontMono: 'JetBrainsMono',
    letterSpacingHeading: -0.015,
    lineHeightBody: 1.55,
  ),

  motion: ThemeMotion(
    durationShort: Duration(milliseconds: 200),
    durationMedium: Duration(milliseconds: 350),
    durationLong: Duration(milliseconds: 550),
    easing: Cubic(0.2, 0, 0, 1),
    reducedMotionFallback: ReducedMotionFallback.subtle,
  ),

  performance: ThemePerformance(
    minFPS: 30,
    degradeOnLowBattery: true,
    maxParticlesDesktop: 3,
    maxParticlesMobile: 2,
    maxParticlesLowEnd: 0,
  ),

  // Drifting orbs + grain. Closure captures the manifest itself so the
  // background can read perf-budget for our tier — passed back in via the
  // builder. Eager (non-const) constructor needed because the closure
  // calls back into this very instance.
  background: _buildGraphite,
);

Widget _buildGraphite(BuildContext context) =>
    const GraphiteBackground(manifest: graphiteManifest);
