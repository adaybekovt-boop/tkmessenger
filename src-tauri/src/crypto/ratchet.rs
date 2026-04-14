// crypto/ratchet.rs — Double Ratchet (Signal Protocol), native version.
//
// Migrated from src-rust/src/ratchet.rs. Identical algorithm,
// but returns OrbitsError instead of JsValue.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};

use crate::errors::{OrbitsError, Result};

const MAX_SKIPPED: usize = 100;
const MAX_SKIP_PER_STEP: u32 = 64;
const ROOT_INFO: &[u8] = b"orbits-ratchet-rk-v2";
const CHAIN_INFO: &[u8] = b"orbits-ratchet-ck-v2";

// ─── Data structures ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkippedKey {
    pub dh_pub: Vec<u8>,
    pub n: u32,
    pub mk: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    pub dh_pub: Vec<u8>,
    pub n: u32,
    pub pn: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RatchetState {
    pub root_key: Vec<u8>,
    pub send_ck: Option<Vec<u8>>,
    pub recv_ck: Option<Vec<u8>>,
    pub dh_secret: Vec<u8>,
    pub dh_pub: Vec<u8>,
    pub remote_dh_pub: Option<Vec<u8>>,
    pub ns: u32,
    pub nr: u32,
    pub pn: u32,
    pub skipped: Vec<SkippedKey>,
}

// ─── KDF functions ──────────────────────────────────────────────

fn to_32(bytes: &[u8]) -> Result<[u8; 32]> {
    bytes.try_into().map_err(|_| OrbitsError::InvalidKeyLength {
        expected: 32,
        got: bytes.len(),
    })
}

fn kdf_rk(root_key: &[u8], dh_output: &[u8]) -> Result<([u8; 32], [u8; 32])> {
    let hk = Hkdf::<Sha256>::new(Some(root_key), dh_output);
    let mut okm = [0u8; 64];
    hk.expand(ROOT_INFO, &mut okm)
        .map_err(|e| OrbitsError::KdfError(format!("KDF_RK: {}", e)))?;
    let mut rk = [0u8; 32];
    let mut ck = [0u8; 32];
    rk.copy_from_slice(&okm[..32]);
    ck.copy_from_slice(&okm[32..64]);
    Ok((rk, ck))
}

fn kdf_ck(chain_key: &[u8]) -> Result<([u8; 32], [u8; 32])> {
    let hk = Hkdf::<Sha256>::new(Some(&[]), chain_key);
    let mut okm = [0u8; 64];
    hk.expand(CHAIN_INFO, &mut okm)
        .map_err(|e| OrbitsError::KdfError(format!("KDF_CK: {}", e)))?;
    let mut ck = [0u8; 32];
    let mut mk = [0u8; 32];
    ck.copy_from_slice(&okm[..32]);
    mk.copy_from_slice(&okm[32..64]);
    Ok((ck, mk))
}

// ─── X25519 DH ──────────────────────────────────────────────────

fn generate_dh_keypair() -> ([u8; 32], [u8; 32]) {
    let secret = StaticSecret::random_from_rng(rand::rngs::OsRng);
    let public = PublicKey::from(&secret);
    (secret.to_bytes(), public.to_bytes())
}

fn dh_shared(my_secret: &[u8; 32], remote_pub: &[u8; 32]) -> [u8; 32] {
    let secret = StaticSecret::from(*my_secret);
    let public = PublicKey::from(*remote_pub);
    *secret.diffie_hellman(&public).as_bytes()
}

// ─── AES-256-GCM with AAD ──────────────────────────────────────

fn aes_encrypt(mk: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    let cipher =
        Aes256Gcm::new_from_slice(mk).map_err(|_| OrbitsError::EncryptionFailed("cipher".into()))?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|_| OrbitsError::EncryptionFailed("rng".into()))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let payload = aes_gcm::aead::Payload { msg: plaintext, aad };
    let ct = cipher
        .encrypt(nonce, payload)
        .map_err(|_| OrbitsError::EncryptionFailed("AES-GCM".into()))?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn aes_decrypt(mk: &[u8; 32], encrypted: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    if encrypted.len() < 13 {
        return Err(OrbitsError::DecryptionFailed("too short".into()));
    }
    let (nonce_bytes, ct) = encrypted.split_at(12);
    let cipher =
        Aes256Gcm::new_from_slice(mk).map_err(|_| OrbitsError::DecryptionFailed("cipher".into()))?;
    let payload = aes_gcm::aead::Payload { msg: ct, aad };
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), payload)
        .map_err(|_| OrbitsError::DecryptionFailed("AES-GCM verify failed".into()))
}

