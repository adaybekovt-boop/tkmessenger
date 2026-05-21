// "My Peer ID" QR screen.
//
// Renders the user's invite link as a scannable QR code on a clean
// theme-aware canvas. The receiving side reads it via `AddContactPage`
// (which uses `mobile_scanner` on native, paste-from-clipboard on web),
// runs the payload through `extractPeerIdFromInput`, and lands directly
// on the new chat.
//
// Wire format inside the QR:
//   https://orbits.app/add/ORBIT-ABC123
//
// We embed the full HTTPS URL (not the bare peerId) so a stranger
// scanning with the system camera lands somewhere useful even if the app
// isn't installed — the landing page can show "Open in Orbits" + a
// copy-able fallback id. Error correction is pinned to level H (30%
// damage tolerance) so the code still scans through scratches on a
// printed sticker or someone's slightly-shaky phone hand.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/haptics.dart';
import '../../peer/add_contact_link.dart';
import '../../themes/orbits_tokens.dart';

class MyQrPage extends StatelessWidget {
  const MyQrPage({super.key, required this.peerId});

  final String peerId;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    final inviteUrl = buildAddContactUrl(peerId);
    return Scaffold(
      appBar: AppBar(title: const Text('Мой QR')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Покажи этот код другу',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    fontFamily: tokens.fontHeading,
                    color: tokens.text,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Он отсканирует его через «Добавить контакт» и сразу '
                  'попадёт в чат с тобой. Можно сканировать и обычной '
                  'камерой телефона — откроется ссылка.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: tokens.muted,
                    fontFamily: tokens.fontBody,
                  ),
                ),
                const SizedBox(height: 28),
                // White card behind the QR — many scanners have trouble
                // reading dark-on-dark codes. The QR stays black-on-
                // white regardless of the active theme. The 16 px inner
                // padding doubles as the QR's quiet zone (qr_flutter
                // adds its own 4-module margin on top of this, which is
                // exactly the spec's recommendation).
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(tokens.radiusCard),
                    boxShadow: tokens.shadowCard,
                  ),
                  child: QrImageView(
                    data: inviteUrl.isEmpty ? peerId : inviteUrl,
                    version: QrVersions.auto,
                    size: 240,
                    backgroundColor: Colors.white,
                    // Level H = ~30 % codeword recovery. Bigger module
                    // count than L/M/Q for the same payload, but a URL
                    // this short comfortably fits inside version 4–5
                    // even at H — and we want forgiving scans more than
                    // we want a sparse-looking code.
                    errorCorrectionLevel: QrErrorCorrectLevel.H,
                    eyeStyle: const QrEyeStyle(
                      eyeShape: QrEyeShape.square,
                      color: Colors.black,
                    ),
                    dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: Colors.black,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                // Invite-link readout underneath — fallback for when
                // scanning isn't available (desktop without a camera,
                // pasting into a chat). Tap = copy the full URL; the
                // peerId chip below is for the audio-dictation case
                // where someone literally reads the id over the phone.
                _LinkChip(url: inviteUrl, peerId: peerId, tokens: tokens),
                const SizedBox(height: 10),
                _PeerIdChip(peerId: peerId, tokens: tokens),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LinkChip extends StatelessWidget {
  const _LinkChip({
    required this.url,
    required this.peerId,
    required this.tokens,
  });
  final String url;
  final String peerId;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    // If the peerId is malformed we don't have a URL to show — fall back
    // to a hint so the user doesn't see an empty pill.
    final displayText = url.isEmpty ? 'Ссылка недоступна' : url;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(tokens.radiusButton),
        border: Border.all(color: tokens.border),
      ),
      child: Row(
        children: [
          Icon(Icons.link, size: 16, color: tokens.muted),
          const SizedBox(width: 8),
          Expanded(
            child: SelectableText(
              displayText,
              maxLines: 1,
              style: TextStyle(
                fontFamily: tokens.fontMono,
                fontSize: 13,
                color: url.isEmpty ? tokens.muted : tokens.text,
              ),
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Скопировать ссылку',
            icon: const Icon(Icons.copy_outlined, size: 20),
            onPressed: url.isEmpty
                ? null
                : () async {
                    hapticTap();
                    await Clipboard.setData(ClipboardData(text: url));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context)
                      ..clearSnackBars()
                      ..showSnackBar(
                        const SnackBar(
                          content: Text('Ссылка скопирована'),
                          duration: Duration(seconds: 1),
                        ),
                      );
                  },
          ),
        ],
      ),
    );
  }
}

class _PeerIdChip extends StatelessWidget {
  const _PeerIdChip({required this.peerId, required this.tokens});
  final String peerId;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: tokens.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(tokens.radiusButton),
        border: Border.all(color: tokens.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'ID',
            style: TextStyle(
              fontSize: 11,
              fontFamily: tokens.fontMono,
              color: tokens.muted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: SelectableText(
              peerId,
              style: TextStyle(
                fontFamily: tokens.fontMono,
                fontSize: 14,
                color: tokens.text,
              ),
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            tooltip: 'Скопировать ID',
            icon: const Icon(Icons.copy_outlined, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: () async {
              hapticTap();
              await Clipboard.setData(ClipboardData(text: peerId));
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
      ),
    );
  }
}
