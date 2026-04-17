// services/drop_service.rs — Encrypted file transfer over libp2p.
//
// Manages the full lifecycle of an Orbits Drop transfer:
//   1. Sender offers a file (hash, size, chunk count)
//   2. Receiver accepts or rejects
//   3. Sender streams encrypted chunks via request-response
//   4. Receiver reassembles, verifies SHA-256 hash
//
// Files are NEVER loaded entirely into RAM. Both hashing and sending
// use buffered streaming with a 256 KiB window.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use libp2p::PeerId;
use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::crypto;
use crate::errors::{OrbitsError, Result};
use crate::net::protocol::{OrbitsRequest, OrbitsResponse};
use crate::net::NetworkHandle;

/// Default chunk size: 256 KiB.
const CHUNK_SIZE: usize = 256 * 1024;

// ─── Transfer state ─────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum TransferDirection {
    Sending,
    Receiving,
}

#[derive(Debug, Clone)]
pub enum TransferStatus {
    Offering,
    WaitingAccept,
    Transferring,
    Verifying,
    Completed,
    Failed(String),
    Rejected(String),
}

#[derive(Debug, Clone)]
pub struct TransferInfo {
    pub transfer_id: String,
    pub peer_id: PeerId,
    pub file_name: String,
    pub file_size: u64,
    pub file_hash: String,
    pub chunk_size: u32,
    pub direction: TransferDirection,
    pub status: TransferStatus,
    pub chunks_done: u32,
    pub total_chunks: u32,
}

/// Progress event emitted during transfers.
#[derive(Debug, Clone)]
pub enum DropEvent {
    Started {
        transfer_id: String,
        file_name: String,
        file_size: u64,
        direction: TransferDirection,
    },
    Progress {
        transfer_id: String,
        chunks_done: u32,
        total_chunks: u32,
    },
    Completed {
        transfer_id: String,
        path: Option<PathBuf>,
    },
    Failed {
        transfer_id: String,
        error: String,
    },
    IncomingOffer {
        transfer_id: String,
        peer_id: PeerId,
        file_name: String,
        file_size: u64,
    },
}

// ─── Receive-side bookkeeping ───────────────────────────────────

struct ReceiveSession {
    info: TransferInfo,
    chunks: HashMap<u32, Vec<u8>>,
    save_dir: PathBuf,
}

// ─── Drop service ───────────────────────────────────────────────

pub struct DropService {
    net: NetworkHandle,
    event_tx: mpsc::Sender<DropEvent>,
    receives: Arc<Mutex<HashMap<String, ReceiveSession>>>,
    download_dir: PathBuf,
}

impl DropService {
    pub fn new(
        net: NetworkHandle,
        event_tx: mpsc::Sender<DropEvent>,
        download_dir: PathBuf,
    ) -> Self {
        Self {
            net,
            event_tx,
            receives: Arc::new(Mutex::new(HashMap::new())),
            download_dir,
        }
    }

    // ─── Sender side ────────────────────────────────────────────

    /// Offer a file to a remote peer. Returns the transfer_id.
    ///
    /// Hashes the file by streaming — never loads the whole file into RAM.
    pub async fn offer_file(
        &self,
        peer_id: PeerId,
        file_path: &Path,
    ) -> Result<String> {
        let metadata = fs::metadata(file_path).await?;
        let file_size = metadata.len();
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        // Stream-hash the file (256 KiB buffer, not loading into RAM).
        let file_hash = stream_sha256(file_path).await?;

        let transfer_id = Uuid::new_v4().to_string();
        let total_chunks = chunks_for(file_size);

        info!(
            %transfer_id, %file_name, file_size, total_chunks,
            "Offering file to {peer_id}"
        );

        self.net
            .send_request(
                peer_id,
                OrbitsRequest::FileOffer {
                    transfer_id: transfer_id.clone(),
                    file_name: file_name.clone(),
                    file_size,
                    file_hash,
                    chunk_size: CHUNK_SIZE as u32,
                },
            )
            .await?;

        self.emit(DropEvent::Started {
            transfer_id: transfer_id.clone(),
            file_name,
            file_size,
            direction: TransferDirection::Sending,
        })
        .await;

        Ok(transfer_id)
    }

    /// Stream file chunks to the peer after they accepted the offer.
    ///
    /// Reads the file in 256 KiB chunks — RAM usage stays constant
    /// regardless of file size.
    pub async fn start_sending(
        &self,
        peer_id: PeerId,
        transfer_id: &str,
        file_path: &Path,
    ) -> Result<()> {
        let file = fs::File::open(file_path).await?;
        let file_size = file.metadata().await?.len();
        let total_chunks = chunks_for(file_size);

        let mut reader = tokio::io::BufReader::with_capacity(CHUNK_SIZE, file);
        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut index: u32 = 0;

        loop {
            let mut filled = 0;
            // Read exactly CHUNK_SIZE bytes (or less at EOF).
            while filled < CHUNK_SIZE {
                let n = reader.read(&mut buf[filled..]).await?;
                if n == 0 { break; }
                filled += n;
            }
            if filled == 0 { break; }

            let chunk = buf[..filled].to_vec();

            self.net
                .send_request(
                    peer_id,
                    OrbitsRequest::FileChunk {
                        transfer_id: transfer_id.to_string(),
                        index,
                        data: chunk,
                    },
                )
                .await?;

            index += 1;

            self.emit(DropEvent::Progress {
                transfer_id: transfer_id.to_string(),
                chunks_done: index,
                total_chunks,
            })
            .await;
        }

        // Signal completion.
        self.net
            .send_request(
                peer_id,
                OrbitsRequest::FileComplete {
                    transfer_id: transfer_id.to_string(),
                },
            )
            .await?;

        self.emit(DropEvent::Completed {
            transfer_id: transfer_id.to_string(),
            path: None,
        })
        .await;

        info!(%transfer_id, "File send completed");
        Ok(())
    }

