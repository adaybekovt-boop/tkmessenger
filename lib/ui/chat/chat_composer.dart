// Message composer — textarea + send button + typing debounce + sticker
// button + attachment/voice buttons + reply preview row.
//
// Mirrors the main send path of the composer in `src/pages/Chats.jsx`.
// Sticker, attachment (file/image) and voice recorder entry points are
// all driven from here via [ComposerActions]. The composer only raises
// the intent — the owning page hosts the sheets / pickers / recorders.
//
// Typing-indicator semantics (matches JS):
//  • First non-empty keystroke → immediate `sendTyping(true)`.
//  • 3s idle (no further keystrokes) → `sendTyping(false)`.
//  • Field becomes empty → immediate `sendTyping(false)`.
//  • Send / blur / widget dispose → always `sendTyping(false)`.
//
// The debounce runs in the widget, not the notifier, because `sendTyping`
// is a fire-and-forget ephemeral packet and we don't want to add state to
// the notifier just to track a per-peer idle timer.
//
// Sticker / reply wiring: the composer doesn't own the sticker picker
// or the reply target itself — the page hosts both, and passes them down
// via [ComposerActions] (picker trigger + reply model + cancel callback).
// Keeps the composer trivially reusable across pages that have different
// reply/picker semantics (e.g. a future scratch-pad flow).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Callback bag injected by the owning page. The composer doesn't read
/// Riverpod directly so it stays trivially reusable (e.g. for a future
/// split-view tablet layout where two composers live side-by-side).
class ComposerActions {
  const ComposerActions({
    required this.onSend,
    required this.onTypingChanged,
    this.onOpenStickerPicker,
    this.onPickAttachment,
    this.onRecordVoice,
  });

  /// Dispatch the final trimmed text. Returning false keeps the draft in
  /// place (e.g. validation failure); true clears the field.
  final Future<bool> Function(String text) onSend;

  /// Notify the messaging layer that local typing state flipped. Safe to
  /// be a no-op in tests.
  final void Function(bool isTyping) onTypingChanged;

  /// Called when the user taps the sticker button. The page owns the
  /// picker instance — tapping here typically pops a modal sheet. Leave
  /// null to disable the sticker button entirely (e.g. in a read-only
  /// view).
  final VoidCallback? onOpenStickerPicker;

  /// Called when the user taps the paperclip button. Hook up the native
  /// file picker + [MessagingNotifier.sendFile]. Leave null to disable
  /// the button (e.g. read-only view or a host without storage access).
  final VoidCallback? onPickAttachment;

  /// Called when the user taps the mic button (long-press-to-talk is
  /// deferred to a later iteration — Day 4 opens a modal recorder sheet).
  /// Leave null to disable the button.
  final VoidCallback? onRecordVoice;
}

/// Preview payload rendered above the composer when the user has an
/// active reply target. The composer only renders it; the actual quote
/// data (and its cancel hook) lives with the page.
class ComposerReplyPreview {
  const ComposerReplyPreview({
    required this.authorLabel,
    required this.preview,
    required this.onCancel,
  });

  /// Display name or placeholder for the quoted author. Not a raw peer
  /// id — the page should resolve `customName`/`displayName` before
  /// handing it here.
  final String authorLabel;

  /// One-line excerpt for the body ("🖼 Стикер" / "🎤 Голосовое" /
  /// first-140 chars of text / etc). Use ellipsis for overflow.
  final String preview;

  /// Fired when the user taps the ✕ button to clear the reply target.
  final VoidCallback onCancel;
}

class ChatComposer extends StatefulWidget {
  const ChatComposer({super.key, required this.actions, this.replyPreview});
  final ComposerActions actions;

  /// When non-null, a preview pill is rendered above the text field and
  /// any call to [ComposerActions.onSend] implicitly carries the reply
  /// context (resolved by the page before it receives the send
  /// callback).
  final ComposerReplyPreview? replyPreview;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  final TextEditingController _ctl = TextEditingController();
  final FocusNode _focus = FocusNode();
  Timer? _typingIdle;
  bool _typingActive = false;

