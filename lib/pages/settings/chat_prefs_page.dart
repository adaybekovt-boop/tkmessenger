// Settings → Чаты.
//
// All the per-conversation behaviour toggles, plus the bubble-style /
// font-size pickers from `src/components/ChatSettings.jsx`. Stored under
// `orbits_chat_prefs_v1` in SharedPreferences — same key the message
// renderer reads, so the toggles affect message UI immediately.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../themes/orbits_tokens.dart';
import '../../ui/primitives/orbs_card.dart';

const _kChatPrefsKey = 'orbits_chat_prefs_v1';

class ChatPrefs {
  const ChatPrefs({
    this.showSeconds = false,
    this.autoRead = true,
    this.messageSounds = true,
    this.vibration = true,
    this.fontSize = 'M',
    this.bubbleStyle = 'rounded',
  });

  final bool showSeconds;
  final bool autoRead;
  final bool messageSounds;
  final bool vibration;

  /// One of: 'XS', 'S', 'M', 'L', 'XL'.
  final String fontSize;

  /// One of: 'rounded', 'soft', 'square', 'bubble'.
  final String bubbleStyle;

  ChatPrefs copyWith({
    bool? showSeconds,
    bool? autoRead,
    bool? messageSounds,
    bool? vibration,
    String? fontSize,
    String? bubbleStyle,
  }) =>
      ChatPrefs(
        showSeconds: showSeconds ?? this.showSeconds,
        autoRead: autoRead ?? this.autoRead,
        messageSounds: messageSounds ?? this.messageSounds,
        vibration: vibration ?? this.vibration,
        fontSize: fontSize ?? this.fontSize,
        bubbleStyle: bubbleStyle ?? this.bubbleStyle,
      );
}

class ChatPrefsPage extends StatefulWidget {
  const ChatPrefsPage({super.key});

  @override
  State<ChatPrefsPage> createState() => _ChatPrefsPageState();
}

class _ChatPrefsPageState extends State<ChatPrefsPage> {
  ChatPrefs _prefs = const ChatPrefs();
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kChatPrefsKey);
    if (raw != null) {
      try {
        final m = jsonDecode(raw);
        if (m is Map) {
          _prefs = ChatPrefs(
            showSeconds: m['showSeconds'] == true,
            autoRead: m['autoRead'] != false,
            messageSounds: m['messageSounds'] != false,
            vibration: m['vibration'] != false,
            fontSize: (m['fontSize'] as String?) ?? 'M',
            bubbleStyle: (m['bubbleStyle'] as String?) ?? 'rounded',
          );
        }
      } catch (_) {}
    }
    if (mounted) setState(() => _loaded = true);
  }

  Future<void> _save(ChatPrefs next) async {
    setState(() => _prefs = next);
    final sp = await SharedPreferences.getInstance();
    await sp.setString(
      _kChatPrefsKey,
      jsonEncode({
        'showSeconds': next.showSeconds,
        'autoRead': next.autoRead,
        'messageSounds': next.messageSounds,
        'vibration': next.vibration,
        'fontSize': next.fontSize,
        'bubbleStyle': next.bubbleStyle,
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Чаты',
          style: TextStyle(
            fontFamily: tokens.fontHeading,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          // ── Behaviour ────────────────────────────────────────
          const OrbsSectionTitle('Поведение'),
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
                    label: 'Показывать секунды',
                    subtitle: 'Время сообщений в формате ЧЧ:ММ:СС',
                    trailing: OrbsToggle(
                      value: _prefs.showSeconds,
                      onChanged: !_loaded
                          ? null
                          : (v) => _save(_prefs.copyWith(showSeconds: v)),
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Авто-прочтение',
                    subtitle:
                        'Помечать сообщения прочитанными при открытии чата',
                    trailing: OrbsToggle(
                      value: _prefs.autoRead,
                      onChanged: !_loaded
                          ? null
                          : (v) => _save(_prefs.copyWith(autoRead: v)),
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Звуки сообщений',
                    subtitle: 'Тихий «динь» при получении',
                    trailing: OrbsToggle(
                      value: _prefs.messageSounds,
                      onChanged: !_loaded
                          ? null
                          : (v) => _save(_prefs.copyWith(messageSounds: v)),
                    ),
                  ),
                  const OrbsDivider(),
                  OrbsSettingRow(
                    label: 'Вибрация',
                    subtitle: 'Короткое касание при новом сообщении',
                    trailing: OrbsToggle(
                      value: _prefs.vibration,
                      onChanged: !_loaded
                          ? null
                          : (v) => _save(_prefs.copyWith(vibration: v)),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Bubble style ─────────────────────────────────────
          const OrbsSectionTitle('Форма пузырей'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final style in const [
                        ('rounded', 'Округлый'),
                        ('soft', 'Мягкий'),
                        ('square', 'Квадрат'),
                        ('bubble', 'Пузырь'),
                      ])
                        _PickerChip(
                          label: style.$2,
                          selected: _prefs.bubbleStyle == style.$1,
                          onTap: !_loaded
                              ? null
                              : () => _save(
                                  _prefs.copyWith(bubbleStyle: style.$1)),
                          tokens: tokens,
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Применяется ко всем чатам. Конкретный чат может быть '
                    'переопределён через его настройки.',
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

          // ── Font size ────────────────────────────────────────
          const OrbsSectionTitle('Размер шрифта'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: OrbsCard(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (final size in const ['XS', 'S', 'M', 'L', 'XL'])
                    _SizeButton(
                      label: size,
                      selected: _prefs.fontSize == size,
                      onTap: !_loaded
                          ? null
                          : () => _save(_prefs.copyWith(fontSize: size)),
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

class _PickerChip extends StatelessWidget {
  const _PickerChip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.tokens,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(tokens.radiusButton),
        child: AnimatedContainer(
          duration: tokens.durationShort,
          curve: tokens.easing,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? tokens.accentAlpha(0.18)
                : tokens.surface.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(tokens.radiusButton),
            border: Border.all(
              color: selected ? tokens.accent : tokens.border,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected ? tokens.accent : tokens.text,
              fontFamily: tokens.fontBody,
            ),
          ),
        ),
      ),
    );
  }
}

class _SizeButton extends StatelessWidget {
  const _SizeButton({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.tokens,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final OrbitsTokens tokens;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: tokens.durationShort,
          curve: tokens.easing,
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected
                ? tokens.accentAlpha(0.18)
                : tokens.surface.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? tokens.accent : tokens.border,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected ? tokens.accent : tokens.text,
              fontFamily: tokens.fontMono,
            ),
          ),
        ),
      ),
    );
  }
}
