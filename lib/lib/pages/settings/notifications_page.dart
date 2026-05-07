// Settings → Уведомления.
//
// Mirrors `screen === 'notifications'` from JS Settings: a status row
// for the browser permission, plus a toggle for in-app sounds and a
// note that native push lands later.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';

const _kNotifPrefsKey = 'orbits_notif_prefs_v1';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  bool _enabled = true;
  bool _showPreview = true;
  bool _sound = true;
  bool _vibration = true;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kNotifPrefsKey);
    if (raw != null) {
      try {
        final m = jsonDecode(raw);
        if (m is Map) {
          _enabled = m['enabled'] != false;
          _showPreview = m['showPreview'] != false;
          _sound = m['sound'] != false;
          _vibration = m['vibration'] != false;
        }
      } catch (_) {}
    }
    if (mounted) setState(() => _loaded = true);
  }

  Future<void> _save() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(
      _kNotifPrefsKey,
      jsonEncode({
        'enabled': _enabled,
        'showPreview': _showPreview,
        'sound': _sound,
        'vibration': _vibration,
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Уведомления',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Permission ────────────────────────────────────────
          const OrbsSectionTitle('Разрешение системы'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
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
                    child: Icon(Icons.notifications_active,
                        color: tokens.accent, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Статус разрешения',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: tokens.text,
                            fontFamily: tokens.fontBody,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Native push появится после релиза. Сейчас работают '
                          'только in-app звуки и вибрация.',
                          style: TextStyle(
                            fontSize: 12,
                            color: tokens.muted,
                            fontFamily: tokens.fontBody,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── In-app preferences ───────────────────────────────
          const OrbsSectionTitle('In-app'),
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
                    label: 'Уведомления включены',
                    subtitle: _enabled
                        ? 'Звук + вибрация при новом сообщении в активном чате'
                        : 'Все уведомления отключены',
                    trailing: OrbsToggle(
                      value: _enabled,
                      onChanged: !_loaded
                          ? null
                          : (v) {
                              setState(() => _enabled = v);
                              _save();
                            },
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Звук',
                    subtitle: 'Тихий «динь» при получении',
                    trailing: OrbsToggle(
                      value: _sound,
                      onChanged: (!_loaded || !_enabled)
                          ? null
                          : (v) {
                              setState(() => _sound = v);
                              _save();
                            },
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Вибрация',
                    subtitle: 'Только на телефонах',
                    trailing: OrbsToggle(
                      value: _vibration,
                      onChanged: (!_loaded || !_enabled)
                          ? null
                          : (v) {
                              setState(() => _vibration = v);
                              _save();
                            },
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Предпросмотр в шторке',
                    subtitle: _enabled
                        ? 'Показывать текст сообщения, а не «новое сообщение»'
                        : 'Сначала включи уведомления',
                    trailing: OrbsToggle(
                      value: _showPreview,
                      onChanged: (!_loaded || !_enabled)
                          ? null
                          : (v) {
                              setState(() => _showPreview = v);
                              _save();
                            },
                    ),
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
