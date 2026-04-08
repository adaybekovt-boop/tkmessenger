import { isPeerIdUsed, reservePeerId } from './registry.js';

const STORAGE = {
  peerId: 'orbits_peer_id',
  identity: 'orbits_identity_v1'
};

function isValidPeerId(id) {
  return /^ORBIT-[0-9A-F]{6}$/.test(String(id || ''));
}

function randomHex6() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function generatePeerId() {
  for (let i = 0; i < 64; i++) {
    const id = `ORBIT-${randomHex6()}`;
    if (!isPeerIdUsed(id) && reservePeerId(id)) return id;
  }
  return `ORBIT-${randomHex6()}`;
}

export function getIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE.identity);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const peerId = String(parsed.peerId || '');
        const displayName = String(parsed.displayName || '').slice(0, 64);
        if (isValidPeerId(peerId)) return { peerId, displayName };
      }
    }
  } catch (_) {
  }

  const legacyPeerId = String(localStorage.getItem(STORAGE.peerId) || '');
  if (isValidPeerId(legacyPeerId)) return { peerId: legacyPeerId, displayName: '' };
  return null;
}

export function setIdentity(next) {
  const peerId = String(next?.peerId || '');
  if (!isValidPeerId(peerId)) throw new Error('Invalid peerId');
  reservePeerId(peerId);
  const identity = {
    peerId,
    displayName: String(next?.displayName || '').slice(0, 64)
  };
  localStorage.setItem(STORAGE.peerId, peerId);
  localStorage.setItem(STORAGE.identity, JSON.stringify(identity));
  return identity;
}

export function getOrCreateIdentity() {
  const existing = getIdentity();
  if (existing) return existing;
  const created = { peerId: generatePeerId(), displayName: '' };
  return setIdentity(created);
}

export function getOrCreatePeerId() {
  return getOrCreateIdentity().peerId;
}

export function resetIdentity() {
  try {
    localStorage.removeItem(STORAGE.peerId);
    localStorage.removeItem(STORAGE.identity);
  } catch (_) {
  }
  const next = { peerId: generatePeerId(), displayName: '' };
  return setIdentity(next);
}

export function exportIdentity() {
  const identity = getOrCreateIdentity();
  return {
    version: 1,
    peerId: identity.peerId,
    displayName: identity.displayName || '',
    exportedAt: Date.now()
  };
}

export function setDisplayName(displayName) {
  const current = getOrCreateIdentity();
  return setIdentity({ ...current, displayName: String(displayName || '').slice(0, 64) });
}
