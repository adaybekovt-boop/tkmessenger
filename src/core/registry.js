const STORAGE_KEY = 'orbits_registry_v1';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function loadRegistry() {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const parsed = safeJsonParse(raw, null);
  const usedPeerIds = Array.isArray(parsed?.usedPeerIds) ? parsed.usedPeerIds.filter(Boolean) : [];
  const usedNames = Array.isArray(parsed?.usedNames) ? parsed.usedNames.filter(Boolean) : [];
  return {
    usedPeerIds: new Set(usedPeerIds.map(String)),
    usedNames: new Set(usedNames.map((s) => String(s).toLowerCase()))
  };
}

function saveRegistry(reg) {
  const out = {
    usedPeerIds: Array.from(reg.usedPeerIds).slice(-5000),
    usedNames: Array.from(reg.usedNames).slice(-5000)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
}

export function isPeerIdUsed(peerId) {
  const reg = loadRegistry();
  return reg.usedPeerIds.has(String(peerId || ''));
}

export function reservePeerId(peerId) {
  const id = String(peerId || '');
  if (!id) return false;
  const reg = loadRegistry();
  if (reg.usedPeerIds.has(id)) return false;
  reg.usedPeerIds.add(id);
  saveRegistry(reg);
  return true;
}

export function isNameUsed(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const reg = loadRegistry();
  return reg.usedNames.has(n);
}

export function reserveName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const reg = loadRegistry();
  if (reg.usedNames.has(n)) return false;
  reg.usedNames.add(n);
  saveRegistry(reg);
  return true;
}
