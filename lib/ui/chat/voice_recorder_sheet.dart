// Voice recorder — modal bottom sheet, ports `src/components/
// VoiceRecorder.jsx` to Flutter.
//
// UX summary:
//  • Sheet opens → auto-requests mic permission → starts recording.
//  • Live waveform builds top-down from amplitude stream (same 48-bar
//    ceiling as the JS `compressSamples`).
//  • Duration counter updates every 100 ms, matches JS rounding
//    (1-decimal seconds).
//  • "Отправить" finalizes: stops recorder, reads the temp file,
//    compresses the sample buffer to ≤48 entries, invokes [onSend]
//    with a map the caller can splat into `MessagingNotifier.
//    sendVoice(...)`.
//  • "Отмена" stops recorder, deletes the temp file, pops with nothing.
//  • Minimum duration 0.2 s — a below-threshold tap (user pressed the
//    mic by mistake) closes the sheet silently, matching the JS
//    behaviour at VoiceRecorder.jsx:66-69.
//
// Encoder choice: AAC-LC (`audio/mp4`). The JS peer accepts any
// `voice.mime` verbatim (`messageProtocol.js:323`, researcher's trap
// #11), so we go with what Flutter `record` produces reliably on every
// platform rather than chasing the browser-specific WebM/Opus default.
// Web builds of `record` do emit WebM so that edge matches JS naturally.

import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Payload handed to [VoiceRecorderSheet.onSend]. Shape matches the
/// positional + named args of `MessagingNotifier.sendVoice` so the
/// caller can splat it with minimal glue.
class VoiceRecordResult {
  const VoiceRecordResult({
    required this.bytes,
    required this.mime,
    required this.durationSec,
    required this.waveform,
  });

  final Uint8List bytes;
  final String mime;
  final double durationSec;

  /// Normalized amplitudes in 0..1, ≤48 entries. Older recordings may be
  /// shorter if the user tapped send before 48 samples accumulated.
  final List<double> waveform;
}

class VoiceRecorderSheet extends StatefulWidget {
  const VoiceRecorderSheet({super.key, required this.onSend});

  /// Invoked with the final recording after the user taps «Отправить».
  /// The sheet pops itself first so the callback can run `sendVoice`
  /// without racing the close animation.
  final void Function(VoiceRecordResult result) onSend;

  @override
  State<VoiceRecorderSheet> createState() => _VoiceRecorderSheetState();
}

class _VoiceRecorderSheetState extends State<VoiceRecorderSheet> {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Amplitude>? _ampSub;
  Timer? _tick;

  /// Temp-file path chosen once on start. Deleted on cancel/send so we
  /// don't leak recordings to the app's cache dir.
  String? _tmpPath;

  /// Millisecond wall clock of recorder start — used to derive the live
  /// duration counter without awaiting the recorder's own timestamp.
  int _startedAtMs = 0;

  /// Live-running sample buffer; amplitude emits roughly every 100 ms
  /// (matches the JS rAF sampler's ~60 Hz after a single-frame
  /// downsample). We keep up to 120 and compress to 48 on stop, same as
  /// `compressSamples` in audioRecorder.js.
  final List<double> _samples = <double>[];
  static const int _sampleRingCap = 120;
  static const int _targetBars = 48;

  /// 'idle' → before permission / start. 'recording' → active capture.
  /// 'denied' → permission refused, sheet shows a retry-in-settings
  /// hint. 'error' → recorder threw; we surface a short message.
  _RecState _state = _RecState.idle;
  String? _errorMsg;

  /// Forces a rebuild on each tick so the counter + waveform update.
  /// The duration is derived from [_startedAtMs], not stored separately.
  int _tickVersion = 0;

