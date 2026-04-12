// ratchetWasm.js — JS обёртка для Rust Double Ratchet (WASM).
//
// Пытается загрузить скомпилированный WASM модуль из `../../pkg/`.
// Если WASM недоступен — fallback на существующую JS-реализацию
// (doubleRatchet.js).
//
// Экспортирует единый API, который вызывающий код может использовать
// не задумываясь о бэкенде (Rust/JS).

import { bytesToBase64, base64ToBytes } from './base64.js';

let wasmModule = null;
let wasmReady = false;
let wasmLoadAttempted = false;

/**
 * Попытка загрузить WASM модуль. Безопасна для вызова несколько раз.
 * Возвращает true если модуль загружен, false при ошибке.
 */
export async function loadWasm() {
  if (wasmReady) return true;
  if (wasmLoadAttempted) return false;
  wasmLoadAttempted = true;

  try {
    const mod = await import('../../pkg/orbits_crypto.js');
    if (mod.default && typeof mod.default === 'function') {
      await mod.default();
    }
    wasmModule = mod;
    wasmReady = true;
    return true;
  } catch (_) {
    wasmModule = null;
    wasmReady = false;
    return false;
  }
}

/** Проверяет, доступен ли WASM бэкенд. */
export function isWasmAvailable() {
  return wasmReady && wasmModule !== null;
}

/** Возвращает текущий бэкенд: 'wasm' или 'js'. */
export function getBackend() {
  return wasmReady ? 'wasm' : 'js';
}

// ─────────────────────────────────────────────────────────────
// Генерация DH ключей
// ─────────────────────────────────────────────────────────────

/**
 * Генерирует X25519 DH-пару.
 * @returns {Promise<{secret: string, public: string}>} base64-encoded keys
 */
export async function generateDhKeyPair() {
  if (wasmReady && wasmModule?.generateDhKeyPair) {
    const json = wasmModule.generateDhKeyPair();
    return JSON.parse(json);
  }

  // Fallback: использовать Web Crypto ECDH P-256
  // (не X25519, но совместимо с текущей JS-реализацией doubleRatchet.js)
  const { generateDhKeyPair: jsGen, exportSpkiBytes } = await import('./doubleRatchet.js');
  const keyPair = await jsGen();
  const pubSpki = await exportSpkiBytes(keyPair.publicKey);
  // Для Web Crypto мы не можем легко экспортировать private key в raw,
  // поэтому возвращаем CryptoKeyPair вместо base64
  return { keyPair, pubSpki, _isCryptoKey: true };
}

// ─────────────────────────────────────────────────────────────
// Инициализация
// ─────────────────────────────────────────────────────────────

/**
 * Инициализация Alice (инициатор).
 * @param {Uint8Array} sharedSecret — 32-байтный общий секрет
 * @param {Uint8Array} remoteDhPub — публичный X25519 ключ Bob'а
 * @returns {Promise<object>} RatchetState (JSON-объект для WASM, ratchet state для JS)
 */
export async function initAlice(sharedSecret, remoteDhPub) {
  if (wasmReady && wasmModule?.ratchetInitAlice) {
    const json = wasmModule.ratchetInitAlice(
      bytesToBase64(sharedSecret),
      bytesToBase64(remoteDhPub)
    );
    return { _backend: 'wasm', _stateJson: json, state: JSON.parse(json) };
  }

  // JS fallback
  const { ratchetInitAlice } = await import('./doubleRatchet.js');
  const state = await ratchetInitAlice({ sharedSecret, remoteDhPubSpki: remoteDhPub });
  return { _backend: 'js', state };
}

/**
 * Инициализация Bob (ответчик).
 * @param {Uint8Array} sharedSecret — 32-байтный общий секрет
 * @param {Uint8Array|object} dhSecret — секретный ключ Bob'а (bytes или CryptoKeyPair)
 * @param {Uint8Array} dhPub — публичный ключ Bob'а
 * @returns {Promise<object>} RatchetState
 */
export async function initBob(sharedSecret, dhSecret, dhPub) {
  if (wasmReady && wasmModule?.ratchetInitBob) {
    const json = wasmModule.ratchetInitBob(
      bytesToBase64(sharedSecret),
      bytesToBase64(dhSecret),
      bytesToBase64(dhPub)
    );
    return { _backend: 'wasm', _stateJson: json, state: JSON.parse(json) };
  }

  // JS fallback — dhSecret здесь CryptoKeyPair
  const { ratchetInitBob } = await import('./doubleRatchet.js');
  const state = await ratchetInitBob({ sharedSecret, dhKeyPair: dhSecret, dhPubSpki: dhPub });
  return { _backend: 'js', state };
}

// ─────────────────────────────────────────────────────────────
// Шифрование / Расшифровка
// ─────────────────────────────────────────────────────────────

/**
 * Шифрование сообщения.
 * @param {object} wrapped — объект от initAlice/initBob/предыдущего encrypt/decrypt
 * @param {Uint8Array|string} plaintext — данные для шифрования
 * @returns {Promise<{wrapped: object, header: string, ciphertext: string}>}
 *   header и ciphertext в base64
 */
export async function encrypt(wrapped, plaintext) {
  const pt = plaintext instanceof Uint8Array
    ? plaintext
    : new TextEncoder().encode(String(plaintext));

  if (wrapped._backend === 'wasm' && wasmReady && wasmModule?.ratchetEncrypt) {
    const stateJson = wrapped._stateJson || JSON.stringify(wrapped.state);
    const resultJson = wasmModule.ratchetEncrypt(stateJson, bytesToBase64(pt));
    const result = JSON.parse(resultJson);
    return {
      wrapped: {
        _backend: 'wasm',
        _stateJson: JSON.stringify(result.state),
        state: result.state
      },
      header: result.header,
      ciphertext: result.ciphertext
    };
  }

  // JS fallback
  const { ratchetEncrypt } = await import('./doubleRatchet.js');
  const { state: newState, envelope } = await ratchetEncrypt(wrapped.state, pt);
  return {
    wrapped: { _backend: 'js', state: newState },
    header: envelope.headerB64,
    ciphertext: `${envelope.ivB64}:${envelope.ctB64}`
  };
}

/**
 * Расшифровка сообщения.
 * @param {object} wrapped — объект состояния
 * @param {string} headerB64 — заголовок в base64
 * @param {string} ciphertextB64 — ciphertext в base64
 * @returns {Promise<{wrapped: object, plaintext: Uint8Array}>}
 */
export async function decrypt(wrapped, headerB64, ciphertextB64) {
  if (wrapped._backend === 'wasm' && wasmReady && wasmModule?.ratchetDecrypt) {
    const stateJson = wrapped._stateJson || JSON.stringify(wrapped.state);
    const resultJson = wasmModule.ratchetDecrypt(stateJson, headerB64, ciphertextB64);
    const result = JSON.parse(resultJson);
    return {
      wrapped: {
        _backend: 'wasm',
        _stateJson: JSON.stringify(result.state),
        state: result.state
      },
      plaintext: base64ToBytes(result.plaintext)
    };
  }

  // JS fallback — разбираем iv:ct из ciphertextB64
  const { ratchetDecrypt } = await import('./doubleRatchet.js');
  const parts = ciphertextB64.split(':');
  const envelope = {
    headerB64,
    ivB64: parts[0] || '',
    ctB64: parts[1] || ciphertextB64
  };
  const { state: newState, plaintext } = await ratchetDecrypt(wrapped.state, envelope);
  return {
    wrapped: { _backend: 'js', state: newState },
    plaintext
  };
}
