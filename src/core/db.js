import { openDB } from 'idb';

const DB_NAME = 'orbits-titan-db';
const DB_VERSION = 6;

const MESSAGE_STATUSES = new Set(['pending', 'sent', 'delivered', 'read', 'failed']);

let dbPromise = null;

function normalizeMessageStatus(status, direction) {
  const s = String(status || '');
  if (MESSAGE_STATUSES.has(s)) return s;
  if (direction === 'in') return 'delivered';
  return 'sent';
}

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade: async (db, oldVersion, _newVersion, transaction) => {
      if (!db.objectStoreNames.contains('peers')) {
        const peersStore = db.createObjectStore('peers', { keyPath: 'id' });
        peersStore.createIndex('trusted', 'trusted', { unique: false });
        peersStore.createIndex('lastSeenAt', 'lastSeenAt', { unique: false });
      } else {
        const peersStore = transaction.objectStore('peers');
        if (!peersStore.indexNames.contains('trusted')) peersStore.createIndex('trusted', 'trusted', { unique: false });
        if (!peersStore.indexNames.contains('lastSeenAt')) peersStore.createIndex('lastSeenAt', 'lastSeenAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('messages')) {
        const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('peerId', 'peerId', { unique: false });
        messagesStore.createIndex('status', 'status', { unique: false });
        messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        messagesStore.createIndex('peerId_timestamp', ['peerId', 'timestamp'], { unique: false });
        messagesStore.createIndex('peerId_status_timestamp', ['peerId', 'status', 'timestamp'], { unique: false });
        messagesStore.createIndex('status_timestamp', ['status', 'timestamp'], { unique: false });
      } else {
        const messagesStore = transaction.objectStore('messages');
        if (!messagesStore.indexNames.contains('peerId')) messagesStore.createIndex('peerId', 'peerId', { unique: false });
        if (!messagesStore.indexNames.contains('status')) messagesStore.createIndex('status', 'status', { unique: false });
        if (!messagesStore.indexNames.contains('timestamp')) messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        if (!messagesStore.indexNames.contains('peerId_timestamp')) messagesStore.createIndex('peerId_timestamp', ['peerId', 'timestamp'], { unique: false });
        if (!messagesStore.indexNames.contains('peerId_status_timestamp')) messagesStore.createIndex('peerId_status_timestamp', ['peerId', 'status', 'timestamp'], { unique: false });
        if (!messagesStore.indexNames.contains('status_timestamp')) messagesStore.createIndex('status_timestamp', ['status', 'timestamp'], { unique: false });

        if (oldVersion < 4) {
          let cursor = await messagesStore.openCursor();
          while (cursor) {
            const v = cursor.value || {};
            const next = {
              ...v,
              timestamp: typeof v.timestamp === 'number' ? v.timestamp : Date.now(),
              status: normalizeMessageStatus(v.status, v.direction)
            };
            try {
              await cursor.update(next);
            } catch (_) {
            }
            cursor = await cursor.continue();
          }
        }
      }

      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('session_keys')) {
        db.createObjectStore('session_keys', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('avatars')) {
        db.createObjectStore('avatars', { keyPath: 'peerId' });
      }

      // v6 — стикерпаки и установленные стикеры
      if (!db.objectStoreNames.contains('sticker_packs')) {
        const packs = db.createObjectStore('sticker_packs', { keyPath: 'id' });
        packs.createIndex('installedAt', 'installedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('recent_stickers')) {
        const recent = db.createObjectStore('recent_stickers', { keyPath: 'key' });
        recent.createIndex('usedAt', 'usedAt', { unique: false });
      }
      // v6 — голосовые сообщения: хранение blob отдельно от messages
      if (!db.objectStoreNames.contains('voice_blobs')) {
        db.createObjectStore('voice_blobs', { keyPath: 'id' });
      }
    }
  });
  return dbPromise;
}

/**
 * === Стикеры ===
 */
export async function putStickerPack(pack) {
  const db = await openDatabase();
  await db.put('sticker_packs', {
    id: String(pack.id || ''),
    name: String(pack.name || 'Пак'),
    author: pack.author || 'orbits',
    thumbnail: pack.thumbnail || null,
    stickers: Array.isArray(pack.stickers) ? pack.stickers : [],
    installedAt: pack.installedAt || Date.now()
  });
  return true;
}
export async function getStickerPack(packId) {
  const db = await openDatabase();
  return (await db.get('sticker_packs', String(packId || ''))) || null;
}
export async function getAllStickerPacks() {
  const db = await openDatabase();
  return (await db.getAll('sticker_packs')) || [];
}
export async function deleteStickerPack(packId) {
  const db = await openDatabase();
  await db.delete('sticker_packs', String(packId || ''));
  return true;
}

