let worker = null;
let nextId = 1;
const pending = new Map();
const TIMEOUT_MS = 10000;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/auth.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e?.data;
    const id = msg?.id;
    if (!id || !pending.has(id)) return;
    const { resolve, reject, timeoutId } = pending.get(id);
    clearTimeout(timeoutId);
    pending.delete(id);
    if (msg.ok) resolve(msg);
    else reject(msg.error || { code: 'internal', message: 'Ошибка' });
  };
  worker.onerror = () => {
    for (const { reject, timeoutId } of pending.values()) {
      clearTimeout(timeoutId);
      reject({ code: 'internal', message: 'Ошибка воркера' });
    }
    pending.clear();
    worker = null;
  };
  return worker;
}

function call(type, payload) {
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    const id = String(nextId++);
    const timeoutId = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject({ code: 'timeout', message: 'Таймаут операции' });
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeoutId });
    w.postMessage({ id, type, ...payload });
  });
}

export async function apiCheckUsername(username) {
  const res = await call('checkUsername', { username });
  return { available: !!res.available, normalized: res.normalized };
}

export async function apiRegisterCommit(payload) {
  const res = await call('registerCommit', { payload });
  return res.user;
}

export async function apiLogin(payload) {
  const res = await call('login', { payload });
  return res.user;
}

export async function apiGetUser(username) {
  const res = await call('getUser', { payload: { username } });
  return res.user;
}

export async function apiUpdateProfile(payload) {
  const res = await call('updateProfile', { payload });
  return res.user;
}
