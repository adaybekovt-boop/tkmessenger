/**
 * Web Worker: all IndexedDB access off the UI thread.
 * Schema v2: compound index byChatTime [chatId, ts] for cursor pagination.
 */
const DB_NAME = 'OrbitsDB';
const DB_VERSION = 3;

let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const database = ev.target.result;
      let store;
      if (!database.objectStoreNames.contains('messages')) {
        store = database.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        store.createIndex('chatId', 'chatId', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      } else {
        store = ev.target.transaction.objectStore('messages');
      }
      if (store && !store.indexNames.contains('byChatTime')) {
        try {
          store.createIndex('byChatTime', ['chatId', 'ts'], { unique: false });
        } catch (_) {
          /* older IDB */
        }
      }
      if (!database.objectStoreNames.contains('outbox')) {
        database.createObjectStore('outbox', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Last N messages for chat (newest last), sorted by ts ascending */
function getMessagesPage(chatId, limit, beforeTs) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const out = [];
    const cap = Math.min(Math.max(1, limit | 0), 500);

    if (!store.indexNames.contains('byChatTime')) {
      const idx = store.index('chatId');
      const r = idx.getAll(chatId);
      r.onsuccess = () => {
        let rows = r.result.sort((a, b) => a.ts - b.ts);
        if (beforeTs != null && beforeTs !== undefined) {
          rows = rows.filter((m) => m.ts < beforeTs);
        }
        const slice = rows.slice(-cap);
        resolve(slice);
      };
      r.onerror = () => reject(r.error);
      return;
    }

    const idx = store.index('byChatTime');
    const range =
      beforeTs != null
        ? IDBKeyRange.upperBound([chatId, beforeTs - 1])
        : IDBKeyRange.bound([chatId, 0], [chatId, Number.MAX_SAFE_INTEGER]);
    const req = idx.openCursor(range, 'prev');
    req.onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (cursor && out.length < cap) {
        out.push(cursor.value);
        cursor.continue();
      } else {
        resolve(out.reverse());
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function getLastMessageForChat(chatId) {
  return new Promise((resolve, reject) => {
    getMessagesPage(chatId, 1, null).then((rows) => resolve(rows[0] || null)).catch(reject);
  });
}

function addMessage(row) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const r = store.add(row);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

function addMessagesBatch(rows) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    for (const row of rows) store.add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function updateStatusByChatTs(chatId, ts, status) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const idx = store.index('chatId');
    const r = idx.getAll(chatId);
    r.onsuccess = () => {
      const msg = r.result.find((m) => m.ts === ts);
      if (msg) {
        msg.status = status;
        store.put(msg);
      }
      resolve();
    };
    r.onerror = () => reject(r.error);
  });
}

function deleteByChatTs(chatId, ts) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const idx = store.index('chatId');
    const r = idx.getAll(chatId);
    r.onsuccess = () => {
      const msg = r.result.find((m) => m.ts === ts);
      if (!msg) return resolve();
      const del = store.delete(msg.id);
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error);
    };
    r.onerror = () => reject(r.error);
  });
}

function clearAll() {
  return new Promise((resolve, reject) => {
    const names = ['messages'];
    if (db.objectStoreNames.contains('outbox')) names.push('outbox');
    const tx = db.transaction(names, 'readwrite');
    tx.objectStore('messages').clear();
    if (db.objectStoreNames.contains('outbox')) tx.objectStore('outbox').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getPendingOut() {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('outbox')) {
      resolve([]);
      return;
    }
    const tx = db.transaction('outbox', 'readonly');
    const r = tx.objectStore('outbox').get('pending');
    r.onsuccess = () => {
      const row = r.result;
      if (!row || !row.json) {
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(row.json));
      } catch {
        resolve([]);
      }
    };
    r.onerror = () => reject(r.error);
  });
}

function setPendingOut(items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const r = store.put({ key: 'pending', json: JSON.stringify(items || []) });
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (!db && type !== 'init') await openDb();
    let result;
    switch (type) {
      case 'init':
        await openDb();
        result = { ok: true };
        break;
      case 'getPage':
        result = await getMessagesPage(payload.chatId, payload.limit, payload.beforeTs);
        break;
      case 'getLast':
        result = await getLastMessageForChat(payload.chatId);
        break;
      case 'add':
        await addMessage(payload.row);
        result = true;
        break;
      case 'addBatch':
        await addMessagesBatch(payload.rows);
        result = true;
        break;
      case 'updateStatus':
        await updateStatusByChatTs(payload.chatId, payload.ts, payload.status);
        result = true;
        break;
      case 'delete':
        await deleteByChatTs(payload.chatId, payload.ts);
        result = true;
        break;
      case 'clearAll':
        await clearAll();
        result = true;
        break;
      case 'getPendingOut':
        result = await getPendingOut();
        break;
      case 'setPendingOut':
        await setPendingOut(payload.items);
        result = true;
        break;
      default:
        throw new Error('unknown db op');
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
