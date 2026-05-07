// Paper — warm cream canvas with red-ink accent. Port of
// `git_push/src/themes/catalog/classic/lightManifest.js`.
//
// Note JS keeps the id as `classic-light` even though the family is
// `atmospheric` — that's because the *picker grouping* and the *legacy id*
// are decoupled: callers persisting `classic-light` from older builds still
// resolve, while the picker shows it under "Atmospheric" alongside Sakura.

import 'package:flutter/material.dart';

import '../../backgrounds/paper_background.dart';
import '../../manifest.dart';

const ThemeManifest paperManifest = ThemeManifest(
  id: 'classic-light',
  name: 'Paper',
  subtitle: 'Тёплая бумага',
  family: ThemeFamily.atmospheric,
  colorScheme: Brightness.light,

  tokens: ThemeTokenColors(
    bg: Color.fromARGB(255, 243, 238, 227),
    surface: Color.fromARGB(255, 250, 246, 236),
    border: Color.fromARGB(255, 226, 219, 201),
    text: Color.fromARGB(255, 20, 18, 16),
    muted: Color.fromARGB(255, 140, 133, 122),
    accent: Color.fromARGB(255, 178, 58, 38),
    accent2: Color.fromARGB(255, 203, 78, 55),
    success: Color.fromARGB(255, 61, 102, 57),
    danger: Color.fromARGB(255, 178, 58, 38),
    // Light themes pin the read-tick to brand blue regardless of accent.
    deliveryRead: Color.fromARGB(255, 96, 165, 250),
  ),

  shape: ThemeShape(
    radiusButton: 8,
    radiusCard: 12,
    radiusModal: 16,
    shadowCard: <BoxShadow>[
      BoxShadow(
        color: Color.fromARGB(15, 20, 18, 16), // rgba(20,18,16,0.06)
        blurRadius: 2,
        offset: Offset(0, 1),
      ),
    ],
    blurSurface: 0,
  ),

  typography: ThemeTypography(
    fontHeading: 'InstrumentSerif',
    fontBody: 'Geist',
    fontMono: 'JetBrainsMono',
    letterSpacingHeading: -0.02,
    lineHeightBody: 1.5,
  ),

  performance: ThemePerformance(
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticlesDesktop: 45,
    maxParticlesMobile: 25,
    maxParticlesLowEnd: 10,
  ),

  background: _buildPaper,
);

Widget _buildPaper(BuildContext context) =>
    const PaperBackground(manifest: paperManifest);
