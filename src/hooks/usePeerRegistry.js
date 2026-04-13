// usePeerRegistry — peer contact list, per-peer profile cache, and block list.
//
// Extracted from usePeer to isolate "who do I know" state from the transport
// and messaging layers. Owns:
//   - peers (contacts) in memory + persistence to localStorage/IndexedDB
//   - profilesByPeer (avatars hydrated from IndexedDB on mount)
//   - blockedPeers (with a stable ref for synchronous checks)
//
// Side-effect persistence:
//   - known peers mirrored to localStorage via a small debounce
//   - new peers also `savePeer`'d into IndexedDB for post-logout recovery
//   - blockedPeers mirrored to localStorage on every change

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAvatar, getAllPeers, savePeer } from '../core/db.js';
import { STORAGE, normalizePeerId, isValidPeerId, safeJsonParse, now } from '../peer/helpers.js';

/** Reject IDs that look like test/garbage data. */
function isTrustedPeerId(id) {
  if (!isValidPeerId(id)) return false;
  const upper = normalizePeerId(id);
  if (upper.startsWith('INVALID')) return false;
  if (upper.startsWith('TEST')) return false;
  return true;
}

export function usePeerRegistry() {
  const [peers, setPeers] = useState([]);
  const [profilesByPeer, setProfilesByPeer] = useState(() => {
    const stored = safeJsonParse(localStorage.getItem(STORAGE.profiles), {});
    return stored && typeof stored === 'object' ? stored : {};
  });
  const [blockedPeers, setBlockedPeers] = useState(() => {
    const parsed = safeJsonParse(
      (() => { try { return localStorage.getItem(STORAGE.blockedPeers); } catch (_) { return null; } })(),
      null
    );
    return Array.isArray(parsed) ? parsed : [];
  });

  const peersRef = useRef(peers);
  const blockedPeersRef = useRef(blockedPeers);

  useEffect(() => { peersRef.current = peers; }, [peers]);
  useEffect(() => { blockedPeersRef.current = blockedPeers; }, [blockedPeers]);

  const upsertPeer = useCallback((id, patch) => {
    const normalized = normalizePeerId(id);
    if (!isTrustedPeerId(normalized)) return;
    setPeers((prev) => {
      const idx = prev.findIndex((p) => p.id === normalized);
      const next = { id: normalized, status: 'offline', lastSeenAt: 0, ...patch };
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
    savePeer({ id: normalized, lastSeenAt: patch?.lastSeenAt || Date.now(), trusted: true }).catch(() => {});
  }, []);

  // Hydrate profile avatars from IndexedDB (avatars live in IDB, not localStorage,
  // because they can be ~100KB each and would blow the 5MB localStorage quota).
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = safeJsonParse(localStorage.getItem(STORAGE.profiles), {});
      if (!stored || typeof stored !== 'object') return;
      const pids = Object.keys(stored);
      for (const pid of pids) {
        if (!active) break;
        try {
          const av = await getAvatar(pid);
          if (av && active) {
            setProfilesByPeer((prev) => {
              if (!prev[pid]) return prev;
              return { ...prev, [pid]: { ...prev[pid], avatarDataUrl: av } };
            });
          }
        } catch (_) {}
      }
    })();
    return () => { active = false; };
  }, []);

  // Persist peers list to localStorage on change (skip empty list to avoid
  // wiping saved contacts during logout/disable).
  useEffect(() => {
    if (!peers.length) return;
    const toSave = peers.map((p) => ({ id: p.id, lastSeenAt: p.lastSeenAt || 0 }));
    try { localStorage.setItem(STORAGE.knownPeers, JSON.stringify(toSave)); } catch (_) {}
  }, [peers]);

  // Initial hydration helper: called from the PeerJS `open` event so we can
  // use the fresh peer id and recover contacts from IndexedDB if localStorage
  // got wiped.
  const hydrateFromStorage = useCallback(async () => {
    let savedPeers = safeJsonParse(localStorage.getItem(STORAGE.knownPeers), []);
    if (Array.isArray(savedPeers) && savedPeers.length) {
      setPeers(savedPeers
        .map((p) => ({
          id: normalizePeerId(p.id),
          status: 'offline',
          lastSeenAt: Number(p.lastSeenAt || 0) || 0
        }))
        .filter((p) => isTrustedPeerId(p.id)));
    }
    if (!Array.isArray(savedPeers) || !savedPeers.length) {
      try {
        const idbPeers = await getAllPeers();
        if (Array.isArray(idbPeers) && idbPeers.length) {
          savedPeers = idbPeers
            .map((p) => ({
              id: normalizePeerId(p.id),
              lastSeenAt: Number(p.lastSeenAt || 0) || 0
            }))
            .filter((p) => isTrustedPeerId(p.id));
          setPeers(savedPeers.map((p) => ({ id: p.id, status: 'offline', lastSeenAt: p.lastSeenAt })));
          localStorage.setItem(STORAGE.knownPeers, JSON.stringify(savedPeers));
        }
      } catch (_) {}
    }
    return Array.isArray(savedPeers) ? savedPeers : [];
  }, []);

  const blockPeer = useCallback((remoteId, onBlocked) => {
    const normalized = normalizePeerId(remoteId);
    if (!normalized) return;
    setBlockedPeers((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized];
      try { localStorage.setItem(STORAGE.blockedPeers, JSON.stringify(next)); } catch (_) {}
      return next;
    });
    if (typeof onBlocked === 'function') onBlocked(normalized);
    upsertPeer(normalized, { status: 'offline', lastSeenAt: now() });
  }, [upsertPeer]);

  const unblockPeer = useCallback((remoteId) => {
    const normalized = normalizePeerId(remoteId);
    if (!normalized) return;
    setBlockedPeers((prev) => {
      const next = prev.filter((id) => id !== normalized);
      try { localStorage.setItem(STORAGE.blockedPeers, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const resetRegistry = useCallback(() => {
    setPeers([]);
  }, []);

  return {
    peers,
    setPeers,
    peersRef,
    profilesByPeer,
    setProfilesByPeer,
    blockedPeers,
    blockedPeersRef,
    upsertPeer,
    blockPeer,
    unblockPeer,
    hydrateFromStorage,
    resetRegistry
  };
}
