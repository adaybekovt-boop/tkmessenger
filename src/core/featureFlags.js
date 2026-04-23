// Runtime feature flags.
//
// Kept as module-level mutable state so tests and devtools can flip them
// without touching localStorage. The defaults match what ships to users.
// Persistence layer (if any) is out of scope here — the UI layer can call
// the setters on unlock if it reads from a stored preference.

const flags = {
  // Master switch for the X3DH fast path. When false, every handshake stays
  // on v3 (plain DH-of-ephemerals) even if a bundle is cached. Intended as a
  // kill-switch if a v4 interop bug shows up in the wild — we can flip it off
  // via a hotfix without ripping out the code path.
  x3dhEnabled: true
};

export function isX3dhEnabled() {
  return !!flags.x3dhEnabled;
}

export function setX3dhEnabled(value) {
  flags.x3dhEnabled = !!value;
}

/** Test-only reset. */
export function __resetFlagsForTests() {
  flags.x3dhEnabled = true;
}
