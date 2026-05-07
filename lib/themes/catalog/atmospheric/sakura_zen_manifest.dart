// Sakura Zen — warm washi canvas with falling petals. Port of
// `git_push/src/themes/catalog/atmospheric/sakuraZenManifest.js`.
//
// This is the *flagship atmospheric* theme. SakuraBackground (a continuously
// animated petal field) lands when the backgrounds folder is wired; until
// then the manifest still works — the bg colour from tokens is the visible
// surface and the picker shows the theme correctly under Atmospheric.

import 'package:flutter/material.dart';

import '../../backgrounds/sakura_background.dart';
import '../../manifest.dart';

const ThemeManifest sakuraZenManifest = ThemeManifest(
  id: 'sakura-zen',
  name: 'Sakura Zen',
  subtitle: 'Цветущая сакура',
  family: ThemeFamily.atmospheric,
  colorScheme: Brightness.light,

  tokens: ThemeTokenColors(
    bg: Color.fromARGB(255, 246, 239, 228),
    surface: Color.fromARGB(255, 237, 228, 212),
    border: Color.fromARGB(255, 217, 205, 184),
    text: Color.fromARGB(255, 26, 21, 18),
    muted: Color.fromARGB(255, 107, 95, 85),
    accent: Color.fromARGB(255, 212, 117, 107),
    accent2: Color.fromARGB(255, 228, 167, 160),
    success: Color.fromARGB(255, 107, 122, 90),
    danger: Color.fromARGB(255, 168, 51, 46),
    // Pin to brand blue: same rationale as Paper — light theme, blue ticks
    // read as "delivered" without competing with the pink accent.
    deliveryRead: Color.fromARGB(255, 96, 165, 250),
  ),

  shape: ThemeShape(
    radiusButton: 16,
    radiusCard: 20,
    radiusModal: 24,
    shadowCard: <BoxShadow>[
      BoxShadow(
        // rgba(212, 117, 107, 0.08)
        color: Color.fromARGB(20, 212, 117, 107),
        blurRadius: 24,
        offset: Offset(0, 4),
      ),
    ],
    blurSurface: 10,
  ),

  typography: ThemeTypography(
    fontHeading: 'CormorantGaramond',
    fontBody: 'NotoSerif',
    fontMono: 'JetBrainsMono',
    letterSpacingHeading: -0.01,
    lineHeightBody: 1.55,
  ),

  motion: ThemeMotion(
    durationShort: Duration(milliseconds: 180),
    durationMedium: Duration(milliseconds: 350),
    durationLong: Duration(milliseconds: 600),
    easing: Cubic(0.4, 0, 0.2, 1),
    reducedMotionFallback: ReducedMotionFallback.subtle,
  ),

  features: ThemeFeatures(
    activeTabOrnament: ActiveTabOrnament.hankoStamp,
    messageBubbleStyle: MessageBubbleStyle.rounded,
    modalEnter: ModalEnter.fadeScale,
    particlesEnabled: true,
    reducedMotionMode: ReducedMotionFallback.subtle,
  ),

  performance: ThemePerformance(
    minFPS: 24,
    degradeOnLowBattery: true,
    maxParticlesDesktop: 30,
    maxParticlesMobile: 15,
    maxParticlesLowEnd: 6,
  ),

  background: _buildSakura,
);

Widget _buildSakura(BuildContext context) =>
    const SakuraBackground(manifest: sakuraZenManifest);
