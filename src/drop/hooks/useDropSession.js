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
import { DropStatus } from '../state/DropStatus.js';

export function useDropSession({ getIdentity, broadcastEphemeral, sendEphemeralTo, getConn } = {}) {
  const [state, setState] = useState(createInitialDropState);
  const managerRef = useRef(null);

  // Keep the caller's functions current without forcing effect re-runs.
  const configRef = useRef({ getIdentity, broadcastEphemeral, sendEphemeralTo, getConn });
  configRef.current = { getIdentity, broadcastEphemeral, sendEphemeralTo, getConn };

  useEffect(() => {
    const mgr = new DropManager({
      getIdentity: () => configRef.current.getIdentity?.() || { peerId: '', nickname: '' },
      broadcastEphemeral: (packet) => configRef.current.broadcastEphemeral?.(packet),
      sendEphemeralTo: (peerId, packet) => configRef.current.sendEphemeralTo?.(peerId, packet) ?? false,
      getConn: (peerId) => configRef.current.getConn?.(peerId) ?? null
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
  const requestDrop   = useCallback((peerId, files, quality) => managerRef.current?.requestDrop(peerId, files, quality), []);
  const acceptDrop    = useCallback(() => managerRef.current?.acceptDrop(), []);
  const rejectDrop    = useCallback((reason) => managerRef.current?.rejectDrop(reason), []);
  const cancelRequest = useCallback(() => managerRef.current?.cancelRequest(), []);

  const isDropInProgress = state.status === DropStatus.TRANSFERRING;

  return useMemo(() => ({
    dropState: state,
    isDropInProgress,
    activate,
    deactivate,
    setVisibility,
    handlePacket,
    requestDrop,
    acceptDrop,
    rejectDrop,
    cancelRequest
  }), [state, isDropInProgress, activate, deactivate, setVisibility, handlePacket, requestDrop, acceptDrop, rejectDrop, cancelRequest]);
}
