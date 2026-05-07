// Settings → Энергосбережение.
//
// Single big toggle: lite-mode on/off. When on, atmospheric backgrounds
// freeze (no animated petals/orbs), blur is dropped, animations are
// shortened. The actual gating happens via `PerfBudgetNotifier` in
// `lib/themes/perf_budget.dart`; this page is just a UI to flip the
// preference.

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';

const _kPowerSaverKey = 'orbits_power_saver';

class PowerSaverPage extends StatefulWidget {
  const PowerSaverPage({super.key});

  @override
  State<PowerSaverPage> createState() => _PowerSaverPageState();
}

class _PowerSaverPageState extends State<PowerSaverPage> {
  bool? _powerSaver;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_kPowerSaverKey) == '1';
    if (mounted) setState(() => _powerSaver = v);
  }

  Future<void> _set(bool v) async {
    setState(() => _powerSaver = v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kPowerSaverKey, v ? '1' : '0');
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Энергосбережение',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          const OrbsSectionTitle('Лёгкий режим'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: OrbsSettingRow(
                label: 'Включён',
                subtitle: 'Отключает blur и анимированные фоны. '
                    'Уменьшает нагрузку на CPU и батарею.',
                trailing: OrbsToggle(
                  value: _powerSaver ?? false,
                  onChanged: _powerSaver == null ? null : (v) => _set(v),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.battery_saver, size: 16, color: tokens.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Полезно на слабых телефонах или при низком заряде. '
                    'Когда выключен — анимированные темы (Sakura, Graphite) '
                    'работают на полную.',
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
}
