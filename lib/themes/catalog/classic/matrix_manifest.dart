// Matrix — quiet terminal. Port of
// `git_push/src/themes/catalog/classic/matrixManifest.js`.
//
// Square corners (radius 0) and JetBrains Mono everywhere are the defining
// features. The previous Matrix had falling-rain canvas; the 2026-04 mockup
// dropped that for a calmer terminal-shell aesthetic — `MatrixBackground`
// (when ported) only paints scanlines + grain on a warm-black wash.

import 'package:flutter/material.dart';

import '../../backgrounds/matrix_background.dart';
import '../../manifest.dart';

const ThemeManifest matrixManifest = ThemeManifest(
  id: 'classic-matrix',
  name: 'Matrix',
  subtitle: 'Тихий терминал',
  family: ThemeFamily.atmospheric,
  colorScheme: Brightness.dark,

  tokens: ThemeTokenColors(
    bg: Color.fromARGB(255, 12, 18, 14),
    surface: Color.fromARGB(255, 17, 24, 19),
    border: Color.fromARGB(255, 27, 37, 32),
    text: Color.fromARGB(255, 208, 221, 210),
    muted: Color.fromARGB(255, 106, 128, 112),
    accent: Color.fromARGB(255, 126, 231, 135),
    accent2: Color.fromARGB(255, 106, 211, 115),
    success: Color.fromARGB(255, 126, 231, 135),
    danger: Color.fromARGB(255, 244, 63, 94),
    // No blue ticks in terminal-land — fold delivery into the green accent.
    deliveryRead: Color.fromARGB(255, 126, 231, 135),
  ),

  shape: ThemeShape(
    radiusButton: 0,
    radiusCard: 0,
    radiusModal: 2,
    shadowCard: <BoxShadow>[], // explicit "no shadow" — matches JS 'none'
    blurSurface: 0,
  ),

  typography: ThemeTypography(
    fontHeading: 'JetBrainsMono',
    fontBody: 'JetBrainsMono',
    fontMono: 'JetBrainsMono',
    letterSpacingHeading: 0,
    lineHeightBody: 1.6,
  ),

  performance: ThemePerformance(
    // Background is pure CSS / no canvas in JS — particle counts are zero
    // and stay that way. Hook is kept in case we re-introduce a cursor-blink
    // sprite later.
    minFPS: 24,
    degradeOnLowBattery: false,
    maxParticlesDesktop: 0,
    maxParticlesMobile: 0,
    maxParticlesLowEnd: 0,
  ),

  background: _buildMatrix,
);

Widget _buildMatrix(BuildContext context) =>
    const MatrixBackground(manifest: matrixManifest);
