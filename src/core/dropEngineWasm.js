// dropEngineWasm.js — JS обёртка для Rust Drop engine (WASM).
//
// Предоставляет:
//   - SHA-256 хеширование файлов (streaming)
//   - Вычисление chunk metadata
//   - Hash + chunk combo
//
// Fallback на существующий drop.worker.js если WASM недоступен.

import { bytesToBase64, base64ToBytes } from './base64.js';
import { loadWasm } from './ratchetWasm.js';

let wasmMod = null;

async function getWasm() {
  if (wasmMod) return wasmMod;
  const ok = await loadWasm();
  if (!ok) return null;
  try {
    const mod = await import('../../pkg/orbits_crypto.js');
    wasmMod = mod;
    return mod;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// SHA-256 file hash
// ─────────────────────────────────────────────────────────────

/**
 * Хеширует File или ArrayBuffer через WASM (streaming для больших файлов).
 * @param {File|ArrayBuffer|Uint8Array} input
 * @returns {Promise<string>} hex hash
 */
export async function hashFile(input) {
  const w = await getWasm();

  if (w?.streamHasherNew && w?.streamHasherUpdate && w?.streamHasherFinalize) {
    // WASM streaming hash
    const CHUNK = 4 * 1024 * 1024; // 4MB
    const handle = w.streamHasherNew();

    if (input instanceof File) {
      let offset = 0;
      while (offset < input.size) {
        const slice = input.slice(offset, offset + CHUNK);
        const buf = await slice.arrayBuffer();
        w.streamHasherUpdate(handle, bytesToBase64(new Uint8Array(buf)));
        offset += CHUNK;
      }
    } else {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        w.streamHasherUpdate(handle, bytesToBase64(chunk));
      }
    }

    return w.streamHasherFinalize(handle);
  }

  // JS fallback — use SubtleCrypto
  let buffer;
  if (input instanceof File) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer;
  } else {
    buffer = input;
  }
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────
// Chunk metadata
// ─────────────────────────────────────────────────────────────

/**
 * Вычисляет метаданные чанков для файла.
 * @param {number} fileSize — размер файла в байтах
 * @param {number} chunkSize — размер чанка (по умолч. 65536)
 * @returns {Promise<Array<{seq: number, offset: number, size: number}>>}
 */
export async function computeChunks(fileSize, chunkSize = 65536) {
  const w = await getWasm();
  if (w?.dropComputeChunks) {
    return JSON.parse(w.dropComputeChunks(fileSize, chunkSize));
  }
  // JS fallback
  const chunks = [];
  let offset = 0;
  let seq = 0;
  while (offset < fileSize) {
    const size = Math.min(chunkSize, fileSize - offset);
    chunks.push({ seq, offset, size });
    offset += size;
    seq++;
  }
  return chunks;
}

/**
 * Нарезает данные на чанк.
 * @param {ArrayBuffer|Uint8Array} data
 * @param {number} offset
 * @param {number} size
 * @returns {ArrayBuffer}
 */
export function sliceChunk(data, offset, size) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes.slice(offset, offset + size).buffer;
}

/**
 * Хеширует данные и вычисляет чанки в одном вызове.
 * @param {ArrayBuffer|Uint8Array} data
 * @param {number} chunkSize
 * @returns {Promise<{hash: string, chunks: Array}>}
 */
export async function hashAndChunk(data, chunkSize = 65536) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const w = await getWasm();
  if (w?.dropHashAndChunk) {
    const b64 = bytesToBase64(bytes);
    return JSON.parse(w.dropHashAndChunk(b64, chunkSize));
  }
  // JS fallback
  const hash = await hashFile(bytes);
  const chunks = await computeChunks(bytes.length, chunkSize);
  return { hash, chunks };
}