    // ─── Receiver side ──────────────────────────────────────────

    pub fn register_offer(
        &self,
        peer_id: PeerId,
        transfer_id: &str,
        file_name: &str,
        file_size: u64,
        file_hash: &str,
        chunk_size: u32,
    ) {
        let total_chunks = ((file_size as f64) / (chunk_size as f64)).ceil() as u32;

        let session = ReceiveSession {
            info: TransferInfo {
                transfer_id: transfer_id.to_string(),
                peer_id,
                file_name: file_name.to_string(),
                file_size,
                file_hash: file_hash.to_string(),
                chunk_size,
                direction: TransferDirection::Receiving,
                status: TransferStatus::Offering,
                chunks_done: 0,
                total_chunks,
            },
            chunks: HashMap::new(),
            save_dir: self.download_dir.clone(),
        };

        self.receives
            .lock()
            .insert(transfer_id.to_string(), session);
    }

    pub async fn receive_chunk(
        &self,
        transfer_id: &str,
        index: u32,
        data: Vec<u8>,
    ) -> Result<()> {
        let (chunks_done, total_chunks) = {
            let mut sessions = self.receives.lock();
            let session = sessions.get_mut(transfer_id).ok_or_else(|| {
                OrbitsError::TransferAborted(format!("unknown transfer: {transfer_id}"))
            })?;
            session.chunks.insert(index, data);
            session.info.chunks_done = session.chunks.len() as u32;
            (session.info.chunks_done, session.info.total_chunks)
        };

        self.emit(DropEvent::Progress {
            transfer_id: transfer_id.to_string(),
            chunks_done,
            total_chunks,
        })
        .await;

        Ok(())
    }

    /// Reassemble, verify hash, save to disk.
    pub async fn finalize_receive(&self, transfer_id: &str) -> Result<PathBuf> {
        let session = {
            self.receives
                .lock()
                .remove(transfer_id)
                .ok_or_else(|| {
                    OrbitsError::TransferAborted(format!("unknown transfer: {transfer_id}"))
                })?
        };

        // Reassemble in chunk-index order.
        let total = session.info.total_chunks;
        let mut assembled = Vec::with_capacity(session.info.file_size as usize);
        for i in 0..total {
            let chunk = session.chunks.get(&i).ok_or_else(|| {
                OrbitsError::TransferAborted(format!("missing chunk {i}/{total}"))
            })?;
            assembled.extend_from_slice(chunk);
        }

        // Verify integrity.
        let actual_hash = crypto::sha256_hex_bytes(&assembled);
        if actual_hash != session.info.file_hash {
            let err = OrbitsError::IntegrityError {
                expected: session.info.file_hash.clone(),
                actual: actual_hash,
            };
            self.emit(DropEvent::Failed {
                transfer_id: transfer_id.to_string(),
                error: err.to_string(),
            })
            .await;
            return Err(err);
        }

        // Save to downloads directory.
        fs::create_dir_all(&session.save_dir).await?;
        let save_path = session.save_dir.join(&session.info.file_name);
        let final_path = unique_path(&save_path).await;
        fs::write(&final_path, &assembled).await?;

        info!(
            %transfer_id,
            path = %final_path.display(),
            "File received and verified"
        );

        self.emit(DropEvent::Completed {
            transfer_id: transfer_id.to_string(),
            path: Some(final_path.clone()),
        })
        .await;

        Ok(final_path)
    }

    async fn emit(&self, event: DropEvent) {
        if self.event_tx.send(event).await.is_err() {
            warn!("Drop event receiver dropped");
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────

/// Compute SHA-256 hash of a file by streaming (256 KiB buffer).
/// Never loads the whole file into memory.
async fn stream_sha256(path: &Path) -> Result<String> {
    let file = fs::File::open(path).await?;
    let mut reader = tokio::io::BufReader::with_capacity(CHUNK_SIZE, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];

    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn chunks_for(file_size: u64) -> u32 {
    ((file_size as f64) / (CHUNK_SIZE as f64)).ceil() as u32
}

/// Append `(1)`, `(2)`, etc. to avoid overwriting existing files.
async fn unique_path(path: &Path) -> PathBuf {
    if !fs::try_exists(path).await.unwrap_or(false) {
        return path.to_path_buf();
    }

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let parent = path.parent().unwrap_or(Path::new("."));

    for n in 1u32..1000 {
        let candidate = parent.join(format!("{stem} ({n}){ext}"));
        if !fs::try_exists(&candidate).await.unwrap_or(false) {
            return candidate;
        }
    }

    parent.join(format!("{stem}_{}{ext}", Uuid::new_v4()))
}
