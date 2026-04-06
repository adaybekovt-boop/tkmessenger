const DB_NAME = 'orbits_idb_v1';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB error'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IDB tx error'));
    tx.onabort = () => reject(tx.error || new Error('IDB tx aborted'));
  });
}

export async function idbGet(key) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readonly');
  const store = tx.objectStore('kv');
  const req = store.get(key);
  const res = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB get error'));
  });
  await txDone(tx);
  db.close();
  return res;
}

export async function idbSet(key, value) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  const store = tx.objectStore('kv');
  store.put(value, key);
  await txDone(tx);
  db.close();
  return true;
}

export async function idbDel(key) {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  const store = tx.objectStore('kv');
  store.delete(key);
  await txDone(tx);
  db.close();
  return true;
}

