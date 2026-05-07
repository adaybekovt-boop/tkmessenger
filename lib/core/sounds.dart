// Port of src/core/sounds.js — programmatic sound effects.
//
// The JS source synthesises four short effects (send / receive / call / error)
// via the Web Audio API's oscillator + gain-envelope graph — no audio files
// needed. Flutter has no bundled equivalent; the usual approach is the
// `audioplayers` package (or `just_audio` for longer clips). Since neither is
// in the pubspec yet, this file ships the API surface as a no-op stub so
// call-sites compile. Replace the bodies once a dep is wired in.
//
// TODO(port): add `audioplayers` (or `just_audio`) to pubspec.yaml, then
// either ship 4 tiny AAC/WAV assets OR synthesise PCM frames in Dart and
// stream them through an `AudioPlayer`.

import 'notifications.dart';

/// The four effects the JS module exposes. String literals are preserved so
/// call-sites can pass the same values they used in React.
enum SoundKind { send, receive, call, error }

SoundKind? _soundKindFromString(String type) {
  switch (type) {
    case 'send':
      return SoundKind.send;
    case 'receive':
      return SoundKind.receive;
    case 'call':
      return SoundKind.call;
    case 'error':
      return SoundKind.error;
  }
  return null;
}

/// Mirrors the JS `preloadSounds()` — browser side this resumes a suspended
/// AudioContext after the first user gesture. In Flutter there's no such
/// requirement, but the symbol is kept so the onboarding screen can keep
/// its `preloadSounds()` call unchanged.
Future<void> preloadSounds() async {
  // TODO(port): once audioplayers is wired in, warm the player pool here.
}

/// Play a named sound effect. Respects the `sound` flag in notification
/// settings (same storage key as notifications.dart).
///
/// Accepts either a [SoundKind] or the JS-side string literals.
Future<void> playSound(Object type) async {
  try {
    final settings = getNotifSettings();
    if (!settings.sound) return;
    final SoundKind? kind =
        type is SoundKind ? type : (type is String ? _soundKindFromString(type) : null);
    if (kind == null) return;
    // TODO(port): synthesise or load a cached clip via audioplayers.
    // Intentional no-op — the JS source also swallows every audio failure
    // to avoid breaking app flow.
  } catch (_) {
    // Never break app flow for a missing sound.
  }
}
