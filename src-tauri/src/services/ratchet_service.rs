// services/ratchet_service.rs — Async wrapper around the Double Ratchet.
//
// Bridges the synchronous ratchet crypto with the async runtime:
//   - Encrypts/decrypts messages for a given peer
//   - Persists ratchet state to SQLite (encrypted at rest)
//   - Initializes new sessions from key exchange data
//
// All DB I/O is moved to spawn_blocking to avoid starving the
// tokio runtime.

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use parking_lot::Mutex;
use tracing::{debug, info, warn};

use crate::crypto;
use crate::crypto::ratchet::{self, RatchetState};
use crate::db::{Database, StoredRatchetSession};
use crate::errors::{OrbitsError, Result};

/// Manages Double Ratchet sessions for all peers.
///
/// Thread-safe — can be shared across tasks via `Arc<RatchetService>`.
pub struct RatchetService {
    db: Database,
    /// Key used to encrypt ratchet state at rest.
    vault_key: [u8; 32],
}

impl RatchetService {
    pub fn new(db: Database, vault_key: [u8; 32]) -> Self {
        Self { db, vault_key }
    }

    // ─── Session lifecycle ──────────────────────────────────────

    /// Initialize a ratchet session as Alice (initiator).
    ///
    /// Call this when WE start a conversation with a new peer whose
    /// X25519 public key we already know (from key exchange).
    pub async fn init_alice(
        &self,
        peer_id: &str,
        shared_secret: &[u8],
        remote_dh_pub: &[u8],
    ) -> Result<()> {
        let state = ratchet::ratchet_init_alice(shared_secret, remote_dh_pub)?;
        self.save_state(peer_id, &state).await?;
        info!(%peer_id, "Ratchet session initialized (Alice)");
        Ok(())
    }

    /// Initialize a ratchet session as Bob (responder).
    ///
    /// Call this when a peer contacts US for the first time with
    /// their key exchange message.
    pub async fn init_bob(
        &self,
        peer_id: &str,
        shared_secret: &[u8],
        our_dh_secret: &[u8],
        our_dh_pub: &[u8],
    ) -> Result<()> {
        let state = ratchet::ratchet_init_bob(shared_secret, our_dh_secret, our_dh_pub)?;
        self.save_state(peer_id, &state).await?;
        info!(%peer_id, "Ratchet session initialized (Bob)");
        Ok(())
    }

    /// Check whether a ratchet session exists for a peer.
    pub async fn has_session(&self, peer_id: &str) -> Result<bool> {
        let id = peer_id.to_string();
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || db.load_ratchet_session(&id))
            .await
            .map_err(|e| OrbitsError::Internal(format!("spawn_blocking: {e}")))?
            .map(|opt| opt.is_some())
    }

    /// Delete a ratchet session (e.g. on block or reset).
    pub async fn delete_session(&self, peer_id: &str) -> Result<()> {
        let id = peer_id.to_string();
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || db.delete_ratchet_session(&id))
            .await
            .map_err(|e| OrbitsError::Internal(format!("spawn_blocking: {e}")))?
    }

    // ─── Encrypt / Decrypt ──────────────────────────────────────

    /// Encrypt a plaintext message for the given peer.
    ///
    /// Returns `(header_bytes, ciphertext)` ready to send over the wire.
    pub async fn encrypt(
        &self,
        peer_id: &str,
        plaintext: &[u8],
    ) -> Result<(Vec<u8>, Vec<u8>)> {
        let mut state = self.load_state(peer_id).await?;
        let (header, ct) = ratchet::ratchet_encrypt(&mut state, plaintext)?;
        self.save_state(peer_id, &state).await?;
        debug!(%peer_id, ns = state.ns, "Message encrypted");
        Ok((header, ct))
    }

    /// Decrypt a message received from the given peer.
    pub async fn decrypt(
        &self,
        peer_id: &str,
        header_bytes: &[u8],
        ciphertext: &[u8],
    ) -> Result<Vec<u8>> {
        let mut state = self.load_state(peer_id).await?;
        let plaintext = ratchet::ratchet_decrypt(&mut state, header_bytes, ciphertext)?;
        self.save_state(peer_id, &state).await?;
        debug!(%peer_id, nr = state.nr, "Message decrypted");
        Ok(plaintext)
    }

    // ─── Persistence (encrypted at rest) ────────────────────────

    async fn load_state(&self, peer_id: &str) -> Result<RatchetState> {
        let id = peer_id.to_string();
        let db = self.db.clone();
        let session = tokio::task::spawn_blocking(move || db.load_ratchet_session(&id))
            .await
            .map_err(|e| OrbitsError::Internal(format!("spawn_blocking: {e}")))?
            .and_then(|opt| {
                opt.ok_or_else(|| {
                    OrbitsError::PeerNotFound(format!("no ratchet session for {peer_id}"))
                })
            })?;

        // Decrypt the stored JSON with our vault key.
        let decrypted =
            crypto::aes_gcm_decrypt_portable(&self.vault_key, &session.state_json_encrypted)?;
        let state: RatchetState = serde_json::from_slice(&decrypted)?;
        Ok(state)
    }

    async fn save_state(&self, peer_id: &str, state: &RatchetState) -> Result<()> {
        let json = serde_json::to_vec(state)?;
        let encrypted = crypto::aes_gcm_encrypt_portable(&self.vault_key, &json)?;

        let session = StoredRatchetSession {
            peer_id: peer_id.to_string(),
            state_json_encrypted: encrypted,
            updated_at: chrono::Utc::now().timestamp_millis(),
        };

        let db = self.db.clone();
        tokio::task::spawn_blocking(move || db.save_ratchet_session(&session))
            .await
            .map_err(|e| OrbitsError::Internal(format!("spawn_blocking: {e}")))?
    }
}
