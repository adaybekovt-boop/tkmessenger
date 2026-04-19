// In-memory Key-Encryption-Key (KEK) derived from the user's password via
// scrypt. Held only in RAM for the duration of the unlocked session; never
// persisted. On logout / autolock / wipe the KEK is cleared.
//
// Consumers use wrapBytes / unwrapBytes to encrypt byte fields in IndexedDB
// (e.g. ratchet root key, chain keys, skipped message keys) so an attacker
// with raw IDB access cannot recover chat keys without the password.

let kekCryptoKey = null;

async function bytesToAesKey(rawBytes) {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.byteLength < 32) {
    throw new Error('KEK must be at least 32 bytes');
  }
  return crypto.subtle.importKey(
    'raw',
    rawBytes.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function setVaultKek(rawBytes) {
  kekCryptoKey = await bytesToAesKey(rawBytes);
}

export function clearVaultKek() {
  kekCryptoKey = null;
}

export function hasVaultKek() {
  return kekCryptoKey != null;
}

const WRAP_PREFIX = 'orb-wrap-v1:';

function isWrapped(value) {
  return typeof value === 'string' && value.startsWith(WRAP_PREFIX);
}

// Encode wrapped blob as a string so it survives IDB structured-clone
// round-trips unchanged: `orb-wrap-v1:<iv-b64>:<ct-b64>`.
function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function wrapBytes(plaintext) {
  if (!kekCryptoKey || !plaintext) return plaintext;
  const bytes = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kekCryptoKey, bytes);
  return `${WRAP_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

export async function unwrapBytes(value) {
  if (!isWrapped(value)) return value;
  if (!kekCryptoKey) {
    // No KEK yet — caller must treat this as "state is locked, cannot use".
    throw new Error('vault is locked');
  }
  const rest = value.slice(WRAP_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) throw new Error('malformed wrapped blob');
  const iv = fromBase64(rest.slice(0, sep));
  const ct = fromBase64(rest.slice(sep + 1));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kekCryptoKey, ct);
  return new Uint8Array(pt);
}

export { isWrapped };
