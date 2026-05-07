// Port of src/core/emitter.js — framework-agnostic event emitter shared by
// CallManager, DropManager, etc.
//
// Same API surface as JS: on(event, fn) → unsub, off(event, fn), emit(event, data), clear().
// Using a plain Map<Set> rather than Dart's Stream so the semantics (sync
// dispatch, swallowed listener errors, explicit unsubscribe) are identical.

typedef EmitterListener = void Function(Object? payload);

class Emitter {
  final Map<String, Set<EmitterListener>> _listeners = {};

  /// Subscribe. Returns an unsubscribe function.
  void Function() on(String event, EmitterListener fn) {
    _listeners.putIfAbsent(event, () => <EmitterListener>{}).add(fn);
    return () => off(event, fn);
  }

  /// Unsubscribe a previously attached listener.
  void off(String event, EmitterListener fn) {
    _listeners[event]?.remove(fn);
  }

  /// Dispatch an event with a payload. Listener errors are swallowed (match JS).
  void emit(String event, [Object? payload]) {
    final set = _listeners[event];
    if (set == null) return;
    // Copy to a list — listeners may unsubscribe mid-dispatch without mutating
    // the set we're iterating over.
    for (final fn in set.toList()) {
      try {
        fn(payload);
      } catch (_) {}
    }
  }

  /// Remove all listeners. Called on dispose.
  void clear() => _listeners.clear();
}
