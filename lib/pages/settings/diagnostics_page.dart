// Settings → Диагностика.
//
// Mirrors `screen === 'diagnostics'` in JS Settings: app version, build
// hash, PWA / service-worker status, image-cache stats, etc. Today
// shows what we have providers for — version + cache size — and stubs
// the rest with a "В разработке" label.

import 'package:flutter/material.dart';

import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';

class DiagnosticsPage extends StatelessWidget {
  const DiagnosticsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    final imageCache = PaintingBinding.instance.imageCache;
    final cacheBytes = imageCache.currentSizeBytes;
    final cacheMax = imageCache.maximumSizeBytes;
    final cacheCount = imageCache.currentSize;
    final cacheMaxCount = imageCache.maximumSize;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Диагностика',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Build ────────────────────────────────────────────
          const OrbsSectionTitle('Сборка'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              padding: const EdgeInsets.symmetric(
                horizontal: 6,
                vertical: 4,
              ),
              child: Column(
                children: [
                  const OrbsSettingRow(
                    label: 'Версия',
                    subtitle: 'Orbits Flutter • 0.1.0',
                  ),
                  const OrbsDivider(),
                  const OrbsSettingRow(
                    label: 'Платформа',
                    subtitle: 'Flutter 3.41 • Dart 3.11',
                  ),
                ],
              ),
            ),
          ),

          // ── Image cache ──────────────────────────────────────
          const OrbsSectionTitle('Кэш изображений'),
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
                    label: 'Память',
                    subtitle:
                        '${(cacheBytes / 1024 / 1024).toStringAsFixed(1)} / '
                        '${(cacheMax / 1024 / 1024).toStringAsFixed(0)} МБ',
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Записей',
                    subtitle: '$cacheCount / $cacheMaxCount',
                  ),
                ],
              ),
            ),
          ),

          // ── Coming soon ──────────────────────────────────────
          const OrbsSectionTitle('В разработке'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              padding: const EdgeInsets.symmetric(
                horizontal: 6,
                vertical: 4,
              ),
              child: const Column(
                children: [
                  OrbsSettingRow(
                    label: 'Service Worker',
                    subtitle: 'PWA-кэш и оффлайн-режим',
                  ),
                  OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Логи',
                    subtitle: 'Последние ошибки и предупреждения',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
