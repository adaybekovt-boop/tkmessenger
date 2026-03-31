/**
 * Promise RPC bridges to worker-db.js and worker-crypto.js (no crypto on main thread).
 */
let _seq = 1;
const _pending = new Map();

function wire(worker) {
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const p = _pending.get(id);
    if (!p) return;
    _pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error || 'worker error'));
  };
  worker.onerror = (err) => {
    for (const [, p] of _pending) p.reject(err);
    _pending.clear();
  };
}

function rpc(worker, type, payload = {}, transfer) {
  const id = _seq++;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload }, transfer || []);
  });
}

const dbWorker = new Worker(new URL('./worker-db.js', import.meta.url), { type: 'classic' });
const cryptoWorker = new Worker(new URL('./worker-crypto.js', import.meta.url), { type: 'classic' });
const fileWorker = new Worker(new URL('./worker-file.js', import.meta.url), { type: 'classic' });

wire(dbWorker);
wire(cryptoWorker);
wire(fileWorker);

export async function dbInit() {
  return rpc(dbWorker, 'init');
}

export function dbGetPage(chatId, limit, beforeTs) {
  return rpc(dbWorker, 'getPage', { chatId, limit, beforeTs });
}

export function dbGetLast(chatId) {
  return rpc(dbWorker, 'getLast', { chatId });
}

export function dbAdd(row) {
  return rpc(dbWorker, 'add', { row });
}

export function dbAddBatch(rows) {
  return rpc(dbWorker, 'addBatch', { rows });
}

export function dbUpdateStatus(chatId, ts, status) {
  return rpc(dbWorker, 'updateStatus', { chatId, ts, status });
}

export function dbDelete(chatId, ts) {
  return rpc(dbWorker, 'delete', { chatId, ts });
}

export function dbClearAll() {
  return rpc(dbWorker, 'clearAll');
}

export function cryptoDerive(password, nickname) {
  return rpc(cryptoWorker, 'derive', { password, nickname });
}

export function cryptoLock() {
  return rpc(cryptoWorker, 'lock');
}

export function cryptoEncrypt(obj) {
  return rpc(cryptoWorker, 'encrypt', { obj });
}

export function cryptoDecrypt(enc) {
  return rpc(cryptoWorker, 'decrypt', { enc });
}

export function cryptoDecryptBatch(encList) {
  return rpc(cryptoWorker, 'decryptBatch', { encList });
}

export function cryptoSha256Hex(str) {
  return rpc(cryptoWorker, 'sha256Hex', { str });
}

export function cryptoSha256Buffer(buffer) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  return rpc(cryptoWorker, 'sha256Buffer', { buffer: ab }, [ab]);
}

/** File chunk hashing on dedicated worker (does not compete with crypto vault queue). */
export function fileSha256Buffer(buffer) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return rpc(fileWorker, 'sha256', { buffer: ab }, [ab]);
}

export function dbGetPendingOut() {
  return rpc(dbWorker, 'getPendingOut');
}

export function dbSetPendingOut(items) {
  return rpc(dbWorker, 'setPendingOut', { items });
}
