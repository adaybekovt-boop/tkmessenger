// Flutter port of `MatrixBackground.jsx` — quiet terminal wash.
//
// No falling rain anymore (per the 2026-04 mockup). Just a flat warm-black
// canvas, a faint top-centre phosphor glow, horizontal scanlines, and a
// subtle green-tinted noise grain. All static — zero per-frame work.

import 'package:flutter/material.dart';

import '../manifest.dart';
import '../orbits_tokens.dart';

class MatrixBackground extends StatelessWidget {
  const MatrixBackground({super.key, required this.manifest});

  // ignore: unused_element
  final ThemeManifest manifest;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return IgnorePointer(
      ignoring: true,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Base canvas with a top-centre phosphor radial pulled from accent.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [tokens.bg, _darken(tokens.bg, 0.18)],
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -1),
                radius: 1.0,
                colors: [
                  tokens.accent.withValues(alpha: 0.035),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.5],
              ),
            ),
          ),
          // Scanlines — every 4px a single 1px tinted line at very low alpha.
          CustomPaint(
            painter: _ScanlinePainter(
              color: tokens.accent.withValues(alpha: 0.03),
              spacing: 4,
            ),
          ),
          // Green-tinted grain. Same speckle technique as Graphite/Paper
          // but the colour is the accent (terminal green) instead of `text`,
          // so the wash reads as phosphor noise rather than dust.
          CustomPaint(
            painter: _MatrixGrainPainter(
              seed: 7,
              color: tokens.accent.withValues(alpha: 0.045),
            ),
          ),
        ],
      ),
    );
  }
}

/// Repeating horizontal hairlines spaced every [spacing] px. Painted once.
class _ScanlinePainter extends CustomPainter {
  _ScanlinePainter({required this.color, required this.spacing});
  final Color color;
  final double spacing;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, 1), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _ScanlinePainter old) =>
      old.color != color || old.spacing != spacing;
}

class _MatrixGrainPainter extends CustomPainter {
  _MatrixGrainPainter({required this.seed, required this.color});
  final int seed;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    var s = seed * 1103515245 + 12345;
    int next() {
      s = s * 1103515245 + 12345;
      return (s >> 16) & 0x7fff;
    }

    const count = 800;
    for (var i = 0; i < count; i++) {
      final x = (next() / 0x7fff) * size.width;
      final y = (next() / 0x7fff) * size.height;
      canvas.drawRect(Rect.fromLTWH(x, y, 1, 1), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MatrixGrainPainter old) =>
      old.seed != seed || old.color != color;
}

Color _darken(Color c, double amount) {
  final hsl = HSLColor.fromColor(c);
  return hsl
      .withLightness((hsl.lightness - amount).clamp(0.0, 1.0))
      .toColor();
}
