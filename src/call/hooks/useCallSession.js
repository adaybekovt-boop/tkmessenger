// useCallSession — React adapter over CallManager.
//
// Responsibility is intentionally narrow:
//   1. Spin up a CallManager on mount, tear it down on unmount.
//   2. Mirror `state-change` events into a React state slot so components
//      re-render on transitions.
//   3. Expose stable refs for <video> element binding and bound method
//      references for JSX (`onClick={startCall}`).
//
// Zero business logic lives here. If you need to change glare handling,
// track replacement, or stream ownership — go to the relevant module in
// call/state, call/media, call/screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CallManager } from '../CallManager.js';
import { createInitialCallState } from '../state/initialCallState.js';
import { notifyIncomingCall } from '../../core/notifications.js';

export function useCallSession({ peerRef, peerIdRef, blockedPeersRef } = {}) {
  const [state, setState] = useState(createInitialCallState);
  const managerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Construct once. Refs are captured by reference, so peerRef.current etc.
  // stay live even though the manager is built on first render.
  if (!managerRef.current) {
    managerRef.current = new CallManager({
      peerRef,
      peerIdRef,
      blockedPeersRef,
      onIncomingCallNotification: notifyIncomingCall
    });
  }

  // Subscribe to state changes + bind <video> elements to the latest streams.
  useEffect(() => {
    const mgr = managerRef.current;
    const offState = mgr.on('state-change', (snap) => {
      setState(snap);
      if (localVideoRef.current && localVideoRef.current.srcObject !== snap.localStream) {
        localVideoRef.current.srcObject = snap.localStream || null;
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== snap.remoteStream) {
        remoteVideoRef.current.srcObject = snap.remoteStream || null;
      }
    });
    const offError = mgr.on('error', (err) => {
      try { console.warn('[call]', err?.name || 'error', err?.message || err); } catch (_) {}
    });
    return () => {
      offState();
      offError();
      mgr.dispose();
      managerRef.current = null;
    };
  }, []);

  // Bound methods — stable identity so callers can pass them straight into
  // JSX without worrying about re-renders.
  const startCall = useCallback((remoteId, opts) => managerRef.current?.startCall(remoteId, opts), []);
  const acceptCall = useCallback(() => managerRef.current?.accept(), []);
  const rejectCall = useCallback(() => managerRef.current?.reject(), []);
  const endCall = useCallback(() => managerRef.current?.end(), []);
  const toggleAudio = useCallback(() => managerRef.current?.toggleAudio(), []);
  const toggleVideo = useCallback(() => managerRef.current?.toggleVideo(), []);
  const switchCamera = useCallback(() => managerRef.current?.switchCamera(), []);
  const startScreenShare = useCallback(() => managerRef.current?.startScreenShare(), []);
  const stopScreenShare = useCallback(() => managerRef.current?.stopScreenShare(), []);
  const toggleScreenShare = useCallback(() => managerRef.current?.toggleScreenShare(), []);
  const handleIncomingCall = useCallback((call) => managerRef.current?.handleIncomingCall(call), []);

  return useMemo(() => ({
    callState: state,
    localVideoRef,
    remoteVideoRef,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    switchCamera,
    startScreenShare,
    stopScreenShare,
    toggleScreenShare,
    handleIncomingCall
  }), [
    state, startCall, acceptCall, rejectCall, endCall, toggleAudio, toggleVideo,
    switchCamera, startScreenShare, stopScreenShare, toggleScreenShare, handleIncomingCall
  ]);
}
