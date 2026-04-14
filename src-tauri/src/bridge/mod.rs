// bridge/mod.rs — Tauri ↔ React IPC bridge.
//
// - commands: #[tauri::command] functions invoked from JS
// - events: typed payloads pushed to the frontend
// - event_loop: background task routing NetworkEvents → Tauri events

pub mod commands;
pub mod events;

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use libp2p::PeerId;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::db::{Database, StoredContact, StoredMessage};
use crate::net::protocol::{OrbitsRequest, OrbitsResponse};
use crate::net::{NetworkEvent, NetworkHandle};
use crate::services::{DropService, RatchetService};
use events::{names, *};

/// Spawn a background task that reads `NetworkEvent`s from the
/// network layer and forwards them as Tauri events to the frontend.
pub fn spawn_event_bridge(
    app: AppHandle,
    mut event_rx: mpsc::Receiver<NetworkEvent>,
    db: Database,
    ratchet: Arc<RatchetService>,
    drop_svc: Arc<DropService>,
    net: NetworkHandle,
) {
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            if let Err(e) =
                handle_network_event(&app, &event, &db, &ratchet, &drop_svc, &net).await
            {
                error!(?e, "Error handling network event");
                let _ = app.emit(
                    names::ERROR,
                    ErrorEvent {
                        code: "EVENT_HANDLER".into(),
                        message: e,
                    },
                );
            }
        }
        info!("Event bridge shutting down");
    });
}

async fn handle_network_event(
    app: &AppHandle,
    event: &NetworkEvent,
    db: &Database,
    ratchet: &RatchetService,
    drop_svc: &DropService,
    net: &NetworkHandle,
) -> Result<(), String> {
    match event {
        NetworkEvent::IncomingMessage { from, request } => {
            handle_message(app, from, request, db, ratchet, drop_svc).await
        }

        NetworkEvent::IncomingFileOffer {
            from,
            request,
            channel,
        } => {
            if let OrbitsRequest::FileOffer {
                transfer_id,
                file_name,
                file_size,
                file_hash,
                chunk_size,
            } = request
            {
                drop_svc.register_offer(
                    *from,
                    transfer_id,
                    file_name,
                    *file_size,
                    file_hash,
                    *chunk_size,
                );

                let _ = app.emit(
                    names::FILE_OFFER,
                    FileOfferEvent {
                        from_peer_id: from.to_string(),
                        transfer_id: transfer_id.clone(),
                        file_name: file_name.clone(),
                        file_size: *file_size,
                    },
                );
            }
            Ok(())
        }

        NetworkEvent::PeerConnected(peer_id) => {
            update_peer_status(app, db, peer_id, "online").await
        }

        NetworkEvent::PeerDisconnected(peer_id) => {
            update_peer_status(app, db, peer_id, "offline").await
        }

        NetworkEvent::ResponseReceived { response, .. } => {
            debug!(?response, "Response received");
            Ok(())
        }

        NetworkEvent::OutboundFailure {
            peer_id, error, ..
        } => {
            warn!(%peer_id, %error, "Outbound failure");
            let _ = app.emit(
                names::ERROR,
                ErrorEvent {
                    code: "SEND_FAIL".into(),
                    message: error.clone(),
                },
            );
            Ok(())
        }

        NetworkEvent::Listening(addr) => {
            info!(%addr, "Now listening");
            Ok(())
        }
    }
}

