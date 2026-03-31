/**
 * Web Worker: SHA-256 for file chunks off the main thread (Web Crypto in worker).
 * Main sends ArrayBuffer; buffer is transferred back empty after hashing.
 */
async function sha256HexBuffer(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'sha256') {
      const buf = payload.buffer;
      const hex = await sha256HexBuffer(buf);
      self.postMessage({ id, ok: true, result: hex }, [buf]);
      return;
    }
    throw new Error('unknown file op');
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
