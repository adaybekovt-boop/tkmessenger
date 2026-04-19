// Drop utilities — platform-adaptive file picker + chunked reader.

import { isTauri, isCapacitor } from '../core/platform.js';

const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16 KB

/**
 * Open a native file picker appropriate for the current platform.
 *
 * - Tauri:     native dialog via @tauri-apps/plugin-dialog, returns { path: string }
 * - Capacitor: native picker via @capawesome/capacitor-file-picker, returns { path, name, size, mimeType }
 * - Web:       standard <input type="file">, returns File object
 *
 * Returns `null` if the user cancels.
 */
export async function pickFileForDrop() {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
    });
    if (!selected) return null;
    // Tauri v2 open() returns a string path (single file)
    return { path: typeof selected === 'string' ? selected : selected.path };
  }

  if (isCapacitor()) {
    const { FilePicker } = await import('@capawesome/capacitor-file-picker');
    const result = await FilePicker.pickFiles({ limit: 1 });
    if (!result.files || result.files.length === 0) return null;
    const f = result.files[0];
    return {
      path: f.path,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
    };
  }

  // Web fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };
    // Handle cancel — no reliable cross-browser event, but focus return works
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) resolve(null);
        window.removeEventListener('focus', onFocus);
      }, 300);
    };
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

/**
 * Generator that reads a File/Blob in chunks for WebRTC streaming.
 * Used by Web and Capacitor branches (Tauri streams from Rust).
 *
 * @param {File|Blob} file
 * @param {number} [chunkSize=16384]
 * @yields {ArrayBuffer}
 */
export async function* readFileInChunks(file, chunkSize = DEFAULT_CHUNK_SIZE) {
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    yield buffer;
    offset += buffer.byteLength;
  }
}
