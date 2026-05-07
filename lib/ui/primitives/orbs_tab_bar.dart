// Custom tab bar that mirrors the JS `App.jsx` bottom navigation:
//   • 4 evenly-spaced columns, each "Icon over label" stacked
//   • Active tab carries a subtle accent pill behind the icon
//     (`layoutId="nav-indicator"` in JS — Hero animation in Flutter)
//   • Icon stroke-width and label weight bump on selection
//   • Whole bar slides off the bottom when the soft keyboard is up
//     (controlled by `MediaQuery.viewInsets.bottom`)
//
// We replace `NavigationBar` because the Material 3 component:
//   - has a fixed pill-behind-icon style we can't theme into the
//     atmospheric look,
//   - reserves vertical space the JS bar doesn't (M3 specs say 80 px
//     min; the JS bar lives at 64 px),
//   - and ignores keyboard insets, so on web the bar floated *above*
//     the on-screen keyboard.

import 'package:flutter/material.dart';

import '../../themes/orbits_tokens.dart';

class OrbsTabSpec {
  const OrbsTabSpec({
    required this.icon,
    required this.activeIcon,
    required this.label,
  });
  final IconData icon;
  final IconData activeIcon;
  final String label;
}

class OrbsTabBar extends StatelessWidget {
  const OrbsTabBar({
    super.key,
    required this.tabs,
    required this.activeIndex,
    required this.onTap,
  });

  final List<OrbsTabSpec> tabs;
  final int activeIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    // Hide the bar when the keyboard's up — matches JS `data-keyboard='1'`.
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    final keyboardOpen = kb > 60;

    return AnimatedContainer(
      duration: tokens.durationShort,
      curve: tokens.easing,
      height: keyboardOpen ? 0 : 64 + MediaQuery.viewPaddingOf(context).bottom,
      decoration: BoxDecoration(
        color: tokens.surface.withValues(alpha: 0.92),
        border: Border(top: BorderSide(color: tokens.border)),
      ),
      child: keyboardOpen
          ? const SizedBox.shrink()
          : SafeArea(
              top: false,
              child: SizedBox(
                height: 64,
                child: Row(
                  children: List.generate(tabs.length, (i) {
                    return Expanded(
                      child: _OrbsTab(
                        spec: tabs[i],
                        active: i == activeIndex,
                        onTap: () => onTap(i),
                      ),
                    );
                  }),
                ),
              ),
            ),
    );
  }
}

class _OrbsTab extends StatelessWidget {
  const _OrbsTab({
    required this.spec,
    required this.active,
    required this.onTap,
  });
  final OrbsTabSpec spec;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    final fg = active ? tokens.accent : tokens.muted;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(tokens.radiusButton),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Animated accent pill behind the icon when this tab is active.
            // `AnimatedOpacity` + `AnimatedScale` is enough — Material's
            // built-in Hero animation isn't worth the wiring for a 4-tab
            // bar where users always see the new active tab in-frame.
            if (active)
              AnimatedContainer(
                duration: tokens.durationShort,
                curve: tokens.easing,
                width: 48,
                height: 32,
                margin: const EdgeInsets.only(bottom: 18),
                decoration: BoxDecoration(
                  color: tokens.accentAlpha(0.18),
                  borderRadius: BorderRadius.circular(tokens.radiusButton),
                ),
              ),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  active ? spec.activeIcon : spec.icon,
                  size: 22,
                  color: fg,
                ),
                const SizedBox(height: 2),
                Text(
                  spec.label,
                  style: TextStyle(
                    fontSize: 10,
                    height: 1.0,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: fg,
                    fontFamily: tokens.fontBody,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