export async function pushRecentSticker(packId, stickerId) {
  const db = await openDatabase();
  const key = `${packId}:${stickerId}`;
  await db.put('recent_stickers', { key, packId, stickerId, usedAt: Date.now() });
  return true;
}
export async function getRecentStickers(limit = 24) {
  const db = await openDatabase();
  const rows = (await db.getAll('recent_stickers')) || [];
  return rows
    .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0))
    .slice(0, limit);
}

/**
 * === Голосовые сообщения ===
 */
export async function saveVoiceBlob(id, blob, meta = {}) {
  const db = await openDatabase();
  await db.put('voice_blobs', {
    id: String(id),
    blob,
    mime: meta.mime || blob?.type || 'audio/webm',
    duration: Number(meta.duration || 0),
    waveform: Array.isArray(meta.waveform) ? meta.waveform : [],
    createdAt: Date.now()
  });
  return true;
}
export async function getVoiceBlob(id) {
  const db = await openDatabase();
  return (await db.get('voice_blobs', String(id))) || null;
}
export async function deleteVoiceBlob(id) {
  const db = await openDatabase();
  await db.delete('voice_blobs', String(id));
  return true;
}

/**
 * Сохранение локальной пары ключей
 */
export async function saveKeyPair(keyPair) {
  const db = await openDatabase();
  await db.put('keys', {
    id: 'local-identity',
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: Date.now()
  });
  return true;
}

/**
 * Получение локальной пары ключей
 */
export async function getKeyPair() {
  const db = await openDatabase();
  return (await db.get('keys', 'local-identity')) || null;
}

/**
 * Сохранение симметричного ключа сессии с пиром
 */
export async function saveSessionKey(peerId, symmetricKeyB64) {
  const db = await openDatabase();
  await db.put('session_keys', {
    id: `session-${peerId}`,
    peerId,
    symmetricKey: symmetricKeyB64,
    updatedAt: Date.now()
  });
  return true;
}

/**
 * Получение симметричного ключа сессии с пиром
 */
export async function getSessionKey(peerId) {
  const db = await openDatabase();
  const rec = await db.get('session_keys', `session-${peerId}`);
  return rec?.symmetricKey || null;
}

/**
 * Добавление/обновление пира
 */
export async function savePeer(peer) {
  const db = await openDatabase();
  const trusted = peer?.trusted === true;
  await db.put('peers', {
    id: String(peer.id || ''),
    displayName: String(peer.displayName || '').slice(0, 64),
    lastSeenAt: Number(peer.lastSeenAt || 0) || 0,
    trusted,
    pubKey: peer.pubKey || null,
    trustLevel: peer.trustLevel || (trusted ? 1 : 0),
    addedAt: peer.addedAt || Date.now()
  });
  return true;
}

/**
 * Получение пира по ID
 */
export async function getPeer(peerId) {
  const db = await openDatabase();
  return (await db.get('peers', peerId)) || null;
}

/**
 * Получение всех пиров
 */
export async function getAllPeers() {
  const db = await openDatabase();
  return (await db.getAll('peers')) || [];
}

export async function upsertSessionKey(peerId, symmetricKeyB64) {
  return saveSessionKey(peerId, symmetricKeyB64);
}

export async function getSessionKeyRecord(peerId) {
  const db = await openDatabase();
  return (await db.get('session_keys', `session-${peerId}`)) || null;
}

/**
 * Удаление пира
 */
export async function deletePeer(peerId) {
  const db = await openDatabase();
  await db.delete('peers', peerId);
  return true;
}

/**
 * Сохранение зашифрованного сообщения
 */
export async function saveMessage(message) {
  const db = await openDatabase();
  const ts = message.timestamp || Date.now();
  const id = message.id || `${message.peerId}-${ts}`;
  await db.put('messages', {
    id,
    peerId: String(message.peerId || ''),
    timestamp: ts,
    encryptedPayload: message.encryptedPayload || null,
    payload: message.payload || null,
    direction: message.direction,
    status: normalizeMessageStatus(message.status, message.direction)
  });
  return true;
}

export async function getMessageById(id) {
  const db = await openDatabase();
  return (await db.get('messages', id)) || null;
}

