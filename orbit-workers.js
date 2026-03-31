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

// ========== ДОБАВЛЕННЫЕ ЭКСПОРТЫ ДЛЯ main.js ==========
/** Database operations with RPC */
export async function dbInit() {
  return dbWorker.call('init');
}

export async function dbGetPage(chatId, limit, beforeTs) {
  return dbWorker.call('getPage', { chatId, limit, beforeTs });
}

export async function dbGetLast(chatId) {
  return dbWorker.call('getLast', { chatId });
}

export async function dbAdd(row) {
  return dbWorker.call('add', { row });
}

export async function dbUpdateStatus(chatId, ts, status) {
  return dbWorker.call('updateStatus', { chatId, ts, status });
}

export async function dbDelete(chatId, ts) {
  return dbWorker.call('delete', { chatId, ts });
}

export async function dbClearAll() {
  return dbWorker.call('clearAll');
}

export async function dbGetPendingOut() {
  return dbWorker.call('getPendingOut');
}

export async function dbSetPendingOut(items) {
  return dbWorker.call('setPendingOut', { items });
}

// ========== CRYPTO EXPORTS ==========
export async function cryptoDerive(password, nickname) {
  return cryptoWorker.call('derive', { password, nickname });
}

export async function cryptoLock() {
  return cryptoWorker.call('lock');
}

export async function cryptoEncrypt(obj) {
  return cryptoWorker.call('encrypt', { obj });
}

export async function cryptoDecrypt(enc) {
  return cryptoWorker.call('decrypt', { enc });
}

export async function cryptoDecryptBatch(encList) {
  return cryptoWorker.call('decryptBatch', { encList });
}

export async function cryptoSha256Hex(str) {
  return cryptoWorker.call('sha256Hex', { str });
}

export async function cryptoSha256Buffer(buffer) {
  return cryptoWorker.call('sha256Buffer', { buffer });
}

// ========== FILE EXPORTS ==========
export async function fileSha256Buffer(buffer) {
  return fileWorker.call('sha256', { buffer });
}
