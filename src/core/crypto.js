import { base64ToBytes, bytesToBase64 } from './base64.js';

let worker = null;
try {
  worker = new Worker(new URL('../workers/crypto.worker.js', import.meta.url), { type: 'module' });
} catch (_) {
  worker = null;
}

let fallbackAesKey = null;
const pending = new Map();
let nextId = 1;
const WORKER_TIMEOUT_MS = 20000;

if (worker) {
  const rejectAllPending = (err) => {
    for (const { reject } of pending.values()) {
      try {
        reject(err);
      } catch (_) { /* ignore */ }
    }
    pending.clear();
  };

  worker.onmessage = (e) => {
    const { id, result, error } = e.data;
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (error) reject(new Error(error));
      else resolve(result);
    }
  };

  worker.onerror = () => {
    rejectAllPending(new Error('Crypto worker error'));
    worker = null;
  };

  worker.onmessageerror = () => {
    rejectAllPending(new Error('Crypto worker message error'));
    worker = null;
  };
}

async function sha256HexLocal(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256HexBufferLocal(buffer) {
  const buf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2BytesLocal(password, saltBytes, iterations, lengthBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, baseKey, lengthBytes * 8);
  return new Uint8Array(bits);
}

async function deriveLocalKey({ password, nickname, salt, saltB64, iterations, version }) {
  const enc = new TextEncoder();
  const kdfVersion = Number(version || 1);
  const iters = Number(iterations || (kdfVersion >= 2 ? 310000 : 100000));
  const saltBytes = saltB64 ? base64ToBytes(saltB64) : enc.encode(String(salt || ''));
  const baseMaterial = kdfVersion >= 2 ? String(password) : String(password) + String(nickname || '');
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']);
  fallbackAesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return true;
}

async function encryptLocal(obj) {
  if (!fallbackAesKey) throw new Error('No key');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fallbackAesKey, data);
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptLocal(encStr) {
  if (!fallbackAesKey) throw new Error('No key');
  const [ivB64, dataB64] = String(encStr || '').split(':');
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(dataB64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fallbackAesKey, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function decryptBatchLocal(arr) {
  const out = [];
  for (const s of arr) {
    if (!s) {
      out.push(null);
      continue;
    }
    try {
      out.push(await decryptLocal(s));
    } catch (_) {
      out.push(null);
    }
  }
  return out;
}

function callWorker(type, payload) {
  if (!worker) {
    return (async () => {
      if (type === 'derive') return deriveLocalKey(payload);
      if (type === 'lock') {
        fallbackAesKey = null;
        return true;
      }
      if (type === 'encrypt') return encryptLocal(payload);
      if (type === 'decrypt') return decryptLocal(payload);
      if (type === 'decryptBatch') return decryptBatchLocal(payload);
      if (type === 'sha256hex') return sha256HexLocal(payload);
      if (type === 'sha256buffer') return sha256HexBufferLocal(payload);
      if (type === 'pbkdf2') {
        const saltBytes = base64ToBytes(String(payload.saltB64 || ''));
        const iters = Number(payload.iterations);
        const len = Number(payload.lengthBytes || 32);
        const bytes = await pbkdf2BytesLocal(String(payload.password), saltBytes, iters, len);
        return bytesToBase64(bytes);
      }
      throw new Error('Unknown type');
    })();
  }

  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timeoutId = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error('Crypto worker timeout'));
    }, WORKER_TIMEOUT_MS);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timeoutId);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
    worker.postMessage({ id, type, payload });
  });
}

export async function cryptoDerive(password, nickname, salt) {
  if (salt && typeof salt === 'object') {
    const { saltB64, iterations, version } = salt;
    return callWorker('derive', { password, nickname, saltB64, iterations, version });
  }
  return callWorker('derive', { password, nickname, salt });
}

export async function cryptoLock() {
  return callWorker('lock');
}

export async function cryptoEncrypt(obj) {
  return callWorker('encrypt', obj);
}

export async function cryptoDecrypt(encStr) {
  return callWorker('decrypt', encStr);
}

export async function cryptoDecryptBatch(encStrArray) {
  return callWorker('decryptBatch', encStrArray);
}

export async function cryptoSha256Hex(str) {
  return callWorker('sha256hex', str);
}

export async function cryptoSha256Buffer(arrayBuffer) {
  return callWorker('sha256buffer', arrayBuffer);
}

export async function cryptoPbkdf2Bytes(password, saltB64, iterations, lengthBytes = 32) {
  return callWorker('pbkdf2', { password, saltB64, iterations, lengthBytes });
}
