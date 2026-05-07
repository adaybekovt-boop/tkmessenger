// Port of src/core/featureFlags.js — runtime feature flags.
//
// Module-level mutable state (matches JS). Persistence is out of scope here;
// UI code can call the setters on unlock if it reads from stored prefs.

class _Flags {
  bool x3dhEnabled = true;
}

final _Flags _flags = _Flags();

/// Master switch for the X3DH fast path. When false, every handshake stays on
/// v3 (plain DH-of-ephemerals) even if a bundle is cached.
bool isX3dhEnabled() => _flags.x3dhEnabled;

void setX3dhEnabled(bool value) {
  _flags.x3dhEnabled = value;
}

/// Test-only reset. Do not call from production code.
void resetFlagsForTests() {
  _flags.x3dhEnabled = true;
}
