// Voice recorder — TEMPORARILY STUBBED OUT.
//
// The `record` package family (record / record_platform_interface /
// record_web / record_linux / record_android / …) is in a broken
// transitive-version state on pub.dev right now: every consistent set
// of pins leaves at least one platform package incompatible with the
// rest (record_linux 0.7.2 implements interface 1.2.x, record_web
// 1.3.0 needs interface 1.3.x). Pinning either side breaks the other,
// and Flutter compiles the full Dart graph for every target, so the
// drift breaks Android, Windows, and the dart2js web pass.
//
// Rather than ship a half-broken voice flow that fails on one platform
// every time the upstream releases a new patch, we stub the recorder
// out: the bottom sheet now shows a "coming soon" placeholder, the
// recording feature is hidden from users, and the rest of the app
// builds cleanly. The public API (`VoiceRecorderSheet`, `VoiceRecord-
// Result`) is preserved so the call site in `chat_view_page.dart`
// doesn't need touching.
//
// Re-enable by:
//   1. Adding back `record: ^X.Y.Z` to pubspec (when upstream stabilises).
//   2. Reverting this file to the version in git history before
//      d7bd427 (or the commit that introduced this stub).
//   3. Re-adding any necessary dependency_overrides for the record
//      transitives.

import 'dart:typed_data';

import 'package:flutter/material.dart';

/// Payload handed to [VoiceRecorderSheet.onSend]. Shape matches the
/// positional + named args of `MessagingNotifier.sendVoice` so the
/// caller can splat it with minimal glue.
///
/// Kept as a public type so `chat_view_page.dart` still compiles.
class VoiceRecordResult {
  const VoiceRecordResult({
    required this.bytes,
    required this.mime,
    required this.durationSec,
    required this.waveform,
  });

  final Uint8List bytes;
  final String mime;
  final double durationSec;

  /// Normalized amplitudes in 0..1, ≤48 entries.
  final List<double> waveform;
}

class VoiceRecorderSheet extends StatelessWidget {
  const VoiceRecorderSheet({super.key, required this.onSend});

  /// Kept for API parity. The stub never invokes it.
  final void Function(VoiceRecordResult result) onSend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.mic_off, size: 48, color: scheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(
              'Голосовые сообщения временно отключены',
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Запись голоса вернётся в следующем обновлении.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: const Text('Закрыть'),
            ),
          ],
        ),
      ),
    );
  }
}
