// bridge/events.rs — Tauri event definitions pushed to the React frontend.
//
// Each event type maps to a Tauri event name that the frontend
// subscribes to via `listen("event-name", callback)`.

use libp2p::PeerId;
use serde::Serialize;

// ─── Event payloads ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessageEvent {
    pub from_peer_id: String,
    pub msg_id: String,
    pub text: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AckEvent {
    pub from_peer_id: String,
    pub msg_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PeerStatusEvent {
    pub peer_id: String,
    pub status: String, // "online" | "offline"
}

#[derive(Debug, Clone, Serialize)]
pub struct TypingEvent {
    pub peer_id: String,
    pub is_typing: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileUpdateEvent {
    pub peer_id: String,
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_b64: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeyExchangeEvent {
    pub from_peer_id: String,
    pub identity_pub: String,   // base64
    pub ephemeral_pub: String,  // base64
}

#[derive(Debug, Clone, Serialize)]
pub struct FileOfferEvent {
    pub from_peer_id: String,
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileProgressEvent {
    pub transfer_id: String,
    pub chunks_done: u32,
    pub total_chunks: u32,
    pub direction: String, // "sending" | "receiving"
}

#[derive(Debug, Clone, Serialize)]
pub struct FileCompleteEvent {
    pub transfer_id: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileErrorEvent {
    pub transfer_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NetworkInfoEvent {
    pub local_peer_id: String,
    pub listening_addrs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorEvent {
    pub code: String,
    pub message: String,
}

// ─── Event names ────────────────────────────────────────────────

pub mod names {
    pub const CHAT_MESSAGE: &str = "orbits://chat-message";
    pub const ACK: &str = "orbits://ack";
    pub const PEER_STATUS: &str = "orbits://peer-status";
    pub const TYPING: &str = "orbits://typing";
    pub const PROFILE_UPDATE: &str = "orbits://profile-update";
    pub const KEY_EXCHANGE: &str = "orbits://key-exchange";
    pub const FILE_OFFER: &str = "orbits://file-offer";
    pub const FILE_PROGRESS: &str = "orbits://file-progress";
    pub const FILE_COMPLETE: &str = "orbits://file-complete";
    pub const FILE_ERROR: &str = "orbits://file-error";
    pub const NETWORK_INFO: &str = "orbits://network-info";
    pub const ERROR: &str = "orbits://error";
}