export async function updateMessage(id, patch) {
  const db = await openDatabase();
  const v = await db.get('messages', id);
  if (!v) return false;
  await db.put('messages', { ...v, ...patch });
  return true;
}

export async function updateMessageStatus(id, status) {
  const db = await openDatabase();
  const v = await db.get('messages', id);
  if (!v) return false;
  await db.put('messages', { ...v, status: normalizeMessageStatus(status, v.direction) });
  return true;
}

export async function updateMessageStatusesBatch(ids, status) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return 0;
  const db = await openDatabase();
  const tx = db.transaction('messages', 'readwrite');
  let updated = 0;
  for (const id of list) {
    const v = await tx.store.get(id);
    if (!v) continue;
    try {
      await tx.store.put({ ...v, status: normalizeMessageStatus(status, v.direction) });
      updated++;
    } catch (_) {
    }
  }
  await tx.done;
  return updated;
}

export async function deleteMessagesOlderThan(cutoffTimestamp) {
  const cutoff = Number(cutoffTimestamp);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return 0;
  const db = await openDatabase();
  const tx = db.transaction('messages', 'readwrite');
  const range = IDBKeyRange.upperBound(cutoff, true);
  let deleted = 0;
  let cursor = await tx.store.index('timestamp').openCursor(range);
  while (cursor) {
    try {
      await cursor.delete();
      deleted++;
    } catch (_) {
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return deleted;
}

export async function getPendingMessages(peerId, limit = 200) {
  const db = await openDatabase();
  const results = [];

  if (peerId) {
    const pid = String(peerId || '');
    const range = IDBKeyRange.bound([pid, 'pending', 0], [pid, 'pending', Infinity]);
    let cursor = await db.transaction('messages').store.index('peerId_status_timestamp').openCursor(range, 'next');
    while (cursor && results.length < limit) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }
    return results;
  }

  const range = IDBKeyRange.only('pending');
  let cursor = await db.transaction('messages').store.index('status').openCursor(range, 'next');
  while (cursor && results.length < limit) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

/**
 * Получение сообщений для пира (с пагинацией)
 */
export async function getMessages(peerId, limit = 50, beforeTimestamp = Infinity) {
  const db = await openDatabase();
  const index = db.transaction('messages').store.index('peerId_timestamp');
  const range = IDBKeyRange.bound([peerId, 0], [peerId, beforeTimestamp], false, true);
  const results = [];
  let cursor = await index.openCursor(range, 'prev');
  while (cursor && results.length < limit) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

export async function deleteMessageRow(id) {
  const db = await openDatabase();
  try {
    await db.delete('messages', String(id || ''));
  } catch (_) {
  }
  return true;
}

export async function clearAllMessages() {
  const db = await openDatabase();
  await db.clear('messages');
  return true;
}

export async function clearPendingMessages(peerId = null) {
  const db = await openDatabase();
  const tx = db.transaction('messages', 'readwrite');
  let count = 0;

  if (peerId) {
    const pid = String(peerId);
    const range = IDBKeyRange.bound([pid, 'pending', 0], [pid, 'pending', Infinity]);
    let cursor = await tx.store.index('peerId_status_timestamp').openCursor(range, 'next');
    while (cursor) {
      try {
        await cursor.delete();
        count++;
      } catch (_) {
      }
      cursor = await cursor.continue();
    }
  } else {
    const range = IDBKeyRange.only('pending');
    let cursor = await tx.store.index('status').openCursor(range, 'next');
    while (cursor) {
      try {
        await cursor.delete();
        count++;
      } catch (_) {
      }
      cursor = await cursor.continue();
    }
  }

  await tx.done;
  return count;
}

/**
 * Удаление всех данных (для отладки)
 */
export async function clearAllData() {
  const db = await openDatabase();
  await Promise.all([
    db.clear('peers'),
    db.clear('messages'),
    db.clear('keys'),
    db.clear('session_keys'),
    db.clear('avatars'),
    db.clear('sticker_packs'),
    db.clear('recent_stickers'),
    db.clear('voice_blobs')
  ]);
  return true;
}

export async function saveAvatar(peerId, avatarDataUrl) {
  const db = await openDatabase();
  await db.put('avatars', {
    peerId: String(peerId || ''),
    avatarDataUrl,
    updatedAt: Date.now()
  });
  return true;
}

export async function getAvatar(peerId) {
  const db = await openDatabase();
  const rec = await db.get('avatars', String(peerId || ''));
  return rec?.avatarDataUrl || null;
}
