/**
 * RPC bridge for Web Workers.
 * Ensures UI stays responsive by offloading heavy ops.
 * Optimization: Added 30s timeout safety net to prevent hanging promises.
 */
class WorkerRPC {
  constructor(workerPath) {
    this.worker = new Worker(workerPath, { type: 'module' });
    this._pending = new Map();
    this._nextId = 0;
    this._timeoutMs = 30000;

    this.worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = this._pending.get(id);
      if (p) {
        clearTimeout(p.timeout);
        if (ok) p.resolve(result);
        else p.reject(new Error(error));
        this._pending.delete(id);
      }
    };

    this.worker.onerror = (err) => {
      console.error(`Worker error [${workerPath}]:`, err);
    };
  }

  call(type, payload = {}) {
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`RPC Timeout: ${type} failed to respond within ${this._timeoutMs}ms`));
        }
      }, this._timeoutMs);

      this._pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, type, payload });
    });
  }

  terminate() {
    this.worker.terminate();
    this._pending.forEach((p) => {
      clearTimeout(p.timeout);
      p.reject(new Error('Worker terminated'));
    });
    this._pending.clear();
  }
}

// Global instances for the app
export const dbWorker = new WorkerRPC(new URL('./worker-db.js', import.meta.url));
export const cryptoWorker = new WorkerRPC(new URL('./worker-crypto.js', import.meta.url));
export const fileWorker = new WorkerRPC(new URL('./worker-file.js', import.meta.url));

/** Initialize all workers */
export async function initWorkers() {
  await dbWorker.call('init');
  return true;
}
