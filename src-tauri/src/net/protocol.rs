// net/protocol.rs — Wire protocol for Orbits P2P messaging.
//
// Defines request/response message types and a length-prefixed JSON
// codec for use with libp2p's request-response behaviour.

use futures::{AsyncReadExt, AsyncWriteExt};
use libp2p::StreamProtocol;
use serde::{Deserialize, Serialize};
use std::io;

/// Maximum wire message size: 16 MiB (file chunks + overhead).
const MAX_MSG_BYTES: usize = 16 * 1024 * 1024;

// ─── Message types ──────────────────────────────────────────────

/// All request types in the Orbits protocol.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OrbitsRequest {
    /// Encrypted chat message (Double Ratchet envelope).
    Chat {
        header: Vec<u8>,
        ciphertext: Vec<u8>,
    },
    /// Key exchange for ratchet initialization (X3DH-like handshake).
    KeyExchange {
        identity_pub: Vec<u8>,
        ephemeral_pub: Vec<u8>,
        prekey_sig: Vec<u8>,
    },
    /// Delivery receipt.
    Ack {
        msg_id: String,
        status: String, // "delivered" | "read"
    },
    /// File transfer offer.
    FileOffer {
        transfer_id: String,
        file_name: String,
        file_size: u64,
        file_hash: String,
        chunk_size: u32,
    },
    /// File data chunk.
    FileChunk {
        transfer_id: String,
        index: u32,
        data: Vec<u8>,
    },
    /// File transfer complete signal.
    FileComplete { transfer_id: String },
    /// Profile update broadcast.
    ProfileUpdate {
        display_name: Option<String>,
        bio: Option<String>,
        avatar_b64: Option<String>,
    },
    /// Typing indicator.
    Typing { is_typing: bool },
}

/// Response to an Orbits request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OrbitsResponse {
    /// Generic acknowledgment.
    Ok,
    /// File transfer accepted by receiver.
    FileAccepted { transfer_id: String },
    /// File transfer rejected by receiver.
    FileRejected {
        transfer_id: String,
        reason: String,
    },
    /// Error response.
    Error { code: String, message: String },
}

// ─── Codec ──────────────────────────────────────────────────────

/// Length-prefixed JSON codec for the Orbits wire protocol.
///
/// Wire format: `[4-byte BE length][JSON payload]`
#[derive(Debug, Clone, Default)]
pub struct OrbitsCodec;

impl libp2p::request_response::Codec for OrbitsCodec {
    type Protocol = StreamProtocol;
    type Request = OrbitsRequest;
    type Response = OrbitsResponse;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: futures::AsyncRead + Unpin + Send,
    {
        let buf = read_length_prefixed(io, MAX_MSG_BYTES).await?;
        serde_json::from_slice(&buf)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: futures::AsyncRead + Unpin + Send,
    {
        let buf = read_length_prefixed(io, MAX_MSG_BYTES).await?;
        serde_json::from_slice(&buf)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    async fn write_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
        req: Self::Request,
    ) -> io::Result<()>
    where
        T: futures::AsyncWrite + Unpin + Send,
    {
        let buf = serde_json::to_vec(&req)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, &buf).await
    }

    async fn write_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
        res: Self::Response,
    ) -> io::Result<()>
    where
        T: futures::AsyncWrite + Unpin + Send,
    {
        let buf = serde_json::to_vec(&res)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, &buf).await
    }
}

// ─── Wire helpers ───────────────────────────────────────────────

/// Read a 4-byte big-endian length prefix, then that many bytes.
async fn read_length_prefixed<T: futures::AsyncRead + Unpin>(
    io: &mut T,
    max_bytes: usize,
) -> io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > max_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("message too large: {len} > {max_bytes}"),
        ));
    }
    let mut buf = vec![0u8; len];
    io.read_exact(&mut buf).await?;
    Ok(buf)
}

/// Write a 4-byte big-endian length prefix followed by the payload.
async fn write_length_prefixed<T: futures::AsyncWrite + Unpin>(
    io: &mut T,
    data: &[u8],
) -> io::Result<()> {
    let len = (data.len() as u32).to_be_bytes();
    io.write_all(&len).await?;
    io.write_all(data).await?;
    io.flush().await
}
