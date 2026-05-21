// "Вышла новая версия! Обновить?" dialog.
//
// Shown by AppShell once per session when `updateCheckProvider`
// resolves to a non-null UpdateInfo. Buttons:
//   • Обновить → calls `applyUpdate` — on web this reloads the page
//                after dropping the SW cache; on native it opens the
//                release page in the system browser.
//   • Позже   → persists the skipped version (`markUpdateSkipped`)
//                so we don't pester the user about this exact release
//                again. The next published tag re-opens the prompt.
//
// The release notes block is best-effort: trimmed to a sensible chunk
// and rendered as plain text. We deliberately don't parse the
// Markdown — release bodies are usually short enough that bullet
// dashes read fine raw, and pulling in a markdown renderer just for
// this dialog isn't worth it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_version.dart';
import '../../core/haptics.dart';
import '../../core/update_applier.dart';
import '../../core/update_checker.dart';
import '../../state/update_provider.dart';
import '../../themes/orbits_tokens.dart';

/// Show the update dialog. Returns when the dialog is dismissed.
/// Safe to await: handles the "Обновить" hand-off and the "Позже"
/// persistence inline.
Future<void> showUpdateDialog(BuildContext context, UpdateInfo info) {
  return showDialog<void>(
    context: context,
    // Block-tap outside is fine — both actions are clearly labelled
    // and the dialog is informational, not a permission gate.
    barrierDismissible: true,
    builder: (ctx) => _UpdateDialog(info: info),
  );
}

class _UpdateDialog extends ConsumerStatefulWidget {
  const _UpdateDialog({required this.info});
  final UpdateInfo info;

  @override
  ConsumerState<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends ConsumerState<_UpdateDialog> {
  bool _busy = false;

  Future<void> _onUpdate() async {
    if (_busy) return;
    hapticTap();
    setState(() => _busy = true);
    final ok = await applyUpdate(widget.info);
    if (!mounted) return;
    if (!ok) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          const SnackBar(
            content: Text('Не удалось запустить обновление'),
            duration: Duration(seconds: 2),
          ),
        );
      return;
    }
    // On web `applyUpdate` triggers a `location.reload()`, so this
    // line never actually runs there — the whole Flutter view is
    // torn down. On native the browser is now open in the foreground;
    // close the dialog so the user comes back to a clean app.
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _onLater() async {
    hapticTap();
    await markUpdateSkipped(widget.info.version);
    // Invalidate the provider so subsequent watchers (e.g. a manual
    // "check now" button in settings) re-run from a clean state.
    ref.invalidate(updateCheckProvider);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    final notes = _trimNotes(widget.info.releaseNotes);

    return AlertDialog(
      backgroundColor: Color.lerp(tokens.bg, tokens.surface, 0.6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(tokens.radiusCard),
        side: BorderSide(color: tokens.border),
      ),
      titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: tokens.accentAlpha(0.18),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(
              Icons.system_update_alt,
              size: 20,
              color: tokens.accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Вышла новая версия!',
              style: TextStyle(
                fontFamily: tokens.fontHeading,
                fontWeight: FontWeight.w600,
                fontSize: 18,
                color: tokens.text,
              ),
            ),
          ),
        ],
      ),
      contentPadding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Version line — old → new, in mono so the digits align.
          RichText(
            text: TextSpan(
              style: TextStyle(
                fontFamily: tokens.fontMono,
                fontSize: 13,
                color: tokens.muted,
                height: 1.4,
              ),
              children: [
                TextSpan(text: kAppVersion),
                const TextSpan(text: '  →  '),
                TextSpan(
                  text: widget.info.version,
                  style: TextStyle(
                    color: tokens.accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (notes.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              constraints: const BoxConstraints(maxHeight: 200),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: tokens.bg.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(tokens.radiusButton),
                border: Border.all(color: tokens.border),
              ),
              child: SingleChildScrollView(
                child: Text(
                  notes,
                  style: TextStyle(
                    fontFamily: tokens.fontBody,
                    fontSize: 13,
                    height: 1.45,
                    color: tokens.text,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            'Обновить сейчас?',
            style: TextStyle(
              fontFamily: tokens.fontBody,
              fontSize: 14,
              color: tokens.text,
            ),
          ),
        ],
      ),
      actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      actions: [
        TextButton(
          onPressed: _busy ? null : _onLater,
          style: TextButton.styleFrom(foregroundColor: tokens.muted),
          child: const Text('Позже'),
        ),
        FilledButton.icon(
          onPressed: _busy ? null : _onUpdate,
          icon: _busy
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.refresh, size: 18),
          label: Text(_busy ? 'Обновляем…' : 'Обновить'),
        ),
      ],
    );
  }
}

/// Cap the rendered release notes so the dialog stays compact even when
/// someone ships a wall-of-text changelog. We keep the first 800 chars
/// and append an ellipsis — anyone curious about the rest can read the
/// full notes on the release page (linked on native; on web they're
/// just one git pull away).
String _trimNotes(String raw) {
  final trimmed = raw.trim();
  if (trimmed.length <= 800) return trimmed;
  return '${trimmed.substring(0, 800).trimRight()}…';
}
