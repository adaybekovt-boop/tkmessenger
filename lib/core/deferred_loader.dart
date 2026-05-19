// Thin wrapper around Dart's `deferred as` loading. Used for routes
// whose code we want to fetch on demand rather than ship in the main
// bundle — chiefly the games tab, which pulls in chess move generation,
// blackjack table logic, and Block Blast's grid engine for a feature
// most users never open.
//
// On Flutter web each `deferred` library compiles to a separate chunk
// (`main.dart.js_N.part.js`) that's only fetched the first time
// `loadLibrary()` is awaited. The first navigation pays the round-trip;
// every subsequent open uses the cached chunk. On native/AOT builds
// `loadLibrary()` resolves synchronously — no harm, no gain.

import 'package:flutter/material.dart';

import '../themes/orbits_tokens.dart';

/// Wait on [load] (typically `someDeferredLib.loadLibrary`) and render
/// [builder] once it resolves. Shows a centered spinner while the chunk
/// is downloading and an error card if the fetch fails — the network can
/// fail mid-navigation on a flaky mobile connection, and a blank page
/// would leave the user wondering whether the app froze.
class DeferredRouteLoader extends StatefulWidget {
  const DeferredRouteLoader({
    super.key,
    required this.load,
    required this.builder,
    this.loadingLabel,
  });

  final Future<void> Function() load;
  final WidgetBuilder builder;

  /// Optional label under the spinner — useful when several deferred
  /// chunks share the same screen and we want to tell the user what's
  /// actually loading (e.g. "Шахматы…" vs "Block Blast…").
  final String? loadingLabel;

  @override
  State<DeferredRouteLoader> createState() => _DeferredRouteLoaderState();
}

class _DeferredRouteLoaderState extends State<DeferredRouteLoader> {
  late Future<void> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.load();
  }

  void _retry() {
    setState(() {
      _future = widget.load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = OrbitsTokens.of(context);
    return FutureBuilder<void>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  if (widget.loadingLabel != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      widget.loadingLabel!,
                      style: TextStyle(
                        color: tokens.muted,
                        fontFamily: tokens.fontBody,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        }
        if (snap.hasError) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off, color: tokens.muted, size: 36),
                    const SizedBox(height: 12),
                    Text(
                      'Не удалось загрузить модуль',
                      style: TextStyle(
                        fontFamily: tokens.fontHeading,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: tokens.text,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Проверь подключение и попробуй ещё раз.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: tokens.muted,
                        fontFamily: tokens.fontBody,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _retry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
            ),
          );
        }
        return widget.builder(context);
      },
    );
  }
}
