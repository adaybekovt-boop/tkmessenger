const worker = new Worker(new URL('../workers/crypto.worker.js', import.meta.url), { type: 'module' });
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

export async function cryptoDerive(password, nickname, salt) {
  return callWorker('derive', { password, nickname, salt });
}

export async function cryptoLock() {
  return callWorker('lock');
}

export async function cryptoEncrypt(obj) {
  return callWorker('encrypt', obj);
}

export async function cryptoDecrypt(encStr) {
  return callWorker('decrypt', encStr);
}

export async function cryptoDecryptBatch(encStrArray) {
  return callWorker('decryptBatch', encStrArray);
}

export async function cryptoSha256Hex(str) {
  return callWorker('sha256hex', str);
}

export async function cryptoSha256Buffer(arrayBuffer) {
  return callWorker('sha256buffer', arrayBuffer);
}