async fn handle_message(
    app: &AppHandle,
    from: &PeerId,
    request: &OrbitsRequest,
    db: &Database,
    ratchet: &RatchetService,
    drop_svc: &DropService,
) -> Result<(), String> {
    let from_str = from.to_string();

    match request {
        OrbitsRequest::Chat { header, ciphertext } => {
            let plaintext = ratchet
                .decrypt(&from_str, header, ciphertext)
                .await
                .map_err(|e| e.to_string())?;

            let text = String::from_utf8(plaintext).map_err(|e| e.to_string())?;
            let msg_id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().timestamp_millis();

            // Persist incoming message.
            let msg = StoredMessage {
                id: msg_id.clone(),
                peer_id: from_str.clone(),
                from_id: from_str.clone(),
                text: Some(text.clone()),
                msg_type: "text".to_string(),
                metadata_json: None,
                reply_to_id: None,
                delivery: "delivered".to_string(),
                created_at: now,
                edited_at: None,
                deleted: false,
            };

            let db2 = db.clone();
            tokio::task::spawn_blocking(move || db2.insert_message(&msg))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

            let _ = app.emit(
                names::CHAT_MESSAGE,
                ChatMessageEvent {
                    from_peer_id: from_str,
                    msg_id,
                    text,
                    timestamp: now,
                },
            );
        }

        OrbitsRequest::Ack { msg_id, status } => {
            let db2 = db.clone();
            let mid = msg_id.clone();
            let st = status.clone();
            tokio::task::spawn_blocking(move || db2.update_delivery(&mid, &st))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

            let _ = app.emit(
                names::ACK,
                AckEvent {
                    from_peer_id: from_str,
                    msg_id: msg_id.clone(),
                    status: status.clone(),
                },
            );
        }

        OrbitsRequest::Typing { is_typing } => {
            let _ = app.emit(
                names::TYPING,
                TypingEvent {
                    peer_id: from_str,
                    is_typing: *is_typing,
                },
            );
        }

        OrbitsRequest::ProfileUpdate {
            display_name,
            bio,
            avatar_b64,
        } => {
            let _ = app.emit(
                names::PROFILE_UPDATE,
                ProfileUpdateEvent {
                    peer_id: from_str.clone(),
                    display_name: display_name.clone(),
                    bio: bio.clone(),
                    avatar_b64: avatar_b64.clone(),
                },
            );

            // Update contact in DB.
            let contact = StoredContact {
                peer_id: from_str,
                display_name: display_name.clone(),
                bio: bio.clone(),
                avatar_b64: avatar_b64.clone(),
                status: "online".to_string(),
                last_seen_at: chrono::Utc::now().timestamp_millis(),
                blocked: false,
                created_at: chrono::Utc::now().timestamp_millis(),
            };
            let db2 = db.clone();
            tokio::task::spawn_blocking(move || db2.upsert_contact(&contact))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;
        }

        OrbitsRequest::KeyExchange {
            identity_pub,
            ephemeral_pub,
            ..
        } => {
            let _ = app.emit(
                names::KEY_EXCHANGE,
                KeyExchangeEvent {
                    from_peer_id: from_str,
                    identity_pub: BASE64.encode(identity_pub),
                    ephemeral_pub: BASE64.encode(ephemeral_pub),
                },
            );
        }

        OrbitsRequest::FileChunk {
            transfer_id,
            index,
            data,
        } => {
            if let Err(e) = drop_svc
                .receive_chunk(transfer_id, *index, data.clone())
                .await
            {
                warn!(%transfer_id, ?e, "Failed to process file chunk");
            }
        }

        OrbitsRequest::FileComplete { transfer_id } => {
            match drop_svc.finalize_receive(transfer_id).await {
                Ok(path) => {
                    let _ = app.emit(
                        names::FILE_COMPLETE,
                        FileCompleteEvent {
                            transfer_id: transfer_id.clone(),
                            path: Some(path.to_string_lossy().into_owned()),
                        },
                    );
                }
                Err(e) => {
                    let _ = app.emit(
                        names::FILE_ERROR,
                        FileErrorEvent {
                            transfer_id: transfer_id.clone(),
                            error: e.to_string(),
                        },
                    );
                }
            }
        }

        // FileOffer is handled by the IncomingFileOffer branch above.
        _ => {}
    }

    Ok(())
}

async fn update_peer_status(
    app: &AppHandle,
    db: &Database,
    peer_id: &PeerId,
    status: &str,
) -> Result<(), String> {
    let peer_str = peer_id.to_string();

    let _ = app.emit(
        names::PEER_STATUS,
        PeerStatusEvent {
            peer_id: peer_str.clone(),
            status: status.to_string(),
        },
    );

    // Update contact last_seen.
    let contact = StoredContact {
        peer_id: peer_str,
        display_name: None,
        bio: None,
        avatar_b64: None,
        status: status.to_string(),
        last_seen_at: chrono::Utc::now().timestamp_millis(),
        blocked: false,
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    let db2 = db.clone();
    tokio::task::spawn_blocking(move || db2.upsert_contact(&contact))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    Ok(())
}
