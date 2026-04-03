let aesKey = null;

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256buffer(buffer) {
  const buf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'derive') {
      const { password, nickname, salt } = payload;
      const enc = new TextEncoder();
      const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(password + nickname), { name: 'PBKDF2' }, false, ['deriveKey']
      );
      aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
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
      
      const ivBase64 = btoa(String.fromCharCode(...iv));
      const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      self.postMessage({ id, result: `${ivBase64}:${dataBase64}` });
    } else if (type === 'decrypt') {
      if (!aesKey) throw new Error('No key');
      const [ivBase64, dataBase64] = payload.split(':');
      const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
      const data = new Uint8Array(atob(dataBase64).split('').map(c => c.charCodeAt(0)));
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
      const dec = new TextDecoder();
      self.postMessage({ id, result: JSON.parse(dec.decode(decrypted)) });
    } else if (type === 'decryptBatch') {
      if (!aesKey) throw new Error('No key');
      const results = await Promise.all(payload.map(async (str) => {
        if (!str) return null;
        try {
          const [ivBase64, dataBase64] = str.split(':');
          const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
          const data = new Uint8Array(atob(dataBase64).split('').map(c => c.charCodeAt(0)));
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
          const dec = new TextDecoder();
          return JSON.parse(dec.decode(decrypted));
        } catch (err) {
          return null;
        }
      }));
      self.postMessage({ id, result: results });
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