  // Guard against redundant setState on every keystroke — we only care
  // about "has content or not" for the send-button visibility.
  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    _ctl.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _typingIdle?.cancel();
    if (_typingActive) {
      // Best-effort notify so the peer doesn't see a stale "typing…"
      // bubble if we're disposed mid-type (navigation back, hot reload).
      widget.actions.onTypingChanged(false);
    }
    _ctl.removeListener(_onTextChanged);
    _ctl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final hasText = _ctl.text.trim().isNotEmpty;
    if (hasText != _hasText) {
      setState(() => _hasText = hasText);
    }
    if (hasText) {
      if (!_typingActive) {
        _typingActive = true;
        widget.actions.onTypingChanged(true);
      }
      _typingIdle?.cancel();
      _typingIdle = Timer(const Duration(seconds: 3), _stopTyping);
    } else {
      _stopTyping();
    }
  }

  void _stopTyping() {
    _typingIdle?.cancel();
    _typingIdle = null;
    if (_typingActive) {
      _typingActive = false;
      widget.actions.onTypingChanged(false);
    }
  }

  Future<void> _handleSend() async {
    final text = _ctl.text.trim();
    if (text.isEmpty) return;
    _stopTyping();
    final ok = await widget.actions.onSend(text);
    if (ok && mounted) {
      _ctl.clear();
      // Refocus so the user can keep typing without a second tap. Same
      // quality-of-life choice the web build makes by keeping `<textarea>`
      // focused after clear.
      _focus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final stickerEnabled = widget.actions.onOpenStickerPicker != null;
    final attachEnabled = widget.actions.onPickAttachment != null;
    final voiceEnabled = widget.actions.onRecordVoice != null;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
        decoration: BoxDecoration(
          color: scheme.surface,
          border: Border(
            top: BorderSide(
              color: scheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Reply preview pill ────────────────────────────────
            if (widget.replyPreview != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
                child: _ReplyPreviewRow(preview: widget.replyPreview!),
              ),

            // ── Input row ────────────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Paperclip — pops the native file picker via the
                // page-owned handler. Disabled → grey stub, same as
                // sticker button below.
                IconButton(
                  icon: const Icon(Icons.attach_file),
                  color: attachEnabled
                      ? scheme.onSurface.withValues(alpha: 0.9)
                      : scheme.onSurface.withValues(alpha: 0.4),
                  tooltip: attachEnabled ? 'Файл' : 'Файл (скоро)',
                  onPressed:
                      attachEnabled ? widget.actions.onPickAttachment : null,
                ),
                IconButton(
                  icon: const Icon(Icons.emoji_emotions_outlined),
                  color: stickerEnabled
                      ? scheme.onSurface.withValues(alpha: 0.9)
                      : scheme.onSurface.withValues(alpha: 0.4),
                  tooltip: stickerEnabled ? 'Стикеры' : 'Стикеры (скоро)',
                  onPressed: stickerEnabled
                      ? widget.actions.onOpenStickerPicker
                      : null,
                ),
                Expanded(
                  child: ConstrainedBox(
                    // Composer grows up to ~6 lines, then internal scroll —
                    // same ceiling the web build uses. Prevents a runaway
                    // multiline message from pushing the send button off-
                    // screen.
                    constraints: const BoxConstraints(maxHeight: 140),
                    child: TextField(
                      controller: _ctl,
                      focusNode: _focus,
                      minLines: 1,
                      maxLines: null,
                      keyboardType: TextInputType.multiline,
                      textInputAction: TextInputAction.newline,
                      inputFormatters: [
                        // Matches the JS 32 KiB cap (`_maxTextLen` in
                        // messaging_notifier.dart). Cheap guard; the
                        // notifier still validates server-side.
                        LengthLimitingTextInputFormatter(32 * 1024),
                      ],
                      decoration: InputDecoration(
                        hintText: 'Сообщение',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        filled: true,
                        fillColor: scheme.surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                // Send (paper plane) on a draft with text; mic on an
                // empty draft — matches the JS peer's composer and
                // keeps the button count stable. If the host disabled
                // voice (`onRecordVoice == null`) we still show send
                // but faded, same as before.
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 120),
                  transitionBuilder: (child, anim) => FadeTransition(
                    opacity: anim,
                    child: ScaleTransition(
                      scale: Tween<double>(begin: 0.85, end: 1.0)
                          .animate(anim),
                      child: child,
                    ),
                  ),
                  child: (_hasText || !voiceEnabled)
                      ? IconButton.filled(
                          key: const ValueKey('send'),
                          onPressed: _hasText ? _handleSend : null,
                          icon: const Icon(Icons.send),
                          style: IconButton.styleFrom(
                            backgroundColor: _hasText
                                ? scheme.primary
                                : scheme.primary.withValues(alpha: 0.45),
                            foregroundColor: scheme.onPrimary,
                          ),
                        )
                      : IconButton.filled(
                          key: const ValueKey('mic'),
                          onPressed: widget.actions.onRecordVoice,
                          icon: const Icon(Icons.mic),
                          tooltip: 'Голосовое сообщение',
                          style: IconButton.styleFrom(
                            backgroundColor: scheme.primary,
                            foregroundColor: scheme.onPrimary,
                          ),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplyPreviewRow extends StatelessWidget {
  const _ReplyPreviewRow({required this.preview});
  final ComposerReplyPreview preview;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 32,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  // Colon-style join dodges the case-inflection grammar
                  // trap ("Ответ Alice" vs "Ответ для Alice" vs "Ответ
                  // вам") — the label is always rendered as-is after the
                  // colon so contact names in any language/case survive.
                  'Ответ: ${preview.authorLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  preview.preview.isEmpty ? '…' : preview.preview,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurface.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Отменить ответ',
            icon: const Icon(Icons.close, size: 18),
            onPressed: preview.onCancel,
          ),
        ],
      ),
    );
  }
}
