let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orbits-db', 3);
    request.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains('messages')) {
        const store = _db.createObjectStore('messages', { keyPath: ['chatId', 'ts'] });
        store.createIndex('chatId', 'chatId');
        store.createIndex('ts', 'ts');
      }
      if (!_db.objectStoreNames.contains('pending_out')) {
        _db.createObjectStore('pending_out', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'init') {
      await initDB();
      self.postMessage({ id, result: true });
    } else if (type === 'add') {
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').put(payload);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      self.postMessage({ id, result: true });
    } else if (type === 'getPage') {
      const { chatId, limit, beforeTs } = payload;
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chatId');
      
      const results = [];
      const range = beforeTs ? IDBKeyRange.bound([chatId, 0], [chatId, beforeTs - 1]) : IDBKeyRange.bound([chatId, 0], [chatId, Infinity]);
      
      const request = store.openCursor(range, 'prev');
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          self.postMessage({ id, result: results });
        }
      };
      request.onerror = () => {
        self.postMessage({ id, error: request.error?.message });
      };
    } else if (type === 'getLast') {
      const { chatId } = payload;
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const range = IDBKeyRange.bound([chatId, 0], [chatId, Infinity]);
      const request = store.openCursor(range, 'prev');
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        self.postMessage({ id, result: cursor ? cursor.value : null });
      };
      request.onerror = () => self.postMessage({ id, error: request.error?.message });
    } else if (type === 'updateStatus') {
      const { chatId, ts, status } = payload;
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const req = store.get([chatId, ts]);
      req.onsuccess = () => {
        const data = req.result;
        if (data) {
          data.status = status;
          store.put(data);
        }
      };
      tx.oncomplete = () => self.postMessage({ id, result: true });
      tx.onerror = () => self.postMessage({ id, error: tx.error?.message });
    } else if (type === 'delete') {
      const { chatId, ts } = payload;
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').delete([chatId, ts]);
      tx.oncomplete = () => self.postMessage({ id, result: true });
      tx.onerror = () => self.postMessage({ id, error: tx.error?.message });
    } else if (type === 'clearAll') {
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').clear();
      tx.oncomplete = () => self.postMessage({ id, result: true });
      tx.onerror = () => self.postMessage({ id, error: tx.error?.message });
    } else if (type === 'getPendingOut') {
      const tx = db.transaction('pending_out', 'readonly');
      const req = tx.objectStore('pending_out').getAll();
      req.onsuccess = () => self.postMessage({ id, result: req.result });
      req.onerror = () => self.postMessage({ id, error: req.error?.message });
    } else if (type === 'setPendingOut') {
      const tx = db.transaction('pending_out', 'readwrite');
      const store = tx.objectStore('pending_out');
      store.clear();
      payload.forEach(item => store.put(item));
      tx.oncomplete = () => self.postMessage({ id, result: true });
      tx.onerror = () => self.postMessage({ id, error: tx.error?.message });
    } else {
      throw new Error('Unknown type');
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};