// bridge/commands.rs — Tauri IPC commands exposed to the React frontend.
//
// Each `#[tauri::command]` function is callable from JS via
// `invoke("command_name", { args })`. All commands return
// Result<T, String> so errors are serializable.

use std::path::PathBuf;
use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use libp2p::{Multiaddr, PeerId};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tracing::{error, info};

use crate::bridge::events::{self, names};
use crate::crypto;
use crate::db::{Database, StoredContact, StoredIdentity, StoredMessage};
use crate::net::NetworkHandle;
use crate::net::protocol::OrbitsRequest;
use crate::services::{DropService, RatchetService};

// ─── Shared application state ───────────────────────────────────

/// Injected into all commands via Tauri's state management.
pub struct AppState {
    pub db: Database,
    pub net: NetworkHandle,
    pub ratchet: Arc<RatchetService>,
    pub drop: Arc<DropService>,
}

// ─── Helper ─────────────────────────────────────────────────────

fn err_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn parse_peer_id(s: &str) -> Result<PeerId, String> {
    s.parse::<PeerId>().map_err(err_string)
}

// ─── Identity commands ──────────────────────────────────────────

#[derive(Serialize)]
pub struct IdentityInfo {
    pub peer_id: String,
    pub verifying_key_b64: String,
    pub display_name: String,
    pub bio: String,
    pub avatar_b64: Option<String>,
}

/// Get or create the local identity.
#[tauri::command]
pub async fn get_identity(state: State<'_, AppState>) -> Result<IdentityInfo, String> {
    let db = state.db.clone();
    let existing = tokio::task::spawn_blocking(move || db.load_identity())
        .await
        .map_err(err_string)?
        .map_err(err_string)?;

    if let Some(id) = existing {
        return Ok(IdentityInfo {
            peer_id: id.peer_id,
            verifying_key_b64: id.verifying_key_b64,
            display_name: id.display_name,
            bio: id.bio,
            avatar_b64: id.avatar_b64,
        });
    }

    // First launch — generate keypair and save.
    let (sk_b64, vk_b64) = crypto::generate_ed25519_keypair();
    let peer_id = state.net.local_peer_id().to_string();

    let identity = StoredIdentity {
        peer_id: peer_id.clone(),
        signing_key_b64: sk_b64,
        verifying_key_b64: vk_b64.clone(),
        display_name: String::new(),
        bio: String::new(),
        avatar_b64: None,
        created_at: chrono::Utc::now().timestamp_millis(),
    };

    let db = state.db.clone();
    let id2 = identity.clone();
    tokio::task::spawn_blocking(move || db.save_identity(&id2))
        .await
        .map_err(err_string)?
        .map_err(err_string)?;

    Ok(IdentityInfo {
        peer_id,
        verifying_key_b64: vk_b64,
        display_name: identity.display_name,
        bio: identity.bio,
        avatar_b64: None,
    })
}

/// Update display name, bio, and/or avatar.
#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    display_name: Option<String>,
    bio: Option<String>,
    avatar_b64: Option<String>,
) -> Result<(), String> {
    let db = state.db.clone();
    let mut identity = tokio::task::spawn_blocking(move || db.load_identity())
        .await
        .map_err(err_string)?
        .map_err(err_string)?
        .ok_or("No identity found")?;

    if let Some(name) = display_name {
        identity.display_name = name;
    }
    if let Some(b) = bio {
        identity.bio = b;
    }
    if let Some(a) = avatar_b64 {
        identity.avatar_b64 = Some(a);
    }

    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.save_identity(&identity))
        .await
        .map_err(err_string)?
        .map_err(err_string)?;

    Ok(())
}

// ─── Contact commands ───────────────────────────────────────────

#[tauri::command]
pub async fn get_contacts(state: State<'_, AppState>) -> Result<Vec<StoredContact>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.get_contacts())
        .await
        .map_err(err_string)?
        .map_err(err_string)
}

#[tauri::command]
pub async fn block_contact(
    state: State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.block_contact(&peer_id))
        .await
        .map_err(err_string)?
        .map_err(err_string)
}

