// Per-peer chat settings bottom sheet. Opened from the chat view header
// (⋮ action or tapping the title). Lets the user:
//
//   • Rename the peer locally (customName — never broadcast back)
//   • Flip the trust level (unknown / TOFU / verified)
//   • Block / unblock (stops inbound + outbound via `messaging_notifier`)
//   • Wipe local chat history for this peer
//
// The React app spread these across multiple screens (verify dialog lived
// in the chat header, block list in Settings). For the Flutter port we
// consolidate them — a single sheet keeps the code small and matches what
// users tap their way into anyway.
//
// All writes go through `storage/db.dart` helpers which share `savePeer`
// merge semantics — a patch like `{'id':…, 'blocked': true}` leaves the
// display name / pub key / trust level alone.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/chat_list_provider.dart';
import '../../storage/db.dart' as db;
import '../../state/peers_provider.dart';

class ChatSettingsSheet extends ConsumerStatefulWidget {
  const ChatSettingsSheet({super.key, required this.peerId});

  final String peerId;

  @override
  ConsumerState<ChatSettingsSheet> createState() => _ChatSettingsSheetState();
}

class _ChatSettingsSheetState extends ConsumerState<ChatSettingsSheet> {
  late final TextEditingController _nameCtl;

  /// Seed-value guard. We only want to pre-fill the text field once — on
  /// first successful peers emit. After that the user might be typing and
  /// we shouldn't clobber their draft when `peersProvider` re-emits for
  /// an unrelated reason (e.g. another peer's lastSeenAt update).
  bool _seeded = false;

  /// In-flight flag for the destructive "clear history" button. Keeps the
  /// user from double-tapping and queuing two DELETEs back-to-back.
  bool _clearing = false;

  @override
  void initState() {
    super.initState();
    _nameCtl = TextEditingController();
  }

  @override
  void dispose() {
    _nameCtl.dispose();
    super.dispose();
  }

  void _seedName(Map<String, Object?> peer) {
    if (_seeded) return;
    final custom = (peer['customName'] as String?) ?? '';
    final displayName = (peer['displayName'] as String?) ?? '';
    _nameCtl.text = custom.isNotEmpty ? custom : displayName;
    _seeded = true;
  }

