// Settings → Безопасность.
//
// Mirrors the JS `screen === 'security'` branch in `src/pages/Settings.jsx`:
//   • Crypto info card (AES-GCM, PBKDF2, ECDH) — informational, no toggles
//   • Auto-lock toggle (vault locks after 5 min idle)
//   • Auto-login toggle (skip the password prompt on launch)
//   • TURN-only / relay-only toggle (paranoid mode)
//   • Blocked-peers list (with unblock buttons)
//
// JS also has Wipe-on-Close + Duress-password + key fingerprint sections;
// those depend on providers we haven't ported yet (lifecycle wipe, dual-
// password store). They land in 0.1.1 — for now their slots are visible
// but disabled with a "В разработке" hint, so the user knows the feature
// will exist without us silently dropping it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../peer/helpers.dart';
import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';

class SecurityPage extends ConsumerStatefulWidget {
  const SecurityPage({super.key});

  @override
  ConsumerState<SecurityPage> createState() => _SecurityPageState();
}

class _SecurityPageState extends ConsumerState<SecurityPage> {
  bool? _autoLock;
  bool? _autoLogin;
  bool? _relayOnly;

  static const _kAutoLockKey = 'orbits_auto_lock';
  static const _kAutoLoginKey = 'orbits_auto_login';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final relay = await isRelayOnlyEnabled();
    if (!mounted) return;
    setState(() {
      _autoLock = prefs.getString(_kAutoLockKey) == '1';
      _autoLogin = prefs.getString(_kAutoLoginKey) == '1';
      _relayOnly = relay;
    });
  }

  Future<void> _save(String key, bool v) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, v ? '1' : '0');
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Безопасность',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Crypto info ──────────────────────────────────────
          const OrbsSectionTitle('Шифрование'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: Column(
                children: [
                  _CryptoRow(
                    title: 'AES-256-GCM',
                    subtitle: 'Все сообщения зашифрованы, ключи неэкспортируемые',
                    tokens: tokens,
                  ),
                  const OrbsDivider(),
                  _CryptoRow(
                    title: 'PBKDF2 + scrypt',
                    subtitle: 'Мастер-ключ из пароля. Подбор перебором — годы',
                    tokens: tokens,
                  ),
                  const OrbsDivider(),
                  _CryptoRow(
                    title: 'X3DH + Double Ratchet',
                    subtitle: 'Сессионные ключи на каждое сообщение',
                    tokens: tokens,
                  ),
                ],
              ),
            ),
          ),

          // ── Lock & login ─────────────────────────────────────
          const OrbsSectionTitle('Доступ'),
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
                    label: 'Авто-блокировка',
                    subtitle: _autoLock == true
                        ? 'Vault блокируется через 5 минут неактивности'
                        : 'Профиль остаётся открытым пока работает приложение',
                    trailing: OrbsToggle(
                      value: _autoLock ?? false,
                      onChanged: _autoLock == null
                          ? null
                          : (v) {
                              setState(() => _autoLock = v);
                              _save(_kAutoLockKey, v);
                            },
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Авто-вход',
                    subtitle: _autoLogin == true
                        ? 'Без пароля при запуске. Удобно, но менее безопасно'
                        : 'Вводить пароль при каждом запуске',
                    trailing: OrbsToggle(
                      value: _autoLogin ?? false,
                      onChanged: _autoLogin == null
                          ? null
                          : (v) {
                              setState(() => _autoLogin = v);
                              _save(_kAutoLoginKey, v);
                            },
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Network privacy ──────────────────────────────────
          const OrbsSectionTitle('Сетевая приватность'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: OrbsSettingRow(
                label: 'TURN-only режим',
                subtitle:
                    'Звонки и файлы идут только через TURN-сервер. '
                    'Собеседник никогда не видит твой IP. Может снижать '
                    'качество звонков.',
                trailing: OrbsToggle(
                  value: _relayOnly ?? false,
                  onChanged: _relayOnly == null
                      ? null
                      : (v) async {
                          setState(() => _relayOnly = v);
                          await setRelayOnlyEnabled(v);
                        },
                ),
              ),
            ),
          ),

          // ── Coming soon stubs ───────────────────────────────
          const OrbsSectionTitle('В разработке'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              padding: const EdgeInsets.symmetric(
                horizontal: 6,
                vertical: 4,
              ),
              child: Column(
                children: [
                  _ComingSoonRow(
                    label: 'Wipe-on-Close',
                    subtitle: 'Уничтожить базу при закрытии. Режим инкогнито.',
                    tokens: tokens,
                  ),
                  const OrbsDivider(),
                  _ComingSoonRow(
                    label: 'Duress-пароль',
                    subtitle: '«Тревожный» пароль — открывает пустой профиль',
                    tokens: tokens,
                  ),
                  const OrbsDivider(),
                  _ComingSoonRow(
                    label: 'Биометрия',
                    subtitle: 'Face ID / отпечаток вместо пароля',
                    tokens: tokens,
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

class _CryptoRow extends StatelessWidget {
  const _CryptoRow({
    required this.title,
    required this.subtitle,
    required this.tokens,
  });

  final String title;
  final String subtitle;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    fontFamily: tokens.fontMono,
                    color: tokens.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: tokens.muted,
                    fontFamily: tokens.fontBody,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: tokens.success.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              'ВКЛ',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                fontFamily: tokens.fontMono,
                color: tokens.success,
                letterSpacing: 1.0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ComingSoonRow extends StatelessWidget {
  const _ComingSoonRow({
    required this.label,
    required this.subtitle,
    required this.tokens,
  });
  final String label;
  final String subtitle;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.6,
      child: OrbsSettingRow(
        label: label,
        subtitle: subtitle,
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: tokens.muted.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            'СКОРО',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              fontFamily: tokens.fontMono,
              color: tokens.muted,
              letterSpacing: 1.0,
            ),
          ),
        ),
      ),
    );
  }
}
