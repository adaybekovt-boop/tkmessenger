// Orbits Worker — сердце системы
// Интеграция: Wasm-криптография + IndexedDB
// Все тяжёлые вычисления изолированы здесь, UI никогда не блокируется

import {
  openDatabase,
  saveKeyPair,
  getKeyPair,
  saveSessionKey,
  getSessionKey,
  saveMessage,
  getMessages,
  savePeer,
  getAllPeers,
  clearAllData
} from '../core/db.js';

// === Состояние воркера ===
let wasmModule = null;
let heartbeatTimer = null;
let heartbeatIntervalMs = 1500;
let lastSeen = 0;
let cryptoReady = false;

// === Утилиты ===
function post(type, payload = {}) {
  self.postMessage({ type, ts: Date.now(), ...payload });
}

// === Heartbeat ===
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    post('heartbeat', { since: lastSeen, cryptoReady });
  }, heartbeatIntervalMs);
}

function stopHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// === Загрузка Wasm модуля ===
async function loadWasmModule() {
  try {
    // Динамическая загрузка Wasm модуля
    // После сборки через wasm-pack: npm run build:wasm
    // Модуль появится в pkg/orbits_crypto.js
    const wasmUrl = new URL(/* @vite-ignore */ '../../pkg/orbits_crypto.js', import.meta.url).href;
    const response = await fetch(wasmUrl, { method: 'HEAD' });
    if (!response.ok) return false;

    const wasm = await import(/* @vite-ignore */ wasmUrl);
    if (wasm && wasm.default) await wasm.default();
    if (wasm && typeof wasm.generateKeyPair === 'function') {
      wasmModule = wasm;
      return true;
    }
  } catch (_) {
    // Wasm не скомпилирован — используем фолбэк на Web Crypto API
  }
  return false;
}

// === Фолбэк-криптография на Web Crypto API ===
// Используется когда Wasm модуль недоступен

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fallbackGenerateKeyPair() {
  // Генерация ECDH P-256 пары ключей через Web Crypto API
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  return JSON.stringify({
    privateKey: JSON.stringify(privateJwk),
    publicKey: JSON.stringify(publicJwk)
  });
}

async function fallbackEncryptAesGcm(keyB64, plaintext) {
  const keyBytes = base64ToBytes(keyB64);
  const aesKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);

  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return bytesToBase64(combined);
}

