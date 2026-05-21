// Placeholder for the Drop tab — the P2P file-transfer screen.
//
// The real flow ports from `src/components/drop/*.jsx` and needs the
// file-chunker + transfer state providers, so it stays a stub until
// those land. The visual matches the JS empty-state: a centred icon
// circle, hero copy, and a one-liner explaining the feature so the
// user knows the tab isn't broken — just not yet shipped.

import 'package:flutter/material.dart';

import '../themes/orbits_tokens.dart';
import '../ui/peer/peer_status_pill.dart';
import '../ui/primitives/orbs_card.dart';

class DropPage extends StatelessWidget {
  const DropPage({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Drop',
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
        padding: const EdgeInsets.only(top: 12, bottom: 24),
        children: [
          // Hero icon + intro
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: tokens.accentAlpha(0.14),
                    shape: BoxShape.circle,
                    border: Border.all(color: tokens.accentAlpha(0.3)),
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    Icons.swap_vert,
                    size: 32,
                    color: tokens.accent,
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Orbits Drop',
                  style: TextStyle(
                    fontFamily: tokens.fontHeading,
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: tokens.text,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Быстрая передача файлов между устройствами без сервера',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: tokens.fontBody,
                    fontSize: 13,
                    color: tokens.muted,
                  ),
                ),
              ],
            ),
          ),

          // "How it works" card
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: OrbsCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.lightbulb_outline,
                          color: tokens.accent2, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'Как это работает',
                        style: TextStyle(
                          fontFamily: tokens.fontHeading,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: tokens.text,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _Bullet(
                    text: 'Открой Drop на обоих устройствах',
                    tokens: tokens,
                  ),
                  _Bullet(
                    text: 'Выбери получателя из списка рядом',
                    tokens: tokens,
                  ),
                  _Bullet(
                    text:
                        'Файлы шифруются и идут напрямую — мы не видим ни байта',
                    tokens: tokens,
                  ),
                ],
              ),
            ),
          ),

          // Status placeholder
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: OrbsCard(
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: tokens.accent,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      'Drop появится в одном из ближайших обновлений. '
                      'Сейчас можно передавать файлы прямо в чате — '
                      'кнопкой 📎 в композере.',
                      style: TextStyle(
                        fontFamily: tokens.fontBody,
                        fontSize: 13,
                        color: tokens.muted,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.text, required this.tokens});
  final String text;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: tokens.accent,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontFamily: tokens.fontBody,
                fontSize: 13,
                height: 1.45,
                color: tokens.text.withValues(alpha: 0.85),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
