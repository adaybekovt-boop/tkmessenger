let _seq = 1;
const _pending = new Map();

export function wire(worker) {
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

export function rpc(worker, type, payload = {}, transfer) {
  const id = _seq++;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload }, transfer || []);
  });
}
