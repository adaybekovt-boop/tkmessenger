// Non-exportable AES-256-GCM key — extractable: false всегда
let aesKey = null;

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256buffer(buffer) {
  const buf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Bytes(password, saltBytes, iterations, lengthBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'derive') {
      const { password, nickname, salt, saltB64, iterations, version } = payload;
      const enc = new TextEncoder();
      const kdfVersion = Number(version || 1);
      // v3 default = 600k iterations (OWASP 2026 PBKDF2-SHA256 guidance).
      // Callers must persist `iterations` alongside the record so existing
      // vaults decrypt with their original count.
      const defaultIters = kdfVersion >= 3 ? 600000 : kdfVersion >= 2 ? 310000 : 100000;
      const iters = Number(iterations || defaultIters);
      const saltBytes = saltB64 ? base64ToBytes(saltB64) : enc.encode(String(salt || ''));

      const baseMaterial = kdfVersion >= 2 ? String(password) : String(password) + String(nickname || '');
      const baseKey = await crypto.subtle.importKey('raw', enc.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']);
      aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      self.postMessage({ id, result: true });
    } else if (type === 'lock') {
      aesKey = null;
      self.postMessage({ id, result: true });
    } else if (type === 'encrypt') {
      if (!aesKey) throw new Error('No key');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const data = enc.encode(JSON.stringify(payload));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
      
      const ivBase64 = bytesToBase64(iv);
      const dataBase64 = bytesToBase64(new Uint8Array(encrypted));
      self.postMessage({ id, result: `${ivBase64}:${dataBase64}` });
    } else if (type === 'decrypt') {
      if (!aesKey) throw new Error('No key');
      const [ivBase64, dataBase64] = payload.split(':');
      const iv = base64ToBytes(ivBase64);
      const data = base64ToBytes(dataBase64);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
      const dec = new TextDecoder();
      self.postMessage({ id, result: JSON.parse(dec.decode(decrypted)) });
    } else if (type === 'decryptBatch') {
      if (!aesKey) throw new Error('No key');
      const results = await Promise.all(payload.map(async (str) => {
        if (!str) return null;
        try {
          const [ivBase64, dataBase64] = str.split(':');
          const iv = base64ToBytes(ivBase64);
          const data = base64ToBytes(dataBase64);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
          const dec = new TextDecoder();
          return JSON.parse(dec.decode(decrypted));
        } catch (err) {
          return null;
        }
      }));
      self.postMessage({ id, result: results });
    } else if (type === 'pbkdf2') {
      const { password, saltB64, iterations, lengthBytes } = payload;
      const saltBytes = base64ToBytes(String(saltB64 || ''));
      const iters = Number(iterations);
      const len = Number(lengthBytes || 32);
      const out = await pbkdf2Bytes(String(password), saltBytes, iters, len);
      self.postMessage({ id, result: bytesToBase64(out) });
    } else if (type === 'sha256hex') {
      const result = await sha256hex(payload);
      self.postMessage({ id, result });
    } else if (type === 'sha256buffer') {
      const result = await sha256buffer(payload);
      self.postMessage({ id, result });
    } else {
      throw new Error('Unknown type');
    }
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
