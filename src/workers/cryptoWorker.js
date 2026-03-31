/**
 * Web Worker: PBKDF2 + AES-GCM. Keeps CryptoKey in worker memory only.
 * Main thread sends { id, type, payload } — never raw keys cross threads.
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let vaultKey = null;

function toBase64(bytes) {
  if (typeof btoa !== 'function') {
    return Buffer.from(bytes).toString('base64'); // Fallback for Node/Electron environment
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64) {
  if (typeof atob !== 'function') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveVaultKey(password, nickname, customSalt) {
  const base = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const saltString = customSalt ? customSalt : `orbits:${nickname}`;
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(saltString),
      iterations: 120000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptForVault(obj) {
  if (!vaultKey) throw new Error('Vault key unavailable');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = textEncoder.encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, plain);
  return { iv: toBase64(iv), payload: toBase64(new Uint8Array(encrypted)) };
}

async function decryptFromVault(enc) {
  if (!enc) return null;
  if (!vaultKey) throw new Error('Vault is locked');
  const iv = fromBase64(enc.iv);
  const payload = fromBase64(enc.payload);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, payload);
  return JSON.parse(textDecoder.decode(plain));
}

async function sha256Hex(str) {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(str));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256HexBuffer(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    let result;
    switch (type) {
      case 'derive':
        vaultKey = await deriveVaultKey(payload.password, payload.nickname, payload.salt);
        result = { ok: true };
        break;
      case 'lock':
        vaultKey = null;
        result = { ok: true };
        break;
      case 'encrypt':
        result = await encryptForVault(payload.obj);
        break;
      case 'decrypt':
        result = await decryptFromVault(payload.enc);
        break;
      case 'decryptBatch':
        result = [];
        for (const enc of payload.encList) {
          try {
            if (enc) result.push(await decryptFromVault(enc));
            else result.push(null);
          } catch {
            result.push(null);
          }
        }
        break;
      case 'sha256Hex':
        result = await sha256Hex(payload.str);
        break;
      case 'sha256Buffer':
        result = await sha256HexBuffer(payload.buffer);
        break;
      default:
        throw new Error('unknown crypto op');
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
