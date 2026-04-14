// main.rs — Tauri application entry point for Orbits.
//
// Bootstraps the entire backend:
//   1. Initialize tracing (structured logging)
//   2. Open SQLite database
//   3. Derive vault key for ratchet state encryption
//   4. Start libp2p network (QUIC + TCP, Kademlia, mDNS, relay)
//   5. Wire up services (RatchetService, DropService)
//   6. Spawn the event bridge (network → Tauri → React)
//   7. Register Tauri IPC commands
//   8. Run the Tauri event loop

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::mpsc;
use tauri::Manager;
use tracing::info;
use tracing_subscriber::EnvFilter;

use orbits_titan::bridge::commands::{self, AppState};
use orbits_titan::bridge;
use orbits_titan::crypto;
use orbits_titan::db::Database;
use orbits_titan::net;
use orbits_titan::net::discovery::NetworkConfig;
use orbits_titan::services::{DropService, RatchetService};

fn main() {
    // ── Logging ─────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("orbits_titan=debug,libp2p=info")),
        )
        .init();

    info!("Orbits Titan starting");

    // ── Tauri app ───────────────────────────────────────────────
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve data directory.
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("orbits.db");
            info!(path = %db_path.display(), "Opening database");
            let db = Database::open(&db_path)
                .map_err(|e| anyhow::anyhow!("DB open failed: {e}"))?;

            // Derive a vault key from a device-bound secret.
            // In production, this should use OS keychain (keyring crate).
            // For now, derive from a fixed salt + machine-specific input.
            let vault_key = derive_vault_key(&data_dir);

            // Spawn the async runtime for networking.
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_backend(app_handle, db, vault_key).await {
                    tracing::error!(?e, "Backend startup failed");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_identity,
            commands::update_profile,
            commands::get_contacts,
            commands::block_contact,
            commands::get_messages,
            commands::send_message,
            commands::mark_read,
            commands::delete_message,
            commands::dial_peer,
            commands::get_local_peer_id,
            commands::send_typing,
            commands::offer_file,
            commands::accept_file,
            commands::reject_file,
            commands::generate_dh_keypair,
            commands::sha256,
            commands::check_legacy_migration,
            commands::import_legacy_identity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orbits");
}

/// Start the backend services: network, ratchet, drop, event bridge.
async fn start_backend(
    app: tauri::AppHandle,
    db: Database,
    vault_key: [u8; 32],
) -> Result<(), Box<dyn std::error::Error>> {
    // ── Network config ──────────────────────────────────────────
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let net_config_path = data_dir.join("network.json");

    let config = NetworkConfig::load_or_default(&net_config_path);

    // Save a copy so users can edit it (creates the file on first run).
    if !net_config_path.exists() {
        if let Err(e) = config.save(&net_config_path) {
            tracing::warn!(?e, "Could not write default network.json");
        }
    }

    // ── Network ─────────────────────────────────────────────────
    let (net_handle, event_rx, _net_join) = net::start(None, config, db.clone()).await?;

    info!(
        peer_id = %net_handle.local_peer_id(),
        "libp2p node started"
    );

    // ── Services ────────────────────────────────────────────────
    let ratchet = Arc::new(RatchetService::new(db.clone(), vault_key));

    let (drop_event_tx, mut drop_event_rx) = mpsc::channel(128);
    let download_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| data_dir_from_handle(&app));
    let drop_svc = Arc::new(DropService::new(
        net_handle.clone(),
        drop_event_tx,
        download_dir,
    ));

    // ── Forward drop events to Tauri ────────────────────────────
    let app2 = app.clone();
    tokio::spawn(async move {
        use orbits_titan::bridge::events::{names, FileProgressEvent, FileCompleteEvent, FileErrorEvent};
        use tauri::Emitter;
        use orbits_titan::services::drop_service::DropEvent;

        while let Some(event) = drop_event_rx.recv().await {
            match event {
                DropEvent::Progress {
                    transfer_id,
                    chunks_done,
                    total_chunks,
                } => {
                    let _ = app2.emit(
                        names::FILE_PROGRESS,
                        FileProgressEvent {
                            transfer_id,
                            chunks_done,
                            total_chunks,
                            direction: "sending".into(),
                        },
                    );
                }
                DropEvent::Completed { transfer_id, path } => {
                    let _ = app2.emit(
                        names::FILE_COMPLETE,
                        FileCompleteEvent {
                            transfer_id,
                            path: path.map(|p| p.to_string_lossy().into_owned()),
                        },
                    );
                }
                DropEvent::Failed { transfer_id, error } => {
                    let _ = app2.emit(
                        names::FILE_ERROR,
                        FileErrorEvent {
                            transfer_id,
                            error,
                        },
                    );
                }
                DropEvent::IncomingOffer { .. } => {
                    // Handled by the network event bridge.
                }
                DropEvent::Started { .. } => {}
            }
        }
    });

    // ── Register state for Tauri commands ────────────────────────
    app.manage(AppState {
        db: db.clone(),
        net: net_handle.clone(),
        ratchet: ratchet.clone(),
        drop: drop_svc.clone(),
    });

    // ── Event bridge: network events → Tauri events ─────────────
    bridge::spawn_event_bridge(
        app.clone(),
        event_rx,
        db,
        ratchet,
        drop_svc,
        net_handle,
    );

    // Note: Kademlia bootstrap, relay connections, and periodic
    // re-bootstrap are all handled internally by the NetworkRunner.
    // No manual bootstrap call needed here.

    Ok(())
}

/// Derive a vault key for encrypting ratchet state at rest.
///
/// Uses PBKDF2 with a device-specific salt. In production, replace
/// with OS keychain integration (e.g., `keyring` crate).
fn derive_vault_key(data_dir: &std::path::Path) -> [u8; 32] {
    // Use a persistent salt file so the key is stable across restarts.
    let salt_path = data_dir.join(".vault_salt");
    let salt = if salt_path.exists() {
        std::fs::read(&salt_path).unwrap_or_else(|_| generate_salt(&salt_path))
    } else {
        generate_salt(&salt_path)
    };

    // Derive from machine hostname + salt. Not perfect security,
    // but prevents casual offline reads. Replace with keyring in prod.
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "orbits-default".to_string());

    let dk = crypto::pbkdf2_derive(hostname.as_bytes(), &salt, 100_000, 32);
    let mut key = [0u8; 32];
    key.copy_from_slice(&dk);
    key
}

fn generate_salt(path: &std::path::Path) -> Vec<u8> {
    let mut salt = vec![0u8; 32];
    getrandom::getrandom(&mut salt).expect("RNG failed");
    let _ = std::fs::write(path, &salt);
    salt
}

fn data_dir_from_handle(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}