  @override
  void initState() {
    super.initState();
    // Defer slightly so the sheet has rendered before we push the
    // permission prompt — on iOS the first-run dialog can freeze a
    // half-built route otherwise.
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void dispose() {
    _ampSub?.cancel();
    _tick?.cancel();
    // Order matters: the recorder's `stop()` future must resolve before
    // `dispose()` tears down the native session, or the plugin leaks a
    // file handle on Android (and throws a PlatformException which the
    // framework surfaces as an unhandled error in the flutter shell).
    // We run both sequentially inside an unawaited async closure so
    // `dispose` itself can remain synchronous for the framework
    // contract, but we DON'T let `_recorder.dispose()` overlap with an
    // in-flight stop.
    unawaited(() async {
      try {
        await _safeStop(discard: true);
      } catch (_) {}
      try {
        await _recorder.dispose();
      } catch (_) {}
    }());
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final ok = await _recorder.hasPermission();
      if (!ok) {
        if (!mounted) return;
        setState(() => _state = _RecState.denied);
        return;
      }
      final dir = await getTemporaryDirectory();
      final name =
          'voice_${DateTime.now().millisecondsSinceEpoch}_${_randomSuffix()}.m4a';
      final path = '${dir.path}${Platform.pathSeparator}$name';
      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          sampleRate: 44100,
          numChannels: 1,
        ),
        path: path,
      );
      if (!mounted) {
        unawaited(_recorder.stop());
        return;
      }
      _tmpPath = path;
      _startedAtMs = DateTime.now().millisecondsSinceEpoch;
      _ampSub = _recorder
          .onAmplitudeChanged(const Duration(milliseconds: 100))
          .listen(_onAmplitude, onError: (_) {
        // Amplitude stream errors are survivable — we lose the
        // waveform preview but the recording itself is fine.
      });
      _tick = Timer.periodic(
        const Duration(milliseconds: 120),
        (_) {
          if (!mounted) return;
          setState(() => _tickVersion++);
        },
      );
      setState(() {
        _state = _RecState.recording;
        _errorMsg = null;
      });
      HapticFeedback.mediumImpact();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _state = _RecState.error;
        _errorMsg = 'Не удалось начать запись';
      });
    }
  }

  void _onAmplitude(Amplitude a) {
    // `record` exposes decibels where 0 dB is peak and very negative
    // values mean silence. Map into 0..1 by clamping to the last 60 dB
    // — roughly matches the JS `√rms × 2.2` curve once you squint.
    final db = a.current;
    final norm = ((db + 60) / 60).clamp(0.0, 1.0);
    _samples.add(norm);
    if (_samples.length > _sampleRingCap) {
      _samples.removeAt(0);
    }
  }

  double _currentDurationSec() {
    if (_startedAtMs == 0) return 0;
    final ms = DateTime.now().millisecondsSinceEpoch - _startedAtMs;
    // 1-decimal-second precision, matches the JS wire format.
    return (ms / 100).round() / 10;
  }

  /// Compress the running sample buffer to ≤[_targetBars] entries. For
  /// small buffers we pass through; for larger ones we bucket and take
  /// max-per-bucket so percussive peaks stay visible. Mirrors
  /// `audioRecorder.js::compressSamples`.
  List<double> _compressWaveform() {
    if (_samples.isEmpty) return const <double>[];
    if (_samples.length <= _targetBars) return List<double>.from(_samples);
    final bucketSize = _samples.length / _targetBars;
    final out = <double>[];
    for (var i = 0; i < _targetBars; i++) {
      final start = (i * bucketSize).floor();
      final end = math.min(
        _samples.length,
        ((i + 1) * bucketSize).ceil(),
      );
      var peak = 0.0;
      for (var j = start; j < end; j++) {
        if (_samples[j] > peak) peak = _samples[j];
      }
      out.add(peak);
    }
    return out;
  }

  Future<void> _handleSend() async {
    if (_state != _RecState.recording) return;
    final durationSec = _currentDurationSec();
    if (durationSec < 0.2) {
      // Too-short tap — JS silently cancels. Surface a tiny hint so
      // first-time users know what happened.
      await _safeStop(discard: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(const SnackBar(
          content: Text('Слишком короткое сообщение'),
          duration: Duration(seconds: 2),
        ));
      Navigator.of(context).pop();
      return;
    }

    // Snapshot waveform BEFORE stop — the sub might cancel before the
    // last amplitude tick lands otherwise.
    final waveform = _compressWaveform();

    final path = await _safeStop(discard: false);
    if (!mounted) return;
    if (path == null) {
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(const SnackBar(
          content: Text('Запись не удалась'),
          duration: Duration(seconds: 2),
        ));
      Navigator.of(context).pop();
      return;
    }

    Uint8List bytes;
    try {
      bytes = await File(path).readAsBytes();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(const SnackBar(
          content: Text('Не удалось прочитать запись'),
          duration: Duration(seconds: 2),
        ));
      Navigator.of(context).pop();
      return;
    }
    unawaited(_deleteFile(path));

    final result = VoiceRecordResult(
      bytes: bytes,
      mime: 'audio/mp4',
      durationSec: durationSec,
      waveform: waveform,
    );
    Navigator.of(context).pop();
    widget.onSend(result);
  }

  Future<void> _handleCancel() async {
    await _safeStop(discard: true);
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  /// Stop the recorder and optionally delete the temp file. Returns the
  /// path on success (only meaningful for !discard), null on failure or
  /// if already stopped. Safe to call multiple times — the `record`
  /// plugin no-ops stop when not recording.
  Future<String?> _safeStop({required bool discard}) async {
    _ampSub?.cancel();
    _ampSub = null;
    _tick?.cancel();
    _tick = null;
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      path = null;
    }
    final effectivePath = path ?? _tmpPath;
    if (discard && effectivePath != null) {
      unawaited(_deleteFile(effectivePath));
      return null;
    }
    return effectivePath;
  }

  Future<void> _deleteFile(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {
      // Cache-dir cleanup is the OS's job if we fail here.
    }
  }

  String _randomSuffix() {
    final rng = math.Random();
    return rng.nextInt(0xFFFFFF).toRadixString(16).padLeft(6, '0');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Голосовое сообщение',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: scheme.onSurface.withValues(alpha: 0.75),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Закрыть',
                  icon: const Icon(Icons.close),
                  onPressed: _handleCancel,
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildBody(scheme),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _handleCancel,
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Отмена'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _state == _RecState.recording ? _handleSend : null,
                    icon: const Icon(Icons.send),
                    label: const Text('Отправить'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ColorScheme scheme) {
    switch (_state) {
      case _RecState.idle:
        return const SizedBox(
          height: 96,
          child: Center(child: CircularProgressIndicator()),
        );
      case _RecState.denied:
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Column(
            children: [
              Icon(Icons.mic_off, color: scheme.error, size: 32),
              const SizedBox(height: 8),
              Text(
                'Нужен доступ к микрофону',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.85),
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Разрешите доступ в настройках системы и попробуйте снова.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.65),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        );
      case _RecState.error:
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Column(
            children: [
              Icon(Icons.error_outline, color: scheme.error, size: 32),
              const SizedBox(height: 8),
              Text(
                _errorMsg ?? 'Ошибка записи',
                style: TextStyle(color: scheme.onSurface),
              ),
            ],
          ),
        );
      case _RecState.recording:
        final durationSec = _currentDurationSec();
        final waveform = _samples.isEmpty
            ? const <double>[]
            : _samples.length <= _targetBars
                ? List<double>.from(_samples)
                : _compressWaveform();
        return Column(
          children: [
            SizedBox(
              height: 64,
              child: _WaveformStrip(
                samples: waveform,
                color: scheme.primary,
                idleColor: scheme.primary.withValues(alpha: 0.3),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _RecordingDot(color: scheme.error),
                const SizedBox(width: 8),
                Text(
                  _formatDuration(durationSec),
                  style: TextStyle(
                    fontSize: 14,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: scheme.onSurface.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ],
        );
    }
  }
}

enum _RecState { idle, recording, denied, error }

/// Bar-based waveform renderer. Takes 0..1 amplitudes and paints them as
/// centered vertical bars. Empty list renders a single idle baseline so
/// the area doesn't collapse before the first amplitude tick.
class _WaveformStrip extends StatelessWidget {
  const _WaveformStrip({
    required this.samples,
    required this.color,
    required this.idleColor,
  });

  final List<double> samples;
  final Color color;
  final Color idleColor;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _WaveformPainter(
        samples: samples,
        color: color,
        idleColor: idleColor,
      ),
      size: Size.infinite,
    );
  }
}

class _WaveformPainter extends CustomPainter {
  _WaveformPainter({
    required this.samples,
    required this.color,
    required this.idleColor,
  });

  final List<double> samples;
  final Color color;
  final Color idleColor;

  @override
  void paint(Canvas canvas, Size size) {
    final barCount = samples.isEmpty ? 32 : samples.length;
    final totalWidth = size.width;
    final gap = 2.0;
    final barWidth = math.max(
      1.5,
      (totalWidth - gap * (barCount - 1)) / barCount,
    );
    final paint = Paint()..strokeCap = StrokeCap.round;
    final centerY = size.height / 2;
    for (var i = 0; i < barCount; i++) {
      final amp = samples.isEmpty ? 0.15 : samples[i].clamp(0.0, 1.0);
      final barHeight = math.max(2.0, amp * (size.height - 4));
      final left = i * (barWidth + gap);
      paint.color = samples.isEmpty ? idleColor : color;
      paint.strokeWidth = barWidth;
      canvas.drawLine(
        Offset(left + barWidth / 2, centerY - barHeight / 2),
        Offset(left + barWidth / 2, centerY + barHeight / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter old) =>
      old.samples != samples || old.color != color;
}

class _RecordingDot extends StatefulWidget {
  const _RecordingDot({required this.color});
  final Color color;

  @override
  State<_RecordingDot> createState() => _RecordingDotState();
}

class _RecordingDotState extends State<_RecordingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.4, end: 1.0).animate(_ctl),
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: widget.color,
        ),
      ),
    );
  }
}

String _formatDuration(double sec) {
  if (sec.isNaN || sec.isInfinite || sec < 0) return '0:00';
  final totalMs = (sec * 1000).round();
  final m = totalMs ~/ 60000;
  final s = (totalMs ~/ 1000) % 60;
  final mm = m.toString();
  final ss = s.toString().padLeft(2, '0');
  return '$mm:$ss';
}