async function fallbackDecryptAesGcm(keyB64, encryptedB64) {
  const keyBytes = base64ToBytes(keyB64);
  const combined = base64ToBytes(encryptedB64);

  if (combined.length < 13) throw new Error('Данные слишком короткие');

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const aesKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function fallbackDeriveSymmetricKey(sharedSecretB64, info) {
  const sharedSecret = base64ToBytes(sharedSecretB64);
  const baseKey = await crypto.subtle.importKey(
    'raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
    baseKey,
    256
  );
  return bytesToBase64(new Uint8Array(derived));
}

// === Генерация рандомного симметричного ключа (для начальной инициализации) ===
function generateRandomSymmetricKey() {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(keyBytes);
}

// === Обработчик сообщений от UI ===
self.onmessage = async (event) => {
  const msg = event?.data;
  if (!msg || typeof msg.type !== 'string') return;
  lastSeen = Date.now();

  try {
    // --- Базовые команды (Phase 0) ---

    if (msg.type === 'init') {
      const intervalMs = Number(msg.intervalMs);
      if (Number.isFinite(intervalMs) && intervalMs >= 250) heartbeatIntervalMs = intervalMs;

      // Инициализация БД
      await openDatabase();

      // Попытка загрузить Wasm
      const wasmLoaded = await loadWasmModule();

      startHeartbeat();
      post('ready', {
        intervalMs: heartbeatIntervalMs,
        wasmAvailable: wasmLoaded,
        cryptoBackend: wasmLoaded ? 'rust-wasm' : 'web-crypto-api'
      });
      return;
    }

    if (msg.type === 'ping') {
      post('pong', { id: msg.id ?? null });
      return;
    }

    if (msg.type === 'stop') {
      stopHeartbeat();
      post('stopped');
      return;
    }

    if (msg.type === 'runDemo') {
      const total = 600000;
      let acc = 0;
      for (let i = 0; i < total; i++) {
        acc = (acc + (i ^ 1337)) >>> 0;
        if (i % 50000 === 0) post('progress', { percent: Math.floor((i / total) * 100) });
      }
      post('result', { result: acc });
      return;
    }

    // --- Команды Phase 1: Криптография ---

    if (msg.type === 'INIT_CRYPTO') {
      // Генерация локальной пары ключей и сохранение в IndexedDB
      let existing = await getKeyPair();
      if (existing && !msg.force) {
        cryptoReady = true;
        post('CRYPTO_READY', {
          publicKey: existing.publicKey,
          isNew: false
        });
        return;
      }

      let keyPairJson;
      if (wasmModule) {
        keyPairJson = wasmModule.generateKeyPair();
      } else {
        keyPairJson = await fallbackGenerateKeyPair();
      }

      const keyPair = JSON.parse(keyPairJson);
      await saveKeyPair(keyPair);

      // Генерация дефолтного симметричного ключа для локального шифрования
      const defaultSymKey = generateRandomSymmetricKey();
      await saveSessionKey('__local__', defaultSymKey);

      cryptoReady = true;
      post('CRYPTO_READY', {
        publicKey: keyPair.publicKey,
        isNew: true
      });
      return;
    }

    if (msg.type === 'ENCRYPT_AND_SAVE') {
      // Приём текста от UI → Шифрование → Сохранение в IndexedDB → Отправка зашифрованного буфера
      if (!cryptoReady) {
        post('error', { message: 'Криптография не инициализирована. Вызовите INIT_CRYPTO.' });
        return;
      }

      const { peerId, plaintext, direction = 'out' } = msg;
      if (!peerId || !plaintext) {
        post('error', { message: 'Требуются peerId и plaintext' });
        return;
      }

      // Получение сессионного ключа (или дефолтного)
      let symKey = await getSessionKey(peerId);
      if (!symKey) {
        symKey = await getSessionKey('__local__');
      }
      if (!symKey) {
        post('error', { message: 'Нет ключа шифрования для пира: ' + peerId });
        return;
      }

      let encryptedPayload;
      if (wasmModule) {
        encryptedPayload = wasmModule.encryptAesGcm(symKey, plaintext);
      } else {
        encryptedPayload = await fallbackEncryptAesGcm(symKey, plaintext);
      }

      const messageId = `${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await saveMessage({
        id: messageId,
        peerId,
        timestamp: Date.now(),
        encryptedPayload,
        direction
      });

      post('ENCRYPTED', {
        messageId,
        peerId,
        encryptedPayload,
        direction
      });
      return;
    }

    if (msg.type === 'DECRYPT_AND_SAVE') {
      // Приём зашифрованного буфера → Дешифровка → Сохранение в БД → Отправка plaintext в UI
      if (!cryptoReady) {
        post('error', { message: 'Криптография не инициализирована. Вызовите INIT_CRYPTO.' });
        return;
      }

      const { peerId, encryptedPayload, direction = 'in' } = msg;
      if (!peerId || !encryptedPayload) {
        post('error', { message: 'Требуются peerId и encryptedPayload' });
        return;
      }

      let symKey = await getSessionKey(peerId);
      if (!symKey) {
        symKey = await getSessionKey('__local__');
      }
      if (!symKey) {
        post('error', { message: 'Нет ключа дешифрования для пира: ' + peerId });
        return;
      }

      let plaintext;
      if (wasmModule) {
        plaintext = wasmModule.decryptAesGcm(symKey, encryptedPayload);
      } else {
        plaintext = await fallbackDecryptAesGcm(symKey, encryptedPayload);
      }

      const messageId = `${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await saveMessage({
        id: messageId,
        peerId,
        timestamp: Date.now(),
        encryptedPayload,
        direction
      });

      post('DECRYPTED', {
        messageId,
        peerId,
        plaintext,
        direction
      });
      return;
    }

    // --- Вспомогательные команды ---

    if (msg.type === 'GET_PUBLIC_KEY') {
      const kp = await getKeyPair();
      post('PUBLIC_KEY', { publicKey: kp?.publicKey || null });
      return;
    }

    if (msg.type === 'SET_SESSION_KEY') {
      const { peerId, symmetricKey } = msg;
      await saveSessionKey(peerId, symmetricKey);
      post('SESSION_KEY_SET', { peerId });
      return;
    }

    if (msg.type === 'GET_MESSAGES') {
      const { peerId, limit, beforeTimestamp } = msg;
      const messages = await getMessages(peerId, limit, beforeTimestamp);
      post('MESSAGES', { peerId, messages });
      return;
    }

    if (msg.type === 'GET_PEERS') {
      const peers = await getAllPeers();
      post('PEERS', { peers });
      return;
    }

    if (msg.type === 'ADD_PEER') {
      await savePeer(msg.peer);
      post('PEER_ADDED', { peerId: msg.peer.id });
      return;
    }

    if (msg.type === 'CLEAR_ALL') {
      await clearAllData();
      cryptoReady = false;
      post('CLEARED');
      return;
    }

    if (msg.type === 'GET_STATUS') {
      post('STATUS', {
        cryptoReady,
        wasmAvailable: !!wasmModule,
        cryptoBackend: wasmModule ? 'rust-wasm' : 'web-crypto-api'
      });
      return;
    }

    post('error', { message: 'Неизвестная команда воркера: ' + msg.type });

  } catch (err) {
    post('error', { message: err?.message || 'Неизвестная ошибка в воркере', command: msg.type });
  }
};
