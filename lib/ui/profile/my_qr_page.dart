// "My Peer ID" QR screen.
//
// Renders the user's peerId as a scannable QR code on a clean theme-aware
// canvas. The receiving side scans it via `AddContactPage` (which uses
// `mobile_scanner`), parses the URI, and lands directly on the new chat.
//
// Wire format: we emit the bare peerId text inside the QR. Could move to
// `orbits://contact/<id>` later for deep-link routing, but the current
// reader handles both via canonicalisation in `peer/helpers.dart`.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/haptics.dart';
import '../../themes/orbits_tokens.dart';

class MyQrPage extends StatelessWidget {
  const MyQrPage({super.key, required this.peerId});

  final String peerId;

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
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
                  'Он отсканирует его через "Добавить контакт" и сразу '
                  'попадёт в чат с тобой.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: tokens.muted,
                    fontFamily: tokens.fontBody,
                  ),
                ),
                const SizedBox(height: 28),
                // White card behind the QR — many scanners have trouble
                // reading dark-on-dark codes. The QR is always black-on-
                // white regardless of the active theme.
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(tokens.radiusCard),
                    boxShadow: tokens.shadowCard,
                  ),
                  child: QrImageView(
                    data: peerId,
                    version: QrVersions.auto,
                    size: 240,
                    backgroundColor: Colors.white,
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
                // Plain-text peerId underneath — fallback for when
                // scanning isn't available (e.g. desktop without camera).
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: tokens.surface,
                    borderRadius: BorderRadius.circular(tokens.radiusButton),
                    border: Border.all(color: tokens.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: SelectableText(
                          peerId,
                          style: TextStyle(
                            fontFamily: tokens.fontMono,
                            fontSize: 15,
                            color: tokens.text,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        tooltip: 'Скопировать',
                        icon: const Icon(Icons.copy_outlined, size: 20),
                        onPressed: () async {
                          hapticTap();
                          await Clipboard.setData(
                            ClipboardData(text: peerId),
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
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