// ─── Header serialization ───────────────────────────────────────

fn encode_header(header: &Header) -> Result<Vec<u8>> {
    serde_json::to_vec(header).map_err(|e| OrbitsError::SerdeError(e.to_string()))
}

fn decode_header(data: &[u8]) -> Result<Header> {
    serde_json::from_slice(data).map_err(|e| OrbitsError::InvalidHeader(e.to_string()))
}

// ─── Skipped keys ───────────────────────────────────────────────

fn try_skipped_key(state: &mut RatchetState, header: &Header) -> Option<[u8; 32]> {
    let pos = state
        .skipped
        .iter()
        .position(|sk| sk.dh_pub == header.dh_pub && sk.n == header.n);
    if let Some(i) = pos {
        let sk = state.skipped.remove(i);
        if sk.mk.len() == 32 {
            let mut mk = [0u8; 32];
            mk.copy_from_slice(&sk.mk);
            Some(mk)
        } else {
            None
        }
    } else {
        None
    }
}

fn skip_recv_keys(state: &mut RatchetState, until: u32) -> Result<()> {
    let recv_ck = match &state.recv_ck {
        Some(ck) => ck.clone(),
        None => return Ok(()),
    };
    if until < state.nr {
        return Err(OrbitsError::PossibleReplay);
    }
    if until - state.nr > MAX_SKIP_PER_STEP {
        return Err(OrbitsError::TooManySkipped {
            limit: MAX_SKIP_PER_STEP,
        });
    }
    let remote_pub = state.remote_dh_pub.clone().unwrap_or_default();
    let mut ck = to_32(&recv_ck)?;
    while state.nr < until {
        let (new_ck, mk) = kdf_ck(&ck)?;
        state.skipped.push(SkippedKey {
            dh_pub: remote_pub.clone(),
            n: state.nr,
            mk: mk.to_vec(),
        });
        ck = new_ck;
        state.nr += 1;
        while state.skipped.len() > MAX_SKIPPED {
            state.skipped.remove(0);
        }
    }
    state.recv_ck = Some(ck.to_vec());
    Ok(())
}

// ─── DH ratchet step ────────────────────────────────────────────

fn dh_ratchet_step(state: &mut RatchetState, new_remote: &[u8; 32]) -> Result<()> {
    let prev_pn = state.ns;
    let my_secret = to_32(&state.dh_secret)?;
    let dh_recv = dh_shared(&my_secret, new_remote);
    let rk = to_32(&state.root_key)?;
    let (new_rk_a, recv_ck) = kdf_rk(&rk, &dh_recv)?;
    let (new_secret, new_pub) = generate_dh_keypair();
    let dh_send = dh_shared(&new_secret, new_remote);
    let (new_rk_b, send_ck) = kdf_rk(&new_rk_a, &dh_send)?;

    state.root_key = new_rk_b.to_vec();
    state.recv_ck = Some(recv_ck.to_vec());
    state.send_ck = Some(send_ck.to_vec());
    state.dh_secret = new_secret.to_vec();
    state.dh_pub = new_pub.to_vec();
    state.remote_dh_pub = Some(new_remote.to_vec());
    state.pn = prev_pn;
    state.ns = 0;
    state.nr = 0;
    Ok(())
}

// ─── Public API ─────────────────────────────────────────────────

pub fn ratchet_init_alice(shared_secret: &[u8], remote_dh_pub: &[u8]) -> Result<RatchetState> {
    let ss = to_32(shared_secret)?;
    let remote = to_32(remote_dh_pub)?;
    let (dh_secret, dh_pub) = generate_dh_keypair();
    let dh_output = dh_shared(&dh_secret, &remote);
    let (root_key, send_ck) = kdf_rk(&ss, &dh_output)?;
    Ok(RatchetState {
        root_key: root_key.to_vec(),
        send_ck: Some(send_ck.to_vec()),
        recv_ck: None,
        dh_secret: dh_secret.to_vec(),
        dh_pub: dh_pub.to_vec(),
        remote_dh_pub: Some(remote.to_vec()),
        ns: 0,
        nr: 0,
        pn: 0,
        skipped: Vec::new(),
    })
}

