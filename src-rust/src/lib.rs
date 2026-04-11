// Криптографическое ядро Orbits P2P
// Генерация ключей Ed25519, шифрование/дешифрование AES-256-GCM
// Заготовка под Double Ratchet протокол

use wasm_bindgen::prelude::*;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use ed25519_dalek::{SigningKey, VerifyingKey};
use hkdf::Hkdf;
use sha2::Sha256;
use rand::rngs::OsRng;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

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
