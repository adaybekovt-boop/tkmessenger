// Games tab — mirrors `src/pages/Games.jsx`. Layout is a simple vertical
// list of game rows (the JS uses a 2-column grid, but on Flutter we keep
// it list-shaped so the row dimensions feel right on phones — tiny grid
// cells were one of the "icons too big / tiles weird" complaints from
// the design pass).

import 'package:flutter/material.dart';

import '../core/haptics.dart';
import '../games/blackjack21/blackjack_page.dart';
import '../games/blockblast/block_blast_page.dart';
import '../games/chess/chess_page.dart';
import '../themes/orbits_tokens.dart';
import '../ui/peer/peer_status_pill.dart';

class GamesPage extends StatelessWidget {
  const GamesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Игры',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
        titleSpacing: 16,
        actions: const [
          Padding(
            padding: EdgeInsets.symmetric(vertical: 8, horizontal: 8),
            child: PeerStatusPill(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          // Hero strip
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: tokens.accentAlpha(0.16),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.sports_esports,
                      color: tokens.accent, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Мини-игры',
                        style: TextStyle(
                          fontFamily: tokens.fontHeading,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: tokens.text,
                        ),
                      ),
                      Text(
                        'Прямо в мессенджере',
                        style: TextStyle(
                          fontFamily: tokens.fontBody,
                          fontSize: 12,
                          color: tokens.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Game rows
          _GameRow(
            title: 'Block Blast',
            subtitle: 'Собирай линии, ставь рекорды',
            icon: Icons.grid_view,
            comingSoon: false,
            onTap: () {
              hapticTap();
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => BlockBlastPage(
                    onExit: () => Navigator.of(context).maybePop(),
                  ),
                ),
              );
            },
          ),
          _GameRow(
            title: '21 очко',
            subtitle: 'Классический блекджек',
            icon: Icons.style,
            comingSoon: false,
            onTap: () {
              hapticTap();
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => BlackjackPage(
                    onExit: () => Navigator.of(context).maybePop(),
                  ),
                ),
              );
            },
          ),
          _GameRow(
            title: 'Шахматы',
            subtitle: 'Игра вдвоём на одном устройстве',
            icon: Icons.extension,
            comingSoon: false,
            onTap: () {
              hapticTap();
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ChessPage(
                    onExit: () => Navigator.of(context).maybePop(),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _GameRow extends StatelessWidget {
  const _GameRow({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.comingSoon,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool comingSoon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: comingSoon
              ? () {
                  // Disabled tiles still react to taps with a hint —
                  // matches the JS UX (tile shakes / shows "СКОРО"
                  // toast). Better than feeling broken.
                  hapticTap();
                  ScaffoldMessenger.of(context)
                    ..clearSnackBars()
                    ..showSnackBar(
                      const SnackBar(
                        content: Text('Скоро добавим'),
                        duration: Duration(seconds: 1),
                      ),
                    );
                }
              : onTap,
          borderRadius: BorderRadius.circular(tokens.radiusCard),
          child: Opacity(
            opacity: comingSoon ? 0.65 : 1,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Color.lerp(tokens.bg, tokens.surface, 0.35),
                borderRadius: BorderRadius.circular(tokens.radiusCard),
                border: Border.all(color: tokens.border),
              ),
              child: Row(
                children: [
                  // Compact 36-px icon square — was 44 with poor contrast
                  // gradient before. Matches the size of avatar trios in
                  // chat list and feels balanced next to title text.
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: tokens.accentAlpha(0.18),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: Icon(icon, color: tokens.accent, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            fontFamily: tokens.fontHeading,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: tokens.text,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: TextStyle(
                            fontFamily: tokens.fontBody,
                            fontSize: 12,
                            color: tokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (comingSoon)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: tokens.muted.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'СКОРО',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          fontFamily: tokens.fontMono,
                          color: tokens.muted,
                          letterSpacing: 1.0,
                        ),
                      ),
                    )
                  else
                    Icon(Icons.chevron_right, color: tokens.muted),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
