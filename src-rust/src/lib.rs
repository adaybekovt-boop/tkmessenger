// Криптографическое ядро Orbits P2P
// Генерация ключей Ed25519, шифрование/дешифрование AES-256-GCM
// Double Ratchet протокол (Signal Protocol)
// Scrypt/PBKDF2/HMAC, Drop engine, Virtual scroll

mod ratchet;
mod crypto;
mod drop_engine;
mod virtual_scroll;

use wasm_bindgen::prelude::*;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use ed25519_dalek::{SigningKey, VerifyingKey};
use hkdf::Hkdf;
use sha2::Sha256;
use rand::rngs::OsRng;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use ratchet::{RatchetState, ratchet_init_alice, ratchet_init_bob, ratchet_encrypt, ratchet_decrypt};

/// Генерация пары ключей Ed25519
/// Возвращает JSON: { "privateKey": "base64...", "publicKey": "base64..." }
#[wasm_bindgen(js_name = generateKeyPair)]
pub fn generate_key_pair() -> Result<String, JsValue> {
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key: VerifyingKey = (&signing_key).into();

    let private_b64 = BASE64.encode(signing_key.to_bytes());
    let public_b64 = BASE64.encode(verifying_key.to_bytes());

    let result = serde_json::json!({
        "privateKey": private_b64,
        "publicKey": public_b64
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

/// Деривация симметричного ключа AES-256 из общего секрета через HKDF
/// sharedSecret — base64 строка общего секрета
/// info — контекстная строка для HKDF
/// Возвращает base64 строку 32-байтного ключа
#[wasm_bindgen(js_name = deriveSymmetricKey)]
pub fn derive_symmetric_key(shared_secret_b64: &str, info: &str) -> Result<String, JsValue> {
    let shared_secret = BASE64.decode(shared_secret_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования base64: {}", e)))?;

    let hk = Hkdf::<Sha256>::new(None, &shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm)
        .map_err(|e| JsValue::from_str(&format!("Ошибка HKDF: {}", e)))?;

    Ok(BASE64.encode(okm))
}

/// Шифрование данных AES-256-GCM
/// keyB64 — base64 строка 32-байтного ключа
/// plaintext — строка для шифрования
/// Возвращает base64 строку: nonce(12 байт) + ciphertext
#[wasm_bindgen(js_name = encryptAesGcm)]
pub fn encrypt_aes_gcm(key_b64: &str, plaintext: &str) -> Result<String, JsValue> {
    let key_bytes = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования ключа: {}", e)))?;

    if key_bytes.len() != 32 {
        return Err(JsValue::from_str("Ключ должен быть 32 байта"));
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| JsValue::from_str(&format!("Ошибка создания шифра: {}", e)))?;

    // Генерация случайного nonce (12 байт)
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|e| JsValue::from_str(&format!("Ошибка генерации nonce: {}", e)))?;

    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| JsValue::from_str(&format!("Ошибка шифрования: {}", e)))?;

    // Объединяем nonce + ciphertext
    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64.encode(combined))
}

/// Дешифрование данных AES-256-GCM
/// keyB64 — base64 строка 32-байтного ключа
/// encryptedB64 — base64 строка (nonce + ciphertext)
/// Возвращает расшифрованную строку
#[wasm_bindgen(js_name = decryptAesGcm)]
pub fn decrypt_aes_gcm(key_b64: &str, encrypted_b64: &str) -> Result<String, JsValue> {
    let key_bytes = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования ключа: {}", e)))?;

    if key_bytes.len() != 32 {
        return Err(JsValue::from_str("Ключ должен быть 32 байта"));
    }

    let combined = BASE64.decode(encrypted_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования данных: {}", e)))?;

    if combined.len() < 13 {
        return Err(JsValue::from_str("Зашифрованные данные слишком короткие"));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| JsValue::from_str(&format!("Ошибка создания шифра: {}", e)))?;

    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| JsValue::from_str("Ошибка дешифрования: неверный ключ или повреждённые данные"))?;

    String::from_utf8(plaintext)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования UTF-8: {}", e)))
}

/// Подпись данных ключом Ed25519
/// privateKeyB64 — base64 приватного ключа (32 байта)
/// message — строка для подписи
/// Возвращает base64 строку подписи (64 байта)
#[wasm_bindgen(js_name = signMessage)]
pub fn sign_message(private_key_b64: &str, message: &str) -> Result<String, JsValue> {
    let key_bytes = BASE64.decode(private_key_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования ключа: {}", e)))?;

    let key_array: [u8; 32] = key_bytes.try_into()
        .map_err(|_| JsValue::from_str("Приватный ключ должен быть 32 байта"))?;

    let signing_key = SigningKey::from_bytes(&key_array);
    use ed25519_dalek::Signer;
    let signature = signing_key.sign(message.as_bytes());

    Ok(BASE64.encode(signature.to_bytes()))
}

/// Проверка подписи Ed25519
/// publicKeyB64 — base64 публичного ключа (32 байта)
/// message — исходное сообщение
/// signatureB64 — base64 подписи
/// Возвращает true если подпись валидна
#[wasm_bindgen(js_name = verifySignature)]
pub fn verify_signature(public_key_b64: &str, message: &str, signature_b64: &str) -> Result<bool, JsValue> {
    let pub_bytes = BASE64.decode(public_key_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования публичного ключа: {}", e)))?;

    let pub_array: [u8; 32] = pub_bytes.try_into()
        .map_err(|_| JsValue::from_str("Публичный ключ должен быть 32 байта"))?;

    let sig_bytes = BASE64.decode(signature_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка декодирования подписи: {}", e)))?;

    let sig_array: [u8; 64] = sig_bytes.try_into()
        .map_err(|_| JsValue::from_str("Подпись должна быть 64 байта"))?;

    let verifying_key = VerifyingKey::from_bytes(&pub_array)
        .map_err(|e| JsValue::from_str(&format!("Некорректный публичный ключ: {}", e)))?;

    let signature = ed25519_dalek::Signature::from_bytes(&sig_array);

    use ed25519_dalek::Verifier;
    match verifying_key.verify(message.as_bytes(), &signature) {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

// ─────────────────────────────────────────────────────────────
// Double Ratchet — WASM bindings
// ─────────────────────────────────────────────────────────────

/// Генерация X25519 DH-пары для Double Ratchet.
/// Возвращает JSON: { "secret": "base64...", "public": "base64..." }
#[wasm_bindgen(js_name = generateDhKeyPair)]
pub fn generate_dh_key_pair() -> Result<String, JsValue> {
    let secret = x25519_dalek::StaticSecret::random_from_rng(OsRng);
    let public = x25519_dalek::PublicKey::from(&secret);

    let result = serde_json::json!({
        "secret": BASE64.encode(secret.to_bytes()),
        "public": BASE64.encode(public.to_bytes())
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

/// Инициализация Alice (инициатор).
///
/// sharedSecretB64 — 32-байтный общий секрет (base64).
/// remoteDhPubB64 — 32-байтный X25519 публичный ключ Bob'а (base64).
///
/// Возвращает JSON с полным RatchetState.
#[wasm_bindgen(js_name = ratchetInitAlice)]
pub fn ratchet_init_alice_wasm(
    shared_secret_b64: &str,
    remote_dh_pub_b64: &str,
) -> Result<String, JsValue> {
    let shared = BASE64.decode(shared_secret_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 shared_secret: {}", e)))?;
    let remote_pub = BASE64.decode(remote_dh_pub_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 remote_dh_pub: {}", e)))?;

    let state = ratchet_init_alice(&shared, &remote_pub)
        .map_err(|e| JsValue::from_str(&format!("Ошибка инициализации Alice: {}", e)))?;

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

/// Инициализация Bob (ответчик).
///
/// sharedSecretB64 — 32-байтный общий секрет (base64).
/// dhSecretB64 — 32-байтный X25519 секретный ключ Bob'а (base64).
/// dhPubB64 — 32-байтный X25519 публичный ключ Bob'а (base64).
///
/// Возвращает JSON с полным RatchetState.
#[wasm_bindgen(js_name = ratchetInitBob)]
pub fn ratchet_init_bob_wasm(
    shared_secret_b64: &str,
    dh_secret_b64: &str,
    dh_pub_b64: &str,
) -> Result<String, JsValue> {
    let shared = BASE64.decode(shared_secret_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 shared_secret: {}", e)))?;
    let dh_secret = BASE64.decode(dh_secret_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 dh_secret: {}", e)))?;
    let dh_pub = BASE64.decode(dh_pub_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 dh_pub: {}", e)))?;

    let state = ratchet_init_bob(&shared, &dh_secret, &dh_pub)
        .map_err(|e| JsValue::from_str(&format!("Ошибка инициализации Bob: {}", e)))?;

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

/// Шифрование сообщения.
///
/// stateJson — текущий RatchetState в JSON.
/// plaintextB64 — plaintext в base64.
///
/// Возвращает JSON:
/// {
///   "state": <обновлённый RatchetState>,
///   "header": "base64...",
///   "ciphertext": "base64..."
/// }
#[wasm_bindgen(js_name = ratchetEncrypt)]
pub fn ratchet_encrypt_wasm(
    state_json: &str,
    plaintext_b64: &str,
) -> Result<String, JsValue> {
    let mut state: RatchetState = serde_json::from_str(state_json)
        .map_err(|e| JsValue::from_str(&format!("Ошибка десериализации state: {}", e)))?;
    let plaintext = BASE64.decode(plaintext_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 plaintext: {}", e)))?;

    let (header, ct) = ratchet_encrypt(&mut state, &plaintext)
        .map_err(|e| JsValue::from_str(&format!("Ошибка шифрования: {}", e)))?;

    let result = serde_json::json!({
        "state": state,
        "header": BASE64.encode(&header),
        "ciphertext": BASE64.encode(&ct)
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

/// Расшифровка сообщения.
///
/// stateJson — текущий RatchetState в JSON.
/// headerB64 — заголовок сообщения в base64.
/// ciphertextB64 — ciphertext в base64.
///
/// Возвращает JSON:
/// {
///   "state": <обновлённый RatchetState>,
///   "plaintext": "base64..."
/// }
#[wasm_bindgen(js_name = ratchetDecrypt)]
pub fn ratchet_decrypt_wasm(
    state_json: &str,
    header_b64: &str,
    ciphertext_b64: &str,
) -> Result<String, JsValue> {
    let mut state: RatchetState = serde_json::from_str(state_json)
        .map_err(|e| JsValue::from_str(&format!("Ошибка десериализации state: {}", e)))?;
    let header = BASE64.decode(header_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 header: {}", e)))?;
    let ct = BASE64.decode(ciphertext_b64)
        .map_err(|e| JsValue::from_str(&format!("Ошибка base64 ciphertext: {}", e)))?;

    let plaintext = ratchet_decrypt(&mut state, &header, &ct)
        .map_err(|e| JsValue::from_str(&format!("Ошибка расшифровки: {}", e)))?;

    let result = serde_json::json!({
        "state": state,
        "plaintext": BASE64.encode(&plaintext)
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Ошибка сериализации: {}", e)))
}

// ─────────────────────────────────────────────────────────────
// Crypto core — WASM bindings
// ─────────────────────────────────────────────────────────────

/// SHA-256 хеш строки → hex.
#[wasm_bindgen(js_name = sha256Hex)]
pub fn sha256_hex_wasm(input: &str) -> String {
    crypto::sha256_hex(input)
}

/// SHA-256 хеш бинарных данных (base64) → hex.
#[wasm_bindgen(js_name = sha256HexBuffer)]
pub fn sha256_hex_buffer_wasm(data_b64: &str) -> Result<String, JsValue> {
    let data = BASE64.decode(data_b64)
        .map_err(|e| JsValue::from_str(&format!("base64 decode: {}", e)))?;
    Ok(crypto::sha256_hex_bytes(&data))
}

/// PBKDF2-HMAC-SHA256.
///
/// passwordB64, saltB64 — base64 encoded.
/// Возвращает derived key в base64.
#[wasm_bindgen(js_name = pbkdf2Derive)]
pub fn pbkdf2_derive_wasm(
    password: &str,
    salt_b64: &str,
    iterations: u32,
    length_bytes: u32,
) -> Result<String, JsValue> {
    let salt = BASE64.decode(salt_b64)
        .map_err(|e| JsValue::from_str(&format!("salt base64: {}", e)))?;
    let dk = crypto::pbkdf2_derive(
        password.as_bytes(),
        &salt,
        iterations,
        length_bytes as usize,
    );
    Ok(BASE64.encode(&dk))
}

/// AES-256-GCM шифрование.
///
/// keyB64 — 32-байтный ключ в base64.
/// plaintext — строка для шифрования.
/// Возвращает строку формата ivB64:ctB64.
#[wasm_bindgen(js_name = aesGcmEncryptKey)]
pub fn aes_gcm_encrypt_key_wasm(key_b64: &str, plaintext: &str) -> Result<String, JsValue> {
    let key_bytes = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("key base64: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(JsValue::from_str("Key must be 32 bytes"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    crypto::aes_gcm_encrypt_with_key(&key, plaintext.as_bytes())
        .map_err(|e| JsValue::from_str(&e))
}

/// AES-256-GCM расшифровка.
///
/// keyB64 — 32-байтный ключ в base64.
/// encStr — строка формата ivB64:ctB64.
/// Возвращает расшифрованную строку.
#[wasm_bindgen(js_name = aesGcmDecryptKey)]
pub fn aes_gcm_decrypt_key_wasm(key_b64: &str, enc_str: &str) -> Result<String, JsValue> {
    let key_bytes = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("key base64: {}", e)))?;
    if key_bytes.len() != 32 {
        return Err(JsValue::from_str("Key must be 32 bytes"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&key_bytes);
    let pt = crypto::aes_gcm_decrypt_with_key(&key, enc_str)
        .map_err(|e| JsValue::from_str(&e))?;
    String::from_utf8(pt)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 decode: {}", e)))
}

/// Scrypt KDF.
///
/// keyMaterialB64 — входные данные (username:password:ORBITS_P2P) в base64.
/// saltB64 — соль в base64.
/// logN — log2(N), например 14 для N=16384.
/// r, p, dkLen — параметры scrypt.
///
/// Возвращает derived key в base64.
#[wasm_bindgen(js_name = scryptDerive)]
pub fn scrypt_derive_wasm(
    key_material_b64: &str,
    salt_b64: &str,
    log_n: u8,
    r: u32,
    p: u32,
    dk_len: u32,
) -> Result<String, JsValue> {
    let km = BASE64.decode(key_material_b64)
        .map_err(|e| JsValue::from_str(&format!("keyMaterial base64: {}", e)))?;
    let salt = BASE64.decode(salt_b64)
        .map_err(|e| JsValue::from_str(&format!("salt base64: {}", e)))?;
    let dk = crypto::scrypt_derive(&km, &salt, log_n, r, p, dk_len as usize)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(BASE64.encode(&dk))
}

/// HMAC-SHA256 подпись.
///
/// keyB64, dataB64 — base64.
/// Возвращает подпись в base64.
#[wasm_bindgen(js_name = hmacSign)]
pub fn hmac_sign_wasm(key_b64: &str, data_b64: &str) -> Result<String, JsValue> {
    let key = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("key base64: {}", e)))?;
    let data = BASE64.decode(data_b64)
        .map_err(|e| JsValue::from_str(&format!("data base64: {}", e)))?;
    let sig = crypto::hmac_sign(&key, &data);
    Ok(BASE64.encode(&sig))
}

/// HMAC-SHA256 проверка.
///
/// keyB64, signatureB64, dataB64 — base64.
/// Возвращает true если подпись валидна.
#[wasm_bindgen(js_name = hmacVerify)]
pub fn hmac_verify_wasm(
    key_b64: &str,
    signature_b64: &str,
    data_b64: &str,
) -> Result<bool, JsValue> {
    let key = BASE64.decode(key_b64)
        .map_err(|e| JsValue::from_str(&format!("key base64: {}", e)))?;
    let sig = BASE64.decode(signature_b64)
        .map_err(|e| JsValue::from_str(&format!("sig base64: {}", e)))?;
    let data = BASE64.decode(data_b64)
        .map_err(|e| JsValue::from_str(&format!("data base64: {}", e)))?;
    Ok(crypto::hmac_verify(&key, &sig, &data))
}

/// Timing-safe сравнение строк.
#[wasm_bindgen(js_name = timingSafeEqual)]
pub fn timing_safe_equal_wasm(a: &str, b: &str) -> bool {
    crypto::timing_safe_equal(a, b)
}

// ─────────────────────────────────────────────────────────────
// Drop engine — WASM bindings
// ─────────────────────────────────────────────────────────────

/// SHA-256 хеш буфера (для файлов) → hex.
///
/// dataB64 — данные файла в base64.
#[wasm_bindgen(js_name = dropHashBuffer)]
pub fn drop_hash_buffer_wasm(data_b64: &str) -> Result<String, JsValue> {
    let data = BASE64.decode(data_b64)
        .map_err(|e| JsValue::from_str(&format!("base64 decode: {}", e)))?;
    Ok(drop_engine::sha256_buffer(&data))
}

/// Потоковый SHA-256 хешер — создание.
/// Возвращает handle (индекс) хешера.
///
/// Использование:
///   1. handle = streamHasherNew()
///   2. streamHasherUpdate(handle, chunkB64) — повторять для каждого чанка
///   3. hash = streamHasherFinalize(handle) — получить hex-хеш
use std::sync::Mutex;
static HASHERS: Mutex<Vec<Option<drop_engine::StreamHasher>>> = Mutex::new(Vec::new());

#[wasm_bindgen(js_name = streamHasherNew)]
pub fn stream_hasher_new() -> u32 {
    let mut hashers = HASHERS.lock().unwrap();
    let hasher = drop_engine::StreamHasher::new();
    // Найти свободный слот или добавить новый
    for (i, slot) in hashers.iter_mut().enumerate() {
        if slot.is_none() {
            *slot = Some(hasher);
            return i as u32;
        }
    }
    let idx = hashers.len();
    hashers.push(Some(hasher));
    idx as u32
}

#[wasm_bindgen(js_name = streamHasherUpdate)]
pub fn stream_hasher_update(handle: u32, chunk_b64: &str) -> Result<(), JsValue> {
    let data = BASE64.decode(chunk_b64)
        .map_err(|e| JsValue::from_str(&format!("base64: {}", e)))?;
    let mut hashers = HASHERS.lock().unwrap();
    let slot = hashers.get_mut(handle as usize)
        .and_then(|s| s.as_mut())
        .ok_or_else(|| JsValue::from_str("Invalid hasher handle"))?;
    slot.update(&data);
    Ok(())
}

#[wasm_bindgen(js_name = streamHasherFinalize)]
pub fn stream_hasher_finalize(handle: u32) -> Result<String, JsValue> {
    let mut hashers = HASHERS.lock().unwrap();
    let hasher = hashers.get_mut(handle as usize)
        .and_then(|s| s.take())
        .ok_or_else(|| JsValue::from_str("Invalid hasher handle"))?;
    Ok(hasher.finalize())
}

/// Вычисляет метаданные чанков для файла.
///
/// Возвращает JSON: [{ "seq": 0, "offset": 0, "size": 65536 }, ...]
#[wasm_bindgen(js_name = dropComputeChunks)]
pub fn drop_compute_chunks(file_size: f64, chunk_size: u32) -> Result<String, JsValue> {
    let metas = drop_engine::compute_chunk_metas(file_size as u64, chunk_size);
    let json: Vec<serde_json::Value> = metas.iter().map(|m| {
        serde_json::json!({
            "seq": m.seq,
            "offset": m.offset,
            "size": m.size
        })
    }).collect();
    serde_json::to_string(&json)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))
}

/// Хешит данные и возвращает мета чанков.
///
/// Возвращает JSON: { "hash": "hex...", "chunks": [...] }
#[wasm_bindgen(js_name = dropHashAndChunk)]
pub fn drop_hash_and_chunk(data_b64: &str, chunk_size: u32) -> Result<String, JsValue> {
    let data = BASE64.decode(data_b64)
        .map_err(|e| JsValue::from_str(&format!("base64: {}", e)))?;
    let (hash, metas) = drop_engine::hash_and_chunk(&data, chunk_size);
    let chunks: Vec<serde_json::Value> = metas.iter().map(|m| {
        serde_json::json!({
            "seq": m.seq,
            "offset": m.offset,
            "size": m.size
        })
    }).collect();
    let result = serde_json::json!({ "hash": hash, "chunks": chunks });
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))
}

// ─────────────────────────────────────────────────────────────
// Virtual scroll — WASM bindings
// ─────────────────────────────────────────────────────────────

/// Вычисляет видимый диапазон элементов (переменная высота строк).
///
/// heightsJson — JSON массив высот: [50, 72, 48, ...].
/// scrollTop — текущая позиция скролла (px).
/// viewportHeight — высота видимой области (px).
/// overscan — буферные элементы за пределами viewport.
///
/// Возвращает JSON: { "start": 0, "end": 15, "offsetTop": 0, "totalHeight": 5000 }
#[wasm_bindgen(js_name = vsComputeRange)]
pub fn vs_compute_range(
    heights_json: &str,
    scroll_top: f64,
    viewport_height: f64,
    overscan: u32,
) -> Result<String, JsValue> {
    let heights: Vec<f64> = serde_json::from_str(heights_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse heights: {}", e)))?;
    let range = virtual_scroll::compute_visible_range(&heights, scroll_top, viewport_height, overscan);
    let result = serde_json::json!({
        "start": range.start,
        "end": range.end,
        "offsetTop": range.offset_top,
        "totalHeight": range.total_height
    });
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))
}

/// Вычисляет видимый диапазон с фиксированной высотой строк.
///
/// Оптимизированная версия — не нужен JSON массив высот.
#[wasm_bindgen(js_name = vsComputeRangeFixed)]
pub fn vs_compute_range_fixed(
    total_items: u32,
    row_height: f64,
    scroll_top: f64,
    viewport_height: f64,
    overscan: u32,
) -> Result<String, JsValue> {
    let range = virtual_scroll::compute_visible_range_fixed(
        total_items, row_height, scroll_top, viewport_height, overscan,
    );
    let result = serde_json::json!({
        "start": range.start,
        "end": range.end,
        "offsetTop": range.offset_top,
        "totalHeight": range.total_height
    });
    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))
}

/// Находит индекс элемента по Y-позиции.
#[wasm_bindgen(js_name = vsFindItemAt)]
pub fn vs_find_item_at(heights_json: &str, y_position: f64) -> Result<u32, JsValue> {
    let heights: Vec<f64> = serde_json::from_str(heights_json)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))?;
    Ok(virtual_scroll::find_item_at_position(&heights, y_position))
}

/// Вычисляет Y-позицию для scroll-to-item.
#[wasm_bindgen(js_name = vsGetItemOffset)]
pub fn vs_get_item_offset(heights_json: &str, index: u32) -> Result<f64, JsValue> {
    let heights: Vec<f64> = serde_json::from_str(heights_json)
        .map_err(|e| JsValue::from_str(&format!("JSON: {}", e)))?;
    Ok(virtual_scroll::get_item_offset(&heights, index))
}
