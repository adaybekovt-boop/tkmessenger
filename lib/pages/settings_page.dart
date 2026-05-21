// Settings home — list of "action card" rows. Each row pushes its own
// dedicated subpage. Mirrors the JS `screen === 'home'` branch in
// `src/pages/Settings.jsx`:
//   • Профиль (stretchy header at the top, tap → editor)
//   • Безопасность
//   • Чаты
//   • Уведомления
//   • Внешний вид
//   • Микрофон
//   • Энергосбережение
//   • Сеть
//   • Диагностика
//
// Plus a logout button at the bottom (red).

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_notifier.dart';
import '../state/local_profile_provider.dart';
import '../themes/orbits_tokens.dart';
import '../ui/peer/peer_status_pill.dart';
import '../ui/primitives/orbs_card.dart';
import '../ui/profile/my_qr_page.dart';
import '../ui/profile/profile_edit_page.dart';
import 'settings/chat_prefs_page.dart';
import 'settings/diagnostics_page.dart';
import 'settings/mic_page.dart';
import 'settings/network_page.dart';
import 'settings/notifications_page.dart';
import 'settings/power_saver_page.dart';
import 'settings/security_page.dart';
import 'settings/terms_page.dart';
import 'themes_page.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = OrbitsTokens.of(context);
    final user = ref.watch(localProfileProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Настройки',
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
        padding: const EdgeInsets.only(
          top: 4,
          bottom: 32,
        ),
        children: [
          // Profile card on top
          if (user != null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: _ProfileCard(user: user, tokens: tokens),
            ),
          ],

          // Action rows
          const SizedBox(height: 4),
          _ActionRow(
            icon: Icons.lock,
            title: 'Безопасность',
            subtitle: 'Шифрование, авто-блокировка, приватность сети',
            onTap: () => _push(context, const SecurityPage()),
          ),
          _ActionRow(
            icon: Icons.chat_bubble,
            title: 'Чаты',
            subtitle: 'Переключатели поведения, форма пузырей, шрифт',
            onTap: () => _push(context, const ChatPrefsPage()),
          ),
          _ActionRow(
            icon: Icons.notifications,
            title: 'Уведомления',
            subtitle: 'Звуки и вибрация',
            onTap: () => _push(context, const NotificationsPage()),
          ),
          _ActionRow(
            icon: Icons.palette,
            title: 'Внешний вид',
            subtitle: 'Тема и фоновые анимации',
            onTap: () => _push(context, const ThemesPage()),
          ),
          _ActionRow(
            icon: Icons.mic,
            title: 'Микрофон',
            subtitle: 'Устройство и эффекты',
            onTap: () => _push(context, const MicPage()),
          ),
          _ActionRow(
            icon: Icons.bolt,
            title: 'Энергосбережение',
            subtitle: 'Меньше анимаций, blur и нагрузки',
            onTap: () => _push(context, const PowerSaverPage()),
          ),
          _ActionRow(
            icon: Icons.cable,
            title: 'Сеть',
            subtitle: 'Твой ID и статус соединения',
            onTap: () => _push(context, const NetworkPage()),
          ),
          _ActionRow(
            icon: Icons.memory,
            title: 'Диагностика',
            subtitle: 'Версия, кэш, PWA',
            onTap: () => _push(context, const DiagnosticsPage()),
          ),
          _ActionRow(
            icon: Icons.gavel,
            title: 'Соглашение',
            subtitle: 'Политика конфиденциальности и условия',
            onTap: () => _push(context, const TermsPage()),
          ),

          // Logout
          if (user != null) ...[
            const SizedBox(height: 18),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: TextButton.icon(
                onPressed: () => _confirmLogout(context, ref),
                icon: Icon(Icons.logout, color: tokens.danger, size: 18),
                label: Text(
                  'Выйти из профиля',
                  style: TextStyle(color: tokens.danger),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _push(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final tokens = OrbitsTokens.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Выйти из профиля?'),
        content: const Text(
          'Локальные ключи останутся на устройстве. Войти можно будет '
          'паролем — пароль не сбрасывается.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: tokens.danger),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(authNotifierProvider.notifier).logout();
  }
}

// ─── Profile card ──────────────────────────────────────────

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.user, required this.tokens});

  final AuthedUser user;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    final avatarBytes = _decodeAvatar(user.avatarDataUrl);
    return OrbsCard(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ProfileEditPage()),
        );
      },
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          OrbsAvatar(
            fallbackInitial: user.displayName.isNotEmpty
                ? user.displayName.characters.first.toUpperCase()
                : '?',
            imageBytes: avatarBytes,
            size: 56,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  user.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    fontFamily: tokens.fontHeading,
                    color: tokens.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  user.peerId,
                  style: TextStyle(
                    fontSize: 12,
                    fontFamily: tokens.fontMono,
                    color: tokens.muted,
                  ),
                ),
                if (user.bio.trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    user.bio,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontFamily: tokens.fontBody,
                      color: tokens.muted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'QR-код',
            icon: Icon(Icons.qr_code_2, color: tokens.text, size: 22),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => MyQrPage(peerId: user.peerId),
                ),
              );
            },
          ),
          Icon(Icons.chevron_right, color: tokens.muted),
        ],
      ),
    );
  }

  Uint8List? _decodeAvatar(String? url) {
    if (url == null || url.isEmpty) return null;
    final comma = url.indexOf(',');
    if (comma < 0) return null;
    try {
      return base64Decode(url.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }
}

// ─── Action row ────────────────────────────────────────────

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(tokens.radiusCard),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Color.lerp(tokens.bg, tokens.surface, 0.35),
              borderRadius: BorderRadius.circular(tokens.radiusCard),
              border: Border.all(color: tokens.border),
            ),
            child: Row(
              children: [
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
                Icon(Icons.chevron_right, color: tokens.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