  Future<void> _handleSaveName() async {
    final next = _nameCtl.text.trim();
    await db.setPeerCustomName(widget.peerId, next);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text(next.isEmpty
              ? 'Локальное имя сброшено'
              : 'Имя сохранено: $next'),
          duration: const Duration(seconds: 2),
        ),
      );
  }

  Future<void> _handleClearHistory() async {
    // Two-step confirm — clearing a chat is destructive and there's no
    // undo. Matches the "Очистить" confirm in the JS Settings page.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Очистить историю?'),
        content: const Text(
          'Все сообщения в этом чате будут удалены только на этом '
          'устройстве. Собеседник сохранит свою копию.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _clearing = true);
    try {
      final deleted = await db.clearMessagesForPeer(widget.peerId);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          SnackBar(
            content: Text('Удалено сообщений: $deleted'),
            duration: const Duration(seconds: 2),
          ),
        );
    } finally {
      if (mounted) setState(() => _clearing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final peersAsync = ref.watch(peersProvider);
    final peer = peersAsync.maybeWhen(
      data: (rows) {
        for (final r in rows) {
          if ((r['id'] as String?) == widget.peerId) return r;
        }
        return const <String, Object?>{};
      },
      orElse: () => const <String, Object?>{},
    );
    if (peer.isNotEmpty) _seedName(peer);

    final displayName = (peer['displayName'] as String?) ?? '';
    final customName = (peer['customName'] as String?) ?? '';
    final headerName = customName.isNotEmpty
        ? customName
        : (displayName.isNotEmpty ? displayName : widget.peerId);
    final isBlocked = peer['blocked'] == true ||
        (peer['blocked'] is num && (peer['blocked'] as num).toInt() == 1);
    final trust = _decodeTrust(peer['trustLevel']);

    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 8,
          bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Header ──────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: scheme.primaryContainer,
                    child: Text(
                      headerName.trim().isNotEmpty
                          ? headerName.trim().characters.first.toUpperCase()
                          : '?',
                      style: TextStyle(
                        color: scheme.onPrimaryContainer,
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          headerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.peerId,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: scheme.onSurface.withValues(alpha: 0.6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ── Rename ──────────────────────────────────────────────
            _SectionLabel(text: 'Локальное имя'),
            const SizedBox(height: 8),
            TextField(
              controller: _nameCtl,
              maxLength: 64,
              decoration: InputDecoration(
                hintText: displayName.isNotEmpty
                    ? displayName
                    : 'Ник собеседника',
                border: const OutlineInputBorder(),
                counterText: '',
                suffixIcon: IconButton(
                  tooltip: 'Сохранить',
                  icon: const Icon(Icons.check),
                  onPressed: _handleSaveName,
                ),
              ),
              onSubmitted: (_) => _handleSaveName(),
            ),
            const SizedBox(height: 6),
            Text(
              'Видно только вам. Не перезаписывается, когда собеседник '
              'меняет профиль.',
              style: TextStyle(
                fontSize: 11,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
            ),

            const SizedBox(height: 20),

            // ── Trust level ─────────────────────────────────────────
            _SectionLabel(text: 'Доверие'),
            const SizedBox(height: 8),
            SegmentedButton<ChatTrust>(
              segments: const [
                ButtonSegment(
                  value: ChatTrust.unknown,
                  label: Text('Неизвестно'),
                  icon: Icon(Icons.help_outline),
                ),
                ButtonSegment(
                  value: ChatTrust.tofu,
                  label: Text('TOFU'),
                  icon: Icon(Icons.lock_outline),
                ),
                ButtonSegment(
                  value: ChatTrust.verified,
                  label: Text('Проверен'),
                  icon: Icon(Icons.verified_user),
                ),
              ],
              selected: {trust},
              onSelectionChanged: (sel) async {
                final next = sel.first;
                final level = switch (next) {
                  ChatTrust.unknown => 0,
                  ChatTrust.tofu => 1,
                  ChatTrust.verified => 2,
                };
                await db.setPeerTrustLevel(widget.peerId, level);
              },
            ),
            const SizedBox(height: 6),
            Text(
              'TOFU — ключ запомнен при первой встрече. «Проверен» '
              'устанавливается вручную после сверки отпечатков.',
              style: TextStyle(
                fontSize: 11,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
            ),

            const SizedBox(height: 20),

            // ── Block toggle ────────────────────────────────────────
            Material(
              color: scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: scheme.onSurface.withValues(alpha: 0.12),
                ),
              ),
              child: SwitchListTile(
                value: isBlocked,
                onChanged: (v) => db.setPeerBlocked(widget.peerId, v),
                title: const Text('Заблокировать'),
                subtitle: Text(
                  isBlocked
                      ? 'Сообщения от этого собеседника не будут '
                          'приниматься и отправляться.'
                      : 'Принимать входящие и отправлять сообщения.',
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
                secondary: Icon(
                  Icons.block,
                  color: isBlocked
                      ? scheme.error
                      : scheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ── Destructive: clear history ──────────────────────────
            OutlinedButton.icon(
              onPressed: _clearing ? null : _handleClearHistory,
              icon: _clearing
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.delete_outline, color: scheme.error),
              label: Text(
                _clearing ? 'Удаление...' : 'Очистить историю',
                style: TextStyle(color: scheme.error),
              ),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(color: scheme.error.withValues(alpha: 0.4)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Internal: decode the int-valued `trustLevel` column into the shared
/// enum. Duplicated from chat_list_provider.dart so the sheet stays
/// self-contained — the Chat list provider's private helper is
/// intentionally not re-exported.
ChatTrust _decodeTrust(Object? raw) {
  final v = (raw as num?)?.toInt() ?? 0;
  return switch (v) {
    >= 2 => ChatTrust.verified,
    1 => ChatTrust.tofu,
    _ => ChatTrust.unknown,
  };
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
      ),
    );
  }
}
