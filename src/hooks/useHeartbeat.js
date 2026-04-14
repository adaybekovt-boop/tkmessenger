// useHeartbeat — owns the periodic heartbeat interval on ephemeral channels
// and the stale-peer detection logic. Extracted from usePeer.
//
// Dependencies injected from the caller (usePeer):
//   - connsRef               — ref holding the Map<connKey, DataConnection>
//   - peerIdRef              — ref holding the current local peer id
//   - peersRef               — ref holding the contacts array
//   - getConn                — (remoteId, channel) => DataConnection | null
//   - upsertPeer             — updates contact status
//   - sendEncryptedEphemeral — (remoteId, msg) => Promise<boolean>

import { useCallback, useRef } from 'react';
import { now } from '../peer/helpers.js';

export function useHeartbeat({ connsRef, peerIdRef, peersRef, getConn, upsertPeer, sendEncryptedEphemeral, isDropInProgressRef }) {
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatByPeerRef = useRef(new Map());

  const ensureHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) return;
    heartbeatIntervalRef.current = setInterval(() => {
      // Freeze heartbeat while a file transfer is active to prevent
      // interfering with the DataChannel buffer and causing drops.
      if (isDropInProgressRef?.current) return;

      const my = String(peerIdRef.current || '');
      const nowTs = now();
      for (const [key] of connsRef.current.entries()) {
        if (!key.endsWith('|ephemeral')) continue;
        const remoteId = key.split('|')[0];
        void sendEncryptedEphemeral(remoteId, { type: 'hb', from: my, ts: nowTs });
      }
      for (const p of peersRef.current) {
        const rid = p.id;
        const last = lastHeartbeatByPeerRef.current.get(rid) || 0;
        const reliable = getConn(rid, 'reliable');
        if (reliable?.open) {
          // Reliable channel is alive — ensure status reflects online.
          if (p.status !== 'online') upsertPeer(rid, { status: 'online' });
        } else if (last && nowTs - last > 45000) {
          // 45s without heartbeat on ephemeral = probably offline.
          // Previous 25s threshold was too aggressive for mobile networks
          // where background tabs throttle timers.
          upsertPeer(rid, { status: 'offline' });
        }
      }
    }, 10000);
  }, [connsRef, getConn, peerIdRef, peersRef, sendEncryptedEphemeral, upsertPeer, isDropInProgressRef]);

  const stopHeartbeatIfIdle = useCallback(() => {
    if (!heartbeatIntervalRef.current) return;
    for (const [key, conn] of connsRef.current.entries()) {
      if (!key.endsWith('|ephemeral')) continue;
      if (conn?.open) return;
    }
    clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = null;
  }, [connsRef]);

  const cleanup = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    lastHeartbeatByPeerRef.current.clear();
  }, []);

  return { ensureHeartbeat, stopHeartbeatIfIdle, lastHeartbeatByPeerRef, cleanup };
}
