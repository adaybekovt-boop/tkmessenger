// OrbitsDatabase — локальное хранилище на IndexedDB
// Object Stores: peers, messages, keys
// Вся работа с БД изолирована в Web Worker через db.worker.js

const DB_NAME = 'orbits-titan-db';
const DB_VERSION = 3;

let db = null;

/**
 * Инициализация базы данных с тремя хранилищами
 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const _db = event.target.result;
      const tx = event.target.transaction;

      // Хранилище пиров: id, pubKey, trustLevel
      if (!_db.objectStoreNames.contains('peers')) {
        const peersStore = _db.createObjectStore('peers', { keyPath: 'id' });
        peersStore.createIndex('trustLevel', 'trustLevel', { unique: false });
        peersStore.createIndex('trusted', 'trusted', { unique: false });
        peersStore.createIndex('lastSeenAt', 'lastSeenAt', { unique: false });
      }

      // Хранилище сообщений: id, peerId, timestamp, encryptedPayload, direction
      if (!_db.objectStoreNames.contains('messages')) {
        const messagesStore = _db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('peerId', 'peerId', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        messagesStore.createIndex('peerId_timestamp', ['peerId', 'timestamp'], { unique: false });
        messagesStore.createIndex('status', 'status', { unique: false });
        messagesStore.createIndex('peerId_status_timestamp', ['peerId', 'status', 'timestamp'], { unique: false });
        messagesStore.createIndex('status_timestamp', ['status', 'timestamp'], { unique: false });
      } else {
        const messagesStore = tx.objectStore('messages');
        if (!messagesStore.indexNames.contains('status')) {
          messagesStore.createIndex('status', 'status', { unique: false });
        }
        if (!messagesStore.indexNames.contains('peerId_status_timestamp')) {
          messagesStore.createIndex('peerId_status_timestamp', ['peerId', 'status', 'timestamp'], { unique: false });
        }
        if (!messagesStore.indexNames.contains('status_timestamp')) {
          messagesStore.createIndex('status_timestamp', ['status', 'timestamp'], { unique: false });
        }

        const cursorReq = messagesStore.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const v = cursor.value || {};
          if (!v.status) {
            const direction = v.direction;
            const nextStatus = direction === 'in' ? 'delivered' : direction === 'out' ? 'sent' : 'sent';
            cursor.update({
              ...v,
              status: nextStatus,
              timestamp: typeof v.timestamp === 'number' ? v.timestamp : Date.now(),
            });
          }
          cursor.continue();
        };
      }

      // Хранилище ключей: локальные приватные ключи (НЕ экспортировать за пределы воркера!)
      if (!_db.objectStoreNames.contains('keys')) {
        _db.createObjectStore('keys', { keyPath: 'id' });
      }

      if (!_db.objectStoreNames.contains('session_keys')) {
        _db.createObjectStore('session_keys', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = () => {
      reject(new Error('Ошибка открытия IndexedDB: ' + (request.error?.message || 'неизвестная ошибка')));
    };
  });
}

/**
 * Сохранение локальной пары ключей
 */
export async function saveKeyPair(keyPair) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put({
      id: 'local-identity',
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      createdAt: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка сохранения ключей'));
  });
}

/**
 * Получение локальной пары ключей
 */
export async function getKeyPair() {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('keys', 'readonly');
    const req = tx.objectStore('keys').get('local-identity');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Ошибка чтения ключей'));
  });
}

/**
 * Сохранение симметричного ключа сессии с пиром
 */
export async function saveSessionKey(peerId, symmetricKeyB64) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('session_keys', 'readwrite');
    tx.objectStore('session_keys').put({
      id: `session-${peerId}`,
      peerId,
      symmetricKey: symmetricKeyB64,
      updatedAt: Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка сохранения сессионного ключа'));
  });
}

/**
 * Получение симметричного ключа сессии с пиром
 */
export async function getSessionKey(peerId) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('session_keys', 'readonly');
    const req = tx.objectStore('session_keys').get(`session-${peerId}`);
    req.onsuccess = () => resolve(req.result?.symmetricKey || null);
    req.onerror = () => reject(new Error('Ошибка чтения сессионного ключа'));
  });
}

/**
 * Добавление/обновление пира
 */
export async function savePeer(peer) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('peers', 'readwrite');
    const trusted = typeof peer.trusted === 'boolean' ? peer.trusted : (peer.trustLevel || 0) > 0;
    tx.objectStore('peers').put({
      id: peer.id,
      displayName: String(peer.displayName || '').slice(0, 64),
      lastSeenAt: Number(peer.lastSeenAt || 0) || 0,
      trusted,
      pubKey: peer.pubKey || null,
      trustLevel: peer.trustLevel || (trusted ? 1 : 0),
      addedAt: peer.addedAt || Date.now()
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка сохранения пира'));
  });
}

