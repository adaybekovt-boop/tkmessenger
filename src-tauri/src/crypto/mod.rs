// crypto/mod.rs — Native crypto core for Orbits (migrated from WASM).
//
// All wasm_bindgen annotations removed. Functions return Result<T, OrbitsError>
// instead of Result<T, JsValue>.

pub mod ratchet;

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};

use crate::errors::{OrbitsError, Result};

type HmacSha256 = Hmac<Sha256>;

// ─── Key Generation ─────────────────────────────────────────────

/// Generate an Ed25519 signing keypair.
/// Returns (private_key_b64, public_key_b64).
pub fn generate_ed25519_keypair() -> (String, String) {
    let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let verifying_key: VerifyingKey = (&signing_key).into();
    (
        BASE64.encode(signing_key.to_bytes()),
        BASE64.encode(verifying_key.to_bytes()),
    )
}

/// Generate an X25519 DH keypair for Double Ratchet.
/// Returns (secret_b64, public_b64).
pub fn generate_dh_keypair() -> (String, String) {
    let secret = x25519_dalek::StaticSecret::random_from_rng(rand::rngs::OsRng);
    let public = x25519_dalek::PublicKey::from(&secret);
    (
        BASE64.encode(secret.to_bytes()),
        BASE64.encode(public.to_bytes()),
    )
}

// ─── SHA-256 ────────────────────────────────────────────────────

pub fn sha256_hex(input: &str) -> String {
    hex_encode(&Sha256::digest(input.as_bytes()))
}

pub fn sha256_hex_bytes(input: &[u8]) -> String {
    hex_encode(&Sha256::digest(input))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02x}", b);
    }
    s
}

// ─── AES-256-GCM ────────────────────────────────────────────────

/// Derive a symmetric key via HKDF-SHA256.
pub fn derive_symmetric_key(shared_secret: &[u8], info: &str) -> Result<[u8; 32]> {
    let hk = hkdf::Hkdf::<Sha256>::new(None, shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm)
        .map_err(|e| OrbitsError::KdfError(e.to_string()))?;
    Ok(okm)
}

/// Encrypt plaintext with AES-256-GCM. Returns nonce(12) || ciphertext.
pub fn aes_gcm_encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| OrbitsError::EncryptionFailed(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|e| OrbitsError::EncryptionFailed(e.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| OrbitsError::EncryptionFailed("AES-GCM encrypt failed".into()))?;

    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt AES-256-GCM. Input: nonce(12) || ciphertext.
pub fn aes_gcm_decrypt(key: &[u8; 32], encrypted: &[u8]) -> Result<Vec<u8>> {
    if encrypted.len() < 13 {
        return Err(OrbitsError::DecryptionFailed("data too short".into()));
    }
    let (nonce_bytes, ct) = encrypted.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| OrbitsError::DecryptionFailed(e.to_string()))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ct)
        .map_err(|_| OrbitsError::DecryptionFailed("wrong key or corrupted data".into()))
}

/// AES-256-GCM encrypt returning "ivB64:ctB64" format (compatible with JS).
pub fn aes_gcm_encrypt_portable(key: &[u8; 32], plaintext: &[u8]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| OrbitsError::EncryptionFailed(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|e| OrbitsError::EncryptionFailed(e.to_string()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| OrbitsError::EncryptionFailed("AES-GCM encrypt failed".into()))?;

    Ok(format!("{}:{}", BASE64.encode(nonce_bytes), BASE64.encode(ct)))
}

/// AES-256-GCM decrypt from "ivB64:ctB64" format.
pub fn aes_gcm_decrypt_portable(key: &[u8; 32], enc_str: &str) -> Result<Vec<u8>> {
    let parts: Vec<&str> = enc_str.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err(OrbitsError::DecryptionFailed("invalid format".into()));
    }
    let iv = BASE64
        .decode(parts[0])
        .map_err(|e| OrbitsError::DecryptionFailed(e.to_string()))?;
    let ct = BASE64
        .decode(parts[1])
        .map_err(|e| OrbitsError::DecryptionFailed(e.to_string()))?;
    if iv.len() != 12 {
        return Err(OrbitsError::DecryptionFailed("IV must be 12 bytes".into()));
    }
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| OrbitsError::DecryptionFailed(e.to_string()))?;
    cipher
        .decrypt(Nonce::from_slice(&iv), ct.as_ref())
        .map_err(|_| OrbitsError::DecryptionFailed("wrong key or corrupted data".into()))
}