// ─── Message commands ───────────────────────────────────────────

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    peer_id: String,
    limit: u32,
    before_ts: i64,
) -> Result<Vec<StoredMessage>, String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.get_messages(&peer_id, limit, before_ts))
        .await
        .map_err(err_string)?
        .map_err(err_string)
}

/// Encrypt and send a chat message to a peer.
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    peer_id: String,
    text: String,
) -> Result<String, String> {
    let target = parse_peer_id(&peer_id)?;
    let msg_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    // Encrypt with Double Ratchet.
    let (header, ciphertext) = state
        .ratchet
        .encrypt(&peer_id, text.as_bytes())
        .await
        .map_err(err_string)?;

    // Send over libp2p.
    state
        .net
        .send_request(target, OrbitsRequest::Chat { header, ciphertext })
        .await
        .map_err(err_string)?;

    // Persist locally.
    let msg = StoredMessage {
        id: msg_id.clone(),
        peer_id: peer_id.clone(),
        from_id: state.net.local_peer_id().to_string(),
        text: Some(text),
        msg_type: "text".to_string(),
        metadata_json: None,
        reply_to_id: None,
        delivery: "sent".to_string(),
        created_at: now,
        edited_at: None,
        deleted: false,
    };

    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.insert_message(&msg))
        .await
        .map_err(err_string)?
        .map_err(err_string)?;

    Ok(msg_id)
}

/// Mark a message as read and send an ack to the peer.
#[tauri::command]
pub async fn mark_read(
    state: State<'_, AppState>,
    peer_id: String,
    msg_id: String,
) -> Result<(), String> {
    let target = parse_peer_id(&peer_id)?;

    state
        .net
        .send_request(
            target,
            OrbitsRequest::Ack {
                msg_id: msg_id.clone(),
                status: "read".to_string(),
            },
        )
        .await
        .map_err(err_string)?;

    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.update_delivery(&msg_id, "read"))
        .await
        .map_err(err_string)?
        .map_err(err_string)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || db.soft_delete_message(&msg_id))
        .await
        .map_err(err_string)?
        .map_err(err_string)
}

// ─── Network commands ───────────────────────────────────────────

#[tauri::command]
pub async fn dial_peer(
    state: State<'_, AppState>,
    peer_id: String,
    addr: String,
) -> Result<(), String> {
    let target = parse_peer_id(&peer_id)?;
    let multiaddr: Multiaddr = addr.parse().map_err(err_string)?;
    state.net.dial(target, multiaddr).await.map_err(err_string)
}

#[tauri::command]
pub async fn get_local_peer_id(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.net.local_peer_id().to_string())
}

#[tauri::command]
pub async fn send_typing(
    state: State<'_, AppState>,
    peer_id: String,
    is_typing: bool,
) -> Result<(), String> {
    let target = parse_peer_id(&peer_id)?;
    state
        .net
        .send_request(target, OrbitsRequest::Typing { is_typing })
        .await
        .map_err(err_string)
}

// ─── File transfer commands ─────────────────────────────────────

#[tauri::command]
pub async fn offer_file(
    state: State<'_, AppState>,
    peer_id: String,
    file_path: String,
) -> Result<String, String> {
    let target = parse_peer_id(&peer_id)?;
    state
        .drop
        .offer_file(target, &PathBuf::from(file_path))
        .await
        .map_err(err_string)
}

#[tauri::command]
pub async fn accept_file(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<(), String> {
    // The response channel is managed by the network event loop;
    // the bridge event handler calls this after user confirms.
    info!(%transfer_id, "File transfer accepted by user");
    Ok(())
}

#[tauri::command]
pub async fn reject_file(
    state: State<'_, AppState>,
    transfer_id: String,
) -> Result<(), String> {
    info!(%transfer_id, "File transfer rejected by user");
    Ok(())
}

// ─── Crypto utility commands ────────────────────────────────────

#[tauri::command]
pub fn generate_dh_keypair() -> (String, String) {
    crypto::generate_dh_keypair()
}

#[tauri::command]
pub fn sha256(input: String) -> String {
    crypto::sha256_hex(&input)
}