/**
 * Получение пира по ID
 */
export async function getPeer(peerId) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('peers', 'readonly');
    const req = tx.objectStore('peers').get(peerId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Ошибка чтения пира'));
  });
}

/**
 * Получение всех пиров
 */
export async function getAllPeers() {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('peers', 'readonly');
    const req = tx.objectStore('peers').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(new Error('Ошибка чтения списка пиров'));
  });
}

export async function upsertSessionKey(peerId, symmetricKeyB64) {
  return saveSessionKey(peerId, symmetricKeyB64);
}

export async function getSessionKeyRecord(peerId) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('session_keys', 'readonly');
    const req = tx.objectStore('session_keys').get(`session-${peerId}`);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Ошибка чтения сессионного ключа'));
  });
}

/**
 * Удаление пира
 */
export async function deletePeer(peerId) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('peers', 'readwrite');
    tx.objectStore('peers').delete(peerId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка удаления пира'));
  });
}

/**
 * Сохранение зашифрованного сообщения
 */
export async function saveMessage(message) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put({
      id: message.id || `${message.peerId}-${message.timestamp}`,
      peerId: message.peerId,
      timestamp: message.timestamp || Date.now(),
      encryptedPayload: message.encryptedPayload || null,
      payload: message.payload || null,
      direction: message.direction,
      status: message.status || (message.direction === 'in' ? 'delivered' : 'sent')
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка сохранения сообщения'));
  });
}

export async function getMessageById(id) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readonly');
    const req = tx.objectStore('messages').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Ошибка чтения сообщения'));
  });
}

export async function updateMessage(id, patch) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const v = getReq.result;
      if (!v) return resolve(false);
      store.put({ ...v, ...patch });
    };
    getReq.onerror = () => reject(new Error('Ошибка чтения сообщения'));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка обновления сообщения'));
  });
}

export async function updateMessageStatus(id, status) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const v = getReq.result;
      if (!v) return resolve(false);
      store.put({ ...v, status });
    };
    getReq.onerror = () => reject(new Error('Ошибка чтения сообщения'));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка обновления статуса'));
  });
}

export async function getPendingMessages(peerId, limit = 200) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('peerId_status_timestamp');
    const pid = String(peerId || '');
    const range = IDBKeyRange.bound([pid, 'pending', 0], [pid, 'pending', Infinity]);
    const results = [];
    const req = index.openCursor(range, 'next');
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(new Error('Ошибка чтения очереди'));
  });
}

/**
 * Получение сообщений для пира (с пагинацией)
 */
export async function getMessages(peerId, limit = 50, beforeTimestamp = Infinity) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('peerId_timestamp');
    const range = IDBKeyRange.bound(
      [peerId, 0],
      [peerId, beforeTimestamp],
      false,
      true
    );
    const results = [];
    const request = index.openCursor(range, 'prev');

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(new Error('Ошибка чтения сообщений'));
  });
}

export async function clearAllMessages() {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readwrite');
    tx.objectStore('messages').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка очистки сообщений'));
  });
}

export async function clearPendingMessages(peerId = null) {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    let count = 0;
    const done = () => resolve(count);

    const deleteCursor = (cursor) => {
      try {
        cursor.delete();
        count++;
        cursor.continue();
      } catch (e) {
        reject(e);
      }
    };

    if (peerId) {
      const index = store.index('peerId_status_timestamp');
      const pid = String(peerId);
      const range = IDBKeyRange.bound([pid, 'pending', 0], [pid, 'pending', Infinity]);
      const req = index.openCursor(range, 'next');
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        deleteCursor(cursor);
      };
      req.onerror = () => reject(new Error('Ошибка очистки очереди'));
    } else {
      const index = store.index('status');
      const range = IDBKeyRange.only('pending');
      const req = index.openCursor(range, 'next');
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        deleteCursor(cursor);
      };
      req.onerror = () => reject(new Error('Ошибка очистки очереди'));
    }

    tx.oncomplete = done;
    tx.onerror = () => reject(new Error('Ошибка очистки очереди'));
  });
}

/**
 * Удаление всех данных (для отладки)
 */
export async function clearAllData() {
  const _db = await openDatabase();
  return new Promise((resolve, reject) => {
    const storeNames = ['peers', 'messages', 'keys'];
    const tx = _db.transaction(storeNames, 'readwrite');
    storeNames.forEach((name) => tx.objectStore(name).clear());
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка очистки БД'));
  });
}
