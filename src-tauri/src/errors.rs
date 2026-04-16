// errors.rs — Unified error types for the entire Orbits backend.
//
// All modules return OrbitsError variants. The bridge layer
// converts them into serializable JSON for the React frontend.

use serde::Serialize;

/// Top-level error enum. Every subsystem has its own variant so
/// the bridge can pattern-match and return meaningful codes.
#[derive(Debug, thiserror::Error)]
pub enum OrbitsError {
    // ── Crypto ──────────────────────────────────────────────
    #[error("Invalid key length: expected {expected}, got {got}")]
    InvalidKeyLength { expected: usize, got: usize },

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("KDF error: {0}")]
    KdfError(String),

    // ── Ratchet ─────────────────────────────────────────────
    #[error("No send chain key — DH ratchet step required")]
    NoSendChainKey,

    #[error("Too many skipped messages (limit: {limit})")]
    TooManySkipped { limit: u32 },

    #[error("Possible replay attack detected")]
    PossibleReplay,

    #[error("Invalid message header: {0}")]
    InvalidHeader(String),

    // ── Network ─────────────────────────────────────────────
    #[error("Peer not found: {0}")]
    PeerNotFound(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Transport error: {0}")]
    TransportError(String),

    #[error("Dial error: {0}")]
    DialError(String),

    #[error("Stream protocol error: {0}")]
    StreamError(String),

    // ── Storage ─────────────────────────────────────────────
    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Migration failed: {0}")]
    MigrationError(String),

    // ── File Transfer ───────────────────────────────────────
    #[error("Transfer aborted: {0}")]
    TransferAborted(String),

    #[error("Integrity check failed: expected {expected}, got {actual}")]
    IntegrityError { expected: String, actual: String },

    #[error("File I/O error: {0}")]
    FileIoError(String),

    // ── General ─────────────────────────────────────────────
    #[error("Serialization error: {0}")]
    SerdeError(String),

    #[error("Channel closed unexpectedly")]
    ChannelClosed,

    #[error("{0}")]
    Internal(String),
}

/// Serializable error payload sent to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

impl OrbitsError {
    /// Convert to a frontend-friendly payload.
    pub fn to_payload(&self) -> ErrorPayload {
        let code = match self {
            Self::InvalidKeyLength { .. } => "INVALID_KEY",
            Self::EncryptionFailed(_) => "ENCRYPT_FAIL",
            Self::DecryptionFailed(_) => "DECRYPT_FAIL",
            Self::KdfError(_) => "KDF_FAIL",
            Self::NoSendChainKey => "NO_SEND_CHAIN",
            Self::TooManySkipped { .. } => "TOO_MANY_SKIPPED",
            Self::PossibleReplay => "REPLAY",
            Self::InvalidHeader(_) => "BAD_HEADER",
            Self::PeerNotFound(_) => "PEER_NOT_FOUND",
            Self::ConnectionFailed(_) => "CONN_FAIL",
            Self::TransportError(_) => "TRANSPORT_ERR",
            Self::DialError(_) => "DIAL_ERR",
            Self::StreamError(_) => "STREAM_ERR",
            Self::DatabaseError(_) => "DB_ERR",
            Self::MigrationError(_) => "MIGRATION_ERR",
            Self::TransferAborted(_) => "TRANSFER_ABORTED",
            Self::IntegrityError { .. } => "INTEGRITY_ERR",
            Self::FileIoError(_) => "FILE_IO_ERR",
            Self::SerdeError(_) => "SERDE_ERR",
            Self::ChannelClosed => "CHAN_CLOSED",
            Self::Internal(_) => "INTERNAL",
        };
        ErrorPayload {
            code,
            message: self.to_string(),
        }
    }
}

// Implement Into<tauri::InvokeError> so we can use ? in commands.
impl From<OrbitsError> for tauri::Error {
    fn from(e: OrbitsError) -> Self {
        tauri::Error::Anyhow(e.into())
    }
}

impl From<rusqlite::Error> for OrbitsError {
    fn from(e: rusqlite::Error) -> Self {
        Self::DatabaseError(e.to_string())
    }
}

impl From<serde_json::Error> for OrbitsError {
    fn from(e: serde_json::Error) -> Self {
        Self::SerdeError(e.to_string())
    }
}

impl From<std::io::Error> for OrbitsError {
    fn from(e: std::io::Error) -> Self {
        Self::FileIoError(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, OrbitsError>;
