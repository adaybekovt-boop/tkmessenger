const worker = new Worker(new URL('../workers/db.worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let nextId = 1;

worker.onmessage = (e) => {
  const { id, result, error } = e.data;
  if (pending.has(id)) {
    const { resolve, reject } = pending.get(id);
    pending.delete(id);
    if (error) reject(new Error(error));
    else resolve(result);
  }
};

function callWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export async function dbInit() {
  return callWorker('init');
}

export async function dbAdd(row) {
  return callWorker('add', row);
}

export async function dbGetPage(chatId, limit, beforeTs) {
  return callWorker('getPage', { chatId, limit, beforeTs });
}

export async function dbGetLast(chatId) {
  return callWorker('getLast', { chatId });
}

export async function dbUpdateStatus(chatId, ts, status) {
  return callWorker('updateStatus', { chatId, ts, status });
}

export async function dbDelete(chatId, ts) {
  return callWorker('delete', { chatId, ts });
}

export async function dbClearAll() {
  return callWorker('clearAll');
}

export async function dbGetPendingOut() {
  return callWorker('getPendingOut');
}

export async function dbSetPendingOut(arr) {
  return callWorker('setPendingOut', arr);
}