// ─── Scrypt ─────────────────────────────────────────────────────

pub fn scrypt_derive(
    key_material: &[u8],
    salt: &[u8],
    log_n: u8,
    r: u32,
    p: u32,
    dk_len: usize,
) -> Result<Vec<u8>> {
    let params = scrypt::Params::new(log_n, r, p, dk_len)
        .map_err(|e| OrbitsError::KdfError(format!("scrypt params: {}", e)))?;
    let mut dk = vec![0u8; dk_len];
    scrypt::scrypt(key_material, salt, &params, &mut dk)
        .map_err(|e| OrbitsError::KdfError(format!("scrypt: {}", e)))?;
    Ok(dk)
}

// ─── PBKDF2 ─────────────────────────────────────────────────────

pub fn pbkdf2_derive(password: &[u8], salt: &[u8], iterations: u32, length: usize) -> Vec<u8> {
    let mut dk = vec![0u8; length];
    pbkdf2_hmac::<Sha256>(password, salt, iterations, &mut dk);
    dk
}

// ─── HMAC-SHA256 ────────────────────────────────────────────────

pub fn hmac_sign(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key)
        .expect("HMAC key length should be valid");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

pub fn hmac_verify(key: &[u8], signature: &[u8], data: &[u8]) -> bool {
    let mut mac = match <HmacSha256 as Mac>::new_from_slice(key) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(data);
    mac.verify_slice(signature).is_ok()
}

// ─── Ed25519 Sign/Verify ────────────────────────────────────────

pub fn sign_message(private_key_bytes: &[u8; 32], message: &[u8]) -> Vec<u8> {
    let signing_key = SigningKey::from_bytes(private_key_bytes);
    signing_key.sign(message).to_bytes().to_vec()
}

pub fn verify_signature(
    public_key_bytes: &[u8; 32],
    message: &[u8],
    signature_bytes: &[u8; 64],
) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_bytes(public_key_bytes) else {
        return false;
    };
    let signature = ed25519_dalek::Signature::from_bytes(signature_bytes);
    verifying_key.verify(message, &signature).is_ok()
}

// ─── Timing-safe compare ────────────────────────────────────────

pub fn timing_safe_equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ─── Helpers ────────────────────────────────────────────────────

pub fn to_32(bytes: &[u8]) -> Result<[u8; 32]> {
    bytes.try_into().map_err(|_| OrbitsError::InvalidKeyLength {
        expected: 32,
        got: bytes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aes_roundtrip() {
        let key = [42u8; 32];
        let pt = b"Hello, Orbits!";
        let ct = aes_gcm_encrypt(&key, pt).unwrap();
        let decrypted = aes_gcm_decrypt(&key, &ct).unwrap();
        assert_eq!(decrypted, pt);
    }

    #[test]
    fn test_aes_portable_roundtrip() {
        let key = [42u8; 32];
        let enc = aes_gcm_encrypt_portable(&key, b"secret").unwrap();
        let dec = aes_gcm_decrypt_portable(&key, &enc).unwrap();
        assert_eq!(dec, b"secret");
    }

    #[test]
    fn test_hmac_roundtrip() {
        let key = b"secret";
        let data = b"payload";
        let sig = hmac_sign(key, data);
        assert!(hmac_verify(key, &sig, data));
        assert!(!hmac_verify(b"wrong", &sig, data));
    }
}
