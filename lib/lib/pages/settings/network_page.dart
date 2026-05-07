// Settings → Сеть.
//
// Port of the `screen === 'network'` branch in JS Settings: shows the
// user's peer ID with a copy button, the current connection status,
// and the signaling host. The peer-status pill at the top of the app
// shell already surfaces the same status — this is the place to inspect
// it in detail.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/haptics.dart';
import '../../state/local_profile_provider.dart';
import '../../state/peer_connection_provider.dart';
import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';
import '../../ui/profile/my_qr_page.dart';

class NetworkPage extends ConsumerWidget {
  const NetworkPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = OrbitsTokens.of(context);
    final user = ref.watch(localProfileProvider);
    final conn = ref.watch(peerConnectionProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Сеть',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Peer ID ──────────────────────────────────────────
          const OrbsSectionTitle('Твой ID'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: tokens.bg.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(tokens.radiusButton),
                      border: Border.all(color: tokens.border),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: SelectableText(
                            user?.peerId ?? '—',
                            style: TextStyle(
                              fontFamily: tokens.fontMono,
                              fontSize: 14,
                              color: tokens.text,
                            ),
                          ),
                        ),
                        if (user != null) ...[
                          IconButton(
                            tooltip: 'QR-код',
                            icon: Icon(Icons.qr_code_2,
                                color: tokens.text, size: 22),
                            onPressed: () {
                              hapticTap();
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      MyQrPage(peerId: user.peerId),
                                ),
                              );
                            },
                          ),
                          IconButton(
                            tooltip: 'Скопировать',
                            icon: Icon(Icons.copy_outlined,
                                color: tokens.muted, size: 20),
                            onPressed: () async {
                              hapticTap();
                              await Clipboard.setData(
                                ClipboardData(text: user.peerId),
                              );
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context)
                                ..clearSnackBars()
                                ..showSnackBar(
                                  const SnackBar(
                                    content: Text('Peer ID скопирован'),
                                    duration: Duration(seconds: 1),
                                  ),
                                );
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'ID присвоен навсегда и не может быть сброшен. Поделись им '
                    'с друзьями — они смогут добавить тебя в контакты.',
                    style: TextStyle(
                      fontSize: 12,
                      color: tokens.muted,
                      fontFamily: tokens.fontBody,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Status ───────────────────────────────────────────
          const OrbsSectionTitle('Статус'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              padding: const EdgeInsets.symmetric(
                horizontal: 6,
                vertical: 4,
              ),
              child: Column(
                children: [
                  OrbsSettingRow(
                    label: 'Соединение',
                    subtitle: _statusLabel(conn.status),
                    trailing: _StatusDot(status: conn.status, tokens: tokens),
                  ),
                  if (conn.error != null && conn.error!.isNotEmpty) ...[
                    const OrbsDivider(),
                    OrbsSettingRow(
                      label: 'Последняя ошибка',
                      subtitle: conn.error ?? '',
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── How it works ─────────────────────────────────────
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 16, color: tokens.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Сообщения передаются напрямую к собеседнику без сервера. '
                    'Если он офлайн, сообщения дойдут когда он появится в '
                    'сети.',
                    style: TextStyle(
                      fontSize: 12,
                      color: tokens.muted,
                      fontFamily: tokens.fontBody,
                      height: 1.45,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  String _statusLabel(String? status) {
    return switch (status) {
      'connected' => 'В сети',
      'connecting' => 'Подключение…',
      'multitab' => 'Открыта в другой вкладке',
      'disconnected' => 'Не в сети',
      _ => 'Готов',
    };
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status, required this.tokens});
  final String? status;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'connected' => tokens.success,
      'connecting' => tokens.accent2,
      'multitab' => tokens.danger,
      _ => tokens.muted,
    };
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.5), blurRadius: 6),
        ],
      ),
    );
  }
}
