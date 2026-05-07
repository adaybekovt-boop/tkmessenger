// Flutter port of `PaperBackground.jsx` — purely static, no per-frame work.
//
// Layered radial blushes (sakura-pink at top-left, walnut warm at
// bottom-right) over a soft cream linear gradient, plus a subtle noise
// grain. Mirrors the JS `linear-gradient(175deg, #F3EEE3 0%, #EFE8D8 50%,
// #F3EEE3 100%)` + radial overlays + multiplied SVG turbulence.

import 'package:flutter/material.dart';

import '../manifest.dart';
import '../orbits_tokens.dart';

class PaperBackground extends StatelessWidget {
  const PaperBackground({super.key, required this.manifest});

  // ignore: unused_element  // kept for symmetry with animated backgrounds
  final ThemeManifest manifest;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return IgnorePointer(
      ignoring: true,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Base linear: fades through three close cream stops.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: const Alignment(0, -1.0),
                end: const Alignment(0.1, 1.0),
                colors: [
                  tokens.bg,
                  Color.lerp(tokens.bg, tokens.border, 0.20) ?? tokens.bg,
                  tokens.bg,
                ],
                stops: const [0.0, 0.5, 1.0],
              ),
            ),
          ),
          // Top-left blush — pulled from accent (Paper's brick-red ink).
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.6, -0.8),
                radius: 0.9,
                colors: [
                  tokens.accent.withValues(alpha: 0.04),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.55],
              ),
            ),
          ),
          // Bottom-right warm — uses muted (a brown-grey) for the second
          // blush since Paper's accent2 is a brighter ink than what the JS
          // hand-coded rgba(92, 74, 58) target was.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.6, 0.7),
                radius: 0.85,
                colors: [
                  tokens.muted.withValues(alpha: 0.05),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.5],
              ),
            ),
          ),
          // Static grain — a single CustomPaint speckle pass. Multiplied
          // against the canvas via low alpha (paper looks tactile, not
          // washed-out). We reuse the same pattern as Graphite, just at
          // higher opacity since light backgrounds need more contrast for
          // the grain to show.
          CustomPaint(
            painter: _PaperGrainPainter(
              seed: 3,
              color: tokens.text.withValues(alpha: 0.035),
            ),
          ),
        ],
      ),
    );
  }
}

class _PaperGrainPainter extends CustomPainter {
  _PaperGrainPainter({required this.seed, required this.color});
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

    const count = 1100;
    for (var i = 0; i < count; i++) {
      final x = (next() / 0x7fff) * size.width;
      final y = (next() / 0x7fff) * size.height;
      canvas.drawRect(Rect.fromLTWH(x, y, 1, 1), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _PaperGrainPainter old) =>
      old.seed != seed || old.color != color;
}
