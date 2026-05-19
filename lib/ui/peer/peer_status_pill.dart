// Port of `src/components/PeerStatusPill.jsx` — the tiny chip that tells
// the user whether WebRTC signaling is up. Shows peerId (truncated),
// current status color, error string on long-press.
//
// In the React app this sat in a fixed-position div above the tab content.
// In Flutter it's embedded directly into each tab page's AppBar `actions`,
// which avoids overlapping (and stealing taps from) other AppBar actions
// like the "add contact" button on the Chats tab.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/outbox_provider.dart';
import '../../state/peer_connection_provider.dart';
import '../../themes/orbits_tokens.dart';

/// Raw pill — just the chip, no positioning. Use this when embedding inside
/// a custom layout (e.g. AppBar actions, or a settings row that shows
/// connection state).
class PeerStatusPill extends ConsumerWidget {
  const PeerStatusPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn = ref.watch(peerConnectionProvider);
    final pending = ref.watch(outboxCountProvider);
    final tokens = OrbitsTokens.of(context);

    // Status colour comes from theme tokens — `success` for the happy path,
    // `accent2` for transient/connecting (the JS picked amber via accent2),
    // `danger` for hard errors, `muted` for the quiet idle state.
    final (Color color, String label) = switch (conn.status) {
      'connected' => (tokens.success, 'В сети'),
      'connecting' => (tokens.accent2, 'Подключение…'),
      'multitab' => (tokens.danger, 'Другая вкладка'),
      'disconnected' => (tokens.muted, 'Не в сети'),
      _ => (tokens.muted, 'Готов'),
    };

    final peerId = conn.peerId;
    final idText = peerId == null || peerId.isEmpty
        ? '—'
        : peerId.length > 14
            ? '${peerId.substring(0, 14)}…'
            : peerId;

    // Pill background reads as a semi-opaque surface — works on both light
    // (Paper, Sakura) and dark (Graphite, Matrix) themes because we pull
    // the canvas colour and dim it.
    final pillBg = tokens.bg.withValues(alpha: 0.78);
    final labelColor = tokens.text;

    return Tooltip(
      // Error string surfaces on long-press — mirrors the `title` attr the
      // JS pill carried. Users who want the full text tap-and-hold.
      message: conn.error ?? '',
      triggerMode: conn.error == null
          ? TooltipTriggerMode.manual
          : TooltipTriggerMode.longPress,
      child: Material(
        color: pillBg,
        shape: StadiumBorder(
          side: BorderSide(color: color.withValues(alpha: 0.6)),
        ),
        child: InkWell(
          onTap: conn.status == 'disconnected'
              ? () => ref.read(peerConnectionProvider.notifier).reconnectNow()
              : null,
          customBorder: const StadiumBorder(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _StatusDot(color: color),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: labelColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    fontFamily: tokens.fontBody,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  idText,
                  style: TextStyle(
                    color: tokens.muted,
                    fontSize: 11,
                    fontFamily: tokens.fontMono,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                if (pending > 0) ...[
                  const SizedBox(width: 8),
                  _OutboxBadge(count: pending),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 4),
        ],
      ),
    );
  }
}

class _OutboxBadge extends StatelessWidget {
  const _OutboxBadge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    // Outbox badge tinted in the warning-ish accent2. The label color picks
    // up the same hue but boosted to full opacity so it stays legible.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: tokens.accent2Alpha(0.20),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.accent2Alpha(0.65)),
      ),
      child: Text(
        '$count в очереди',
        style: TextStyle(
          color: tokens.accent2,
          fontSize: 10,
          fontWeight: FontWeight.w600,
          fontFamily: tokens.fontBody,
        ),
      ),
    );
  }
}
