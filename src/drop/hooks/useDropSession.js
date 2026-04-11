// useDropSession — thin React adapter over DropManager.
//
// Same shape as useCallSession: constructs the manager, mirrors state-change
// events into a React state slot, and returns stable bound methods so
// components can pass them straight into JSX without triggering re-renders.
//
// Zero business logic lives here. If you need to change beacon cadence,
// presence ranking, or transfer flow — touch the relevant module under
// src/drop/ and leave this file alone.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropManager } from '../DropManager.js';
import { createInitialDropState } from '../state/initialDropState.js';

export function useDropSession({ getIdentity, broadcastEphemeral, sendEphemeralTo } = {}) {
  const [state, setState] = useState(createInitialDropState);
  const managerRef = useRef(null);

  // Keep the caller's functions current without forcing effect re-runs.
  // The manager closes over these refs so it always sees the latest
  // broadcast/send implementations (which close over usePeer's connsRef).
  const configRef = useRef({ getIdentity, broadcastEphemeral, sendEphemeralTo });
  configRef.current = { getIdentity, broadcastEphemeral, sendEphemeralTo };

  useEffect(() => {
    const mgr = new DropManager({
      getIdentity: () => configRef.current.getIdentity?.() || { peerId: '', nickname: '' },
      broadcastEphemeral: (packet) => configRef.current.broadcastEphemeral?.(packet),
      sendEphemeralTo: (peerId, packet) => configRef.current.sendEphemeralTo?.(peerId, packet) ?? false
    });
    managerRef.current = mgr;
    const off = mgr.on('state-change', (snap) => setState(snap));
    return () => {
      off();
      mgr.dispose();
      managerRef.current = null;
    };
  }, []);

  // Bound methods — stable identity.
  const activate      = useCallback(() => managerRef.current?.activate(), []);
  const deactivate    = useCallback(() => managerRef.current?.deactivate(), []);
  const setVisibility = useCallback((v) => managerRef.current?.setVisibility(v), []);
  const handlePacket  = useCallback((id, p) => managerRef.current?.handlePacket(id, p), []);

  return useMemo(() => ({
    dropState: state,
    activate,
    deactivate,
    setVisibility,
    handlePacket
  }), [state, activate, deactivate, setVisibility, handlePacket]);
}
