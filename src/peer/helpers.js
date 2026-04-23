// Pure helpers extracted from usePeer.js — no React, no side-effects, safe to unit-test.

export { safeJsonParse } from '../utils/common.js';

export const STORAGE = {
  peerId: 'orbits_peer_id',
  knownPeers: 'orbits_known_peers',
  messages: 'orbits_messages_v1',
  blockedPeers: 'orbits_blocked_peers',
  profiles: 'orbits_profiles_v1',
  micSettings: 'orbits_mic_settings_v1',
  powerSaver: 'orbits_power_saver',
  peerLockPrefix: 'orbits_peer_lock:',
  relayOnly: 'orbits_relay_only'
};

/**
 * Returns true when the user has opted into TURN-only mode. In this mode we
 * refuse host/srflx ICE candidates and only exchange `relay` candidates — the
 * remote peer never learns our public IP. Requires a configured TURN server
 * (VITE_TURN_URL/USERNAME/CREDENTIAL), otherwise ICE will fail.
 */
export function isRelayOnlyEnabled() {
  try { return localStorage.getItem(STORAGE.relayOnly) === '1'; }
  catch (_) { return false; }
}

export function normalizePeerId(input) {
  return String(input || '').trim().toUpperCase();
}

export function isValidPeerId(input) {
  const s = normalizePeerId(input);
  return /^[A-Z0-9_-]{3,64}$/.test(s);
}

export function now() {
  return Date.now();
}

export function connKey(remoteId, channel) {
  return `${normalizePeerId(remoteId)}|${channel}`;
}

export function pickPersistedPeerId(desiredPeerId) {
  const desired = normalizePeerId(desiredPeerId);
  if (desired) return desired;
  try {
    const stored = normalizePeerId(localStorage.getItem(STORAGE.peerId) || '');
    return stored;
  } catch (_) {
    return '';
  }
}

const PEER_ERROR_MAP = {
  'browser-incompatible': 'Браузер не поддерживает WebRTC/P2P',
  disconnected: 'Соединение потеряно',
  network: 'Проблемы с сетью — проверь интернет',
  'peer-unavailable': 'Пир недоступен (оффлайн или неверный ID)',
  'server-error': 'Ошибка сигнального сервера',
  'socket-error': 'Ошибка соединения с сервером сигналинга',
  'unavailable-id': 'Peer ID уже занят — нужен новый'
};

export function mapPeerError(err) {
  const type = String(err?.type || err || '').trim();
  if (!type) return 'Неизвестная ошибка';
  return PEER_ERROR_MAP[type] || type;
}
