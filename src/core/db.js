// OrbitsDatabase — локальное хранилище на IndexedDB
// Object Stores: peers, messages, keys
// Вся работа с БД изолирована в Web Worker через db.worker.js

const DB_NAME = 'orbits-titan-db';
const DB_VERSION = 1;

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

      // Хранилище пиров: id, pubKey, trustLevel
      if (!_db.objectStoreNames.contains('peers')) {
        const peersStore = _db.createObjectStore('peers', { keyPath: 'id' });
        peersStore.createIndex('trustLevel', 'trustLevel', { unique: false });
      }

      // Хранилище сообщений: id, peerId, timestamp, encryptedPayload, direction
      if (!_db.objectStoreNames.contains('messages')) {
        const messagesStore = _db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('peerId', 'peerId', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        messagesStore.createIndex('peerId_timestamp', ['peerId', 'timestamp'], { unique: false });
      }

      // Хранилище ключей: локальные приватные ключи (НЕ экспортировать за пределы воркера!)
      if (!_db.objectStoreNames.contains('keys')) {
        _db.createObjectStore('keys', { keyPath: 'id' });
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
    const tx = _db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put({
      id: `session-${peerId}`,
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
    const tx = _db.transaction('keys', 'readonly');
    const req = tx.objectStore('keys').get(`session-${peerId}`);
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
    tx.objectStore('peers').put({
      id: peer.id,
      pubKey: peer.pubKey,
      trustLevel: peer.trustLevel || 0,
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
      encryptedPayload: message.encryptedPayload,
      direction: message.direction // 'in' или 'out'
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('Ошибка сохранения сообщения'));
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
    const request = store.openCursor(range, 'prev');

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
