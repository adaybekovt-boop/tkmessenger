import { wire, rpc } from '../utils/rpc.js';

const dbWorker = new Worker(new URL('../workers/dbWorker.js', import.meta.url), { type: 'classic' });
wire(dbWorker);

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

export function dbGetPendingOut() {
  return rpc(dbWorker, 'getPendingOut');
}

export function dbSetPendingOut(items) {
  return rpc(dbWorker, 'setPendingOut', { items });
}
