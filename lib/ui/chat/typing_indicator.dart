// Three-dot "... печатает" animation, shown above the composer when the
// peer is actively typing. Port of the floating `TypingBubble` block from
// `src/pages/Chats.jsx`.
//
// Framer Motion's staggered bounce translates directly to a single
// AnimationController driving three dots with phase-shifted sine waves.
// We keep it on a 900ms loop (matches JS "duration: 0.9, repeat: Infinity")
// and use a single controller so the three dots stay in phase — spawning
// three controllers would let them drift after a few seconds.

import 'package:flutter/material.dart';

class TypingIndicator extends StatefulWidget {
  const TypingIndicator({super.key});

  @override
  State<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(left: 12, bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        // A softer surface so the bubble reads as "ambient UI" rather than
        // another incoming message. Matches the muted background the JS
        // version uses.
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (int i = 0; i < 3; i++)
            Padding(
              padding: EdgeInsets.only(right: i == 2 ? 0 : 4),
              child: _Dot(controller: _ctl, phase: i / 3),
            ),
          const SizedBox(width: 6),
          Text(
            'печатает…',
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.controller, required this.phase});
  final AnimationController controller;

  /// 0..1 offset in the loop so the three dots bounce in sequence rather
  /// than in unison.
  final double phase;

  @override
  Widget build(BuildContext context) {
    final colour = Theme.of(context).colorScheme.onSurface
        .withValues(alpha: 0.55);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        // Shifted sine → smooth up-down between 0 and 4px without hitting
        // the vsync penalty of a Tween chain.
        final t = (controller.value + phase) % 1.0;
        final bounce = -4 * (0.5 - (t - 0.5).abs());
        return Transform.translate(
          offset: Offset(0, bounce),
          child: Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: colour,
              shape: BoxShape.circle,
            ),
          ),
        );
      },
    );
  }
}
