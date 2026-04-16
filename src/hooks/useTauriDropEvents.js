// React hook that subscribes to Tauri file-transfer events.
//
// On Web/Capacitor this is a no-op (early return).
// On Tauri it listens to:
//   orbits://file-progress  → onProgress(transferId, percent)
//   orbits://file-complete  → onComplete(transferId, path, fileName)
//   orbits://file-error     → onError(transferId, error)

import { useEffect } from 'react';
import { isTauri } from '../core/platform.js';

export function useTauriDropEvents({ onProgress, onComplete, onError } = {}) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten = [];

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const u1 = await listen('orbits://file-progress', (event) => {
        const { transfer_id, chunks_done, total_chunks } = event.payload;
        const percent = total_chunks > 0
          ? Math.round((chunks_done / total_chunks) * 100)
          : 0;
        onProgress?.(transfer_id, percent);
      });

      const u2 = await listen('orbits://file-complete', (event) => {
        const { transfer_id, path } = event.payload;
        const fileName = path ? path.split(/[\\/]/).pop() : null;
        onComplete?.(transfer_id, path, fileName);
      });

      const u3 = await listen('orbits://file-error', (event) => {
        const { transfer_id, error } = event.payload;
        onError?.(transfer_id, error);
      });

      unlisten = [u1, u2, u3];
    })();

    return () => {
      for (const fn of unlisten) fn();
    };
  }, [onProgress, onComplete, onError]);
}
