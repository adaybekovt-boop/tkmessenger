// lib.rs — Crate root for orbits-titan (Tauri backend).
//
// Module declarations for the native Rust core. Each module is
// self-contained with its own error handling:
//
//   crypto/    — Ed25519, X25519, AES-256-GCM, HKDF, Double Ratchet
//   db/        — SQLite storage (messages, contacts, sessions, identity)
//   net/       — libp2p swarm (Kademlia, mDNS, QUIC/TCP, relay, DCUtR)
//   services/  — application-level services (ratchet wrapper, file transfer)
//   bridge/    — Tauri IPC commands and events for the React frontend
//   errors     — unified OrbitsError enum

pub mod bridge;
pub mod crypto;
pub mod db;
pub mod errors;
pub mod net;
pub mod services;