pub fn ratchet_init_bob(
    shared_secret: &[u8],
    dh_secret_bytes: &[u8],
    dh_pub_bytes: &[u8],
) -> Result<RatchetState> {
    let ss = to_32(shared_secret)?;
    let secret = to_32(dh_secret_bytes)?;
    let public = to_32(dh_pub_bytes)?;
    Ok(RatchetState {
        root_key: ss.to_vec(),
        send_ck: None,
        recv_ck: None,
        dh_secret: secret.to_vec(),
        dh_pub: public.to_vec(),
        remote_dh_pub: None,
        ns: 0,
        nr: 0,
        pn: 0,
        skipped: Vec::new(),
    })
}

pub fn ratchet_encrypt(state: &mut RatchetState, plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    let send_ck = state.send_ck.as_ref().ok_or(OrbitsError::NoSendChainKey)?;
    let ck_arr = to_32(send_ck)?;
    let (new_ck, mk) = kdf_ck(&ck_arr)?;
    let header = Header {
        dh_pub: state.dh_pub.clone(),
        n: state.ns,
        pn: state.pn,
    };
    let header_bytes = encode_header(&header)?;
    let ciphertext = aes_encrypt(&mk, plaintext, &header_bytes)?;
    state.send_ck = Some(new_ck.to_vec());
    state.ns += 1;
    Ok((header_bytes, ciphertext))
}

pub fn ratchet_decrypt(
    state: &mut RatchetState,
    header_bytes: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>> {
    let header = decode_header(header_bytes)?;

    // 1. Check skipped keys
    if let Some(mk) = try_skipped_key(state, &header) {
        return aes_decrypt(&mk, ciphertext, header_bytes);
    }

    // 2. DH ratchet step if remote pub changed
    let remote_changed = match &state.remote_dh_pub {
        Some(existing) => *existing != header.dh_pub,
        None => true,
    };
    if remote_changed {
        let new_remote = to_32(&header.dh_pub)?;
        if state.recv_ck.is_some() {
            skip_recv_keys(state, header.pn)?;
        }
        dh_ratchet_step(state, &new_remote)?;
    }

    // 3. Skip keys in current recv chain
    skip_recv_keys(state, header.n)?;

    // 4. Derive message key
    let recv_ck = state
        .recv_ck
        .as_ref()
        .ok_or_else(|| OrbitsError::DecryptionFailed("no recv chain".into()))?;
    let ck_arr = to_32(recv_ck)?;
    let (new_ck, mk) = kdf_ck(&ck_arr)?;
    state.recv_ck = Some(new_ck.to_vec());
    state.nr += 1;

    aes_decrypt(&mk, ciphertext, header_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_shared_secret() -> [u8; 32] {
        let mut ss = [0u8; 32];
        getrandom::getrandom(&mut ss).unwrap();
        ss
    }

    #[test]
    fn test_alice_bob_basic() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();
        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        let (h, ct) = ratchet_encrypt(&mut alice, b"Hello, Bob!").unwrap();
        let pt = ratchet_decrypt(&mut bob, &h, &ct).unwrap();
        assert_eq!(pt, b"Hello, Bob!");

        let (h2, ct2) = ratchet_encrypt(&mut bob, b"Hello, Alice!").unwrap();
        let pt2 = ratchet_decrypt(&mut alice, &h2, &ct2).unwrap();
        assert_eq!(pt2, b"Hello, Alice!");
    }

    #[test]
    fn test_out_of_order() {
        let (bob_secret, bob_pub) = generate_dh_keypair();
        let shared = test_shared_secret();
        let mut alice = ratchet_init_alice(&shared, &bob_pub).unwrap();
        let mut bob = ratchet_init_bob(&shared, &bob_secret, &bob_pub).unwrap();

        let (h0, ct0) = ratchet_encrypt(&mut alice, b"msg0").unwrap();
        let (h1, ct1) = ratchet_encrypt(&mut alice, b"msg1").unwrap();
        let (h2, ct2) = ratchet_encrypt(&mut alice, b"msg2").unwrap();

        // Receive out of order: 2, 0, 1
        assert_eq!(ratchet_decrypt(&mut bob, &h2, &ct2).unwrap(), b"msg2");
        assert_eq!(ratchet_decrypt(&mut bob, &h0, &ct0).unwrap(), b"msg0");
        assert_eq!(ratchet_decrypt(&mut bob, &h1, &ct1).unwrap(), b"msg1");
    }
}
