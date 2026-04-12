// crypto.rs — Полное крипто-ядро Orbits P2P на Rust.
//
// Реализует:
//   - Scrypt KDF (замена scrypt-js npm)
//   - PBKDF2-SHA256
//   - SHA-256 (строки и бинарные данные)
//   - AES-256-GCM шифрование/расшифровка (с derive из пароля)
//   - HMAC-SHA256 (подпись/проверка/auth-токены)
//   - Timing-safe сравнение строк

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

// ─────────────────────────────────────────────────────────────
// SHA-256
// ─────────────────────────────────────────────────────────────

/// SHA-256 хеш строки → hex.
pub fn sha256_hex(input: &str) -> String {
    let hash = Sha256::digest(input.as_bytes());
    hex_encode(&hash)
}

/// SHA-256 хеш бинарных данных → hex.
pub fn sha256_hex_bytes(input: &[u8]) -> String {
    let hash = Sha256::digest(input);
    hex_encode(&hash)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

// ─────────────────────────────────────────────────────────────
// PBKDF2
// ─────────────────────────────────────────────────────────────

/// PBKDF2-HMAC-SHA256 key derivation.
///
/// Возвращает derived key bytes.
pub fn pbkdf2_derive(
    password: &[u8],
    salt: &[u8],
    iterations: u32,
    length_bytes: usize,
) -> Vec<u8> {
    let mut dk = vec![0u8; length_bytes];
    pbkdf2_hmac::<Sha256>(password, salt, iterations, &mut dk);
    dk
}

// ─────────────────────────────────────────────────────────────
// AES-256-GCM (password-derived key)
// ─────────────────────────────────────────────────────────────

/// Derive AES-256 key из пароля через PBKDF2 и шифрует JSON-объект.
///
/// Формат: ivB64:ctB64 (совместим с JS crypto.js).
pub fn aes_gcm_encrypt_with_key(key: &[u8; 32], plaintext: &[u8]) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES key error: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| format!("RNG error: {}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "AES-GCM encrypt failed".to_string())?;

    let iv_b64 = BASE64.encode(&nonce_bytes);
    let ct_b64 = BASE64.encode(&ct);
    Ok(format!("{}:{}", iv_b64, ct_b64))
}

/// Расшифровка AES-256-GCM (формат ivB64:ctB64).
pub fn aes_gcm_decrypt_with_key(key: &[u8; 32], enc_str: &str) -> Result<Vec<u8>, String> {
    let parts: Vec<&str> = enc_str.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err("Invalid format: expected ivB64:ctB64".into());
    }

    let iv = BASE64
        .decode(parts[0])
        .map_err(|e| format!("IV base64 decode: {}", e))?;
    let ct = BASE64
        .decode(parts[1])
        .map_err(|e| format!("CT base64 decode: {}", e))?;

    if iv.len() != 12 {
        return Err(format!("IV must be 12 bytes, got {}", iv.len()));
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("AES key error: {}", e))?;
    let nonce = Nonce::from_slice(&iv);

    cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "AES-GCM decrypt failed: wrong key or corrupted data".into())
}

// ─────────────────────────────────────────────────────────────
// Scrypt KDF
// ─────────────────────────────────────────────────────────────

/// Scrypt KDF: derive key из username+password.
///
/// Совместим с JS scryptKdf.js:
///   keyMaterial = encode("username:password:ORBITS_P2P")
///   dk = scrypt(keyMaterial, salt, N, r, p, dkLen)
pub fn scrypt_derive(
    key_material: &[u8],
    salt: &[u8],
    log_n: u8,
    r: u32,
    p: u32,
    dk_len: usize,
) -> Result<Vec<u8>, String> {
    let params = scrypt::Params::new(log_n, r, p, dk_len)
        .map_err(|e| format!("Scrypt params error: {}", e))?;

    let mut dk = vec![0u8; dk_len];
    scrypt::scrypt(key_material, salt, &params, &mut dk)
        .map_err(|e| format!("Scrypt error: {}", e))?;

    Ok(dk)
}

// ─────────────────────────────────────────────────────────────
// HMAC-SHA256
// ─────────────────────────────────────────────────────────────

/// HMAC-SHA256 подпись.
pub fn hmac_sign(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC key length should be valid");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// HMAC-SHA256 проверка.
pub fn hmac_verify(key: &[u8], signature: &[u8], data: &[u8]) -> bool {
    let mut mac = match HmacSha256::new_from_slice(key) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(data);
    mac.verify_slice(signature).is_ok()
}

// ─────────────────────────────────────────────────────────────
// Timing-safe compare
// ─────────────────────────────────────────────────────────────

/// Timing-safe сравнение двух строк.
pub fn timing_safe_equal(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ─────────────────────────────────────────────────────────────
// Тесты
// ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hex() {
        let hash = sha256_hex("hello");
        assert_eq!(
            hash,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_sha256_hex_bytes() {
        let hash = sha256_hex_bytes(b"hello");
        assert_eq!(hash, sha256_hex("hello"));
    }

    #[test]
    fn test_pbkdf2() {
        let dk = pbkdf2_derive(b"password", b"salt", 100000, 32);
        assert_eq!(dk.len(), 32);
        // Детерминистичность
        let dk2 = pbkdf2_derive(b"password", b"salt", 100000, 32);
        assert_eq!(dk, dk2);
    }

    #[test]
    fn test_aes_gcm_roundtrip() {
        let key = [42u8; 32];
        let plaintext = b"Hello, Orbits!";
        let encrypted = aes_gcm_encrypt_with_key(&key, plaintext).unwrap();
        let decrypted = aes_gcm_decrypt_with_key(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_aes_gcm_wrong_key() {
        let key = [42u8; 32];
        let wrong_key = [43u8; 32];
        let encrypted = aes_gcm_encrypt_with_key(&key, b"secret").unwrap();
        assert!(aes_gcm_decrypt_with_key(&wrong_key, &encrypted).is_err());
    }

    #[test]
    fn test_scrypt_derive() {
        let dk = scrypt_derive(b"user:pass:ORBITS_P2P", b"random_salt", 14, 8, 1, 32).unwrap();
        assert_eq!(dk.len(), 32);
        // Детерминистичность
        let dk2 = scrypt_derive(b"user:pass:ORBITS_P2P", b"random_salt", 14, 8, 1, 32).unwrap();
        assert_eq!(dk, dk2);
    }

    #[test]
    fn test_hmac_sign_verify() {
        let key = b"secret_key";
        let data = b"some data to sign";
        let sig = hmac_sign(key, data);
        assert!(hmac_verify(key, &sig, data));
        // Неправильный ключ
        assert!(!hmac_verify(b"wrong_key", &sig, data));
        // Повреждённая подпись
        let mut bad_sig = sig.clone();
        bad_sig[0] ^= 0xFF;
        assert!(!hmac_verify(key, &bad_sig, data));
    }

    #[test]
    fn test_timing_safe_equal() {
        assert!(timing_safe_equal("abc", "abc"));
        assert!(!timing_safe_equal("abc", "abd"));
        assert!(!timing_safe_equal("abc", "ab"));
    }
}
