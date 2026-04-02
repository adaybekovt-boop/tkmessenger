const PEPPER = 'orbits-p2p-wire-v1';
const PBKDF_SALT = new TextEncoder().encode('orbit-wire-salt-fixed');

async function deriveWireKey(chatId) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${chatId}|${PEPPER}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: PBKDF_SALT, iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWirePayload(chatId, obj) {
  const key = await deriveWireKey(chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `${ivB64}:${ctB64}`;
}

export async function decryptWirePayload(chatId, encStr) {
  const key = await deriveWireKey(chatId);
  const [ivB64, ctB64] = encStr.split(':');
  const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(atob(ctB64).split('').map(c => c.charCodeAt(0)));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
