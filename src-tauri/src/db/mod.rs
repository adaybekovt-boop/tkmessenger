// db/mod.rs — SQLite storage layer for Orbits.
//
// Replaces IndexedDB. Stores:
//   - Messages (per-peer history)
//   - Contacts (peer metadata, status, last seen)
//   - Ratchet sessions (encrypted Double Ratchet state per peer)
//   - Local identity (keypair, profile)
//
// All operations are synchronous on a dedicated thread. The async
// bridge uses tokio::task::spawn_blocking to avoid starving the runtime.

use std::path::Path;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::errors::{OrbitsError, Result};

/// Database schema version. Bump when adding migrations.
const SCHEMA_VERSION: u32 = 2;

// ─── Data models ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub peer_id: String,
    pub from_id: String,
    pub text: Option<String>,
    pub msg_type: String,        // "text" | "sticker" | "voice" | "file"
    pub metadata_json: Option<String>,
    pub reply_to_id: Option<String>,
    pub delivery: String,        // "queued" | "sent" | "delivered" | "read"
    pub created_at: i64,         // unix millis
    pub edited_at: Option<i64>,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredContact {
    pub peer_id: String,
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_b64: Option<String>,
    pub status: String,         // "online" | "offline" | "connecting"
    pub last_seen_at: i64,
    pub blocked: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredRatchetSession {
    pub peer_id: String,
    /// JSON-serialized RatchetState (encrypted at rest with the vault key).
    pub state_json_encrypted: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredIdentity {
    pub peer_id: String,
    pub signing_key_b64: String,   // Ed25519 private key
    pub verifying_key_b64: String, // Ed25519 public key
    pub display_name: String,
    pub bio: String,
    pub avatar_b64: Option<String>,
    pub created_at: i64,
}

// ─── Database handle ────────────────────────────────────────────

/// Thread-safe database handle. Cloneable — each clone shares the
/// same underlying Mutex<Connection>.
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Open (or create) the database at the given path.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations()?;
        Ok(db)
    }

    /// In-memory database for tests.
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock();

        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

        let version: u32 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap_or(0);

        if version < 1 {
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS contacts (
                    peer_id       TEXT PRIMARY KEY,
                    display_name  TEXT,
                    bio           TEXT,
                    avatar_b64    TEXT,
                    status        TEXT NOT NULL DEFAULT 'offline',
                    last_seen_at  INTEGER NOT NULL DEFAULT 0,
                    blocked       INTEGER NOT NULL DEFAULT 0,
                    created_at    INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id            TEXT PRIMARY KEY,
                    peer_id       TEXT NOT NULL,
                    from_id       TEXT NOT NULL,
                    text          TEXT,
                    msg_type      TEXT NOT NULL DEFAULT 'text',
                    metadata_json TEXT,
                    reply_to_id   TEXT,
                    delivery      TEXT NOT NULL DEFAULT 'queued',
                    created_at    INTEGER NOT NULL,
                    edited_at     INTEGER,
                    deleted       INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_messages_peer_ts
                    ON messages(peer_id, created_at);

                CREATE TABLE IF NOT EXISTS ratchet_sessions (
                    peer_id                TEXT PRIMARY KEY,
                    state_json_encrypted   TEXT NOT NULL,
                    updated_at             INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS identity (
                    id                  INTEGER PRIMARY KEY CHECK (id = 1),
                    peer_id             TEXT NOT NULL,
                    signing_key_b64     TEXT NOT NULL,
                    verifying_key_b64   TEXT NOT NULL,
                    display_name        TEXT NOT NULL DEFAULT '',
                    bio                 TEXT NOT NULL DEFAULT '',
                    avatar_b64          TEXT,
                    created_at          INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS kv (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            )?;
        }

        if version < 2 {
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS known_peers (
                    peer_id       TEXT NOT NULL,
                    addr          TEXT NOT NULL,
                    last_seen_at  INTEGER NOT NULL,
                    source        TEXT NOT NULL DEFAULT 'kademlia',
                    PRIMARY KEY (peer_id, addr)
                );
                CREATE INDEX IF NOT EXISTS idx_known_peers_seen
                    ON known_peers(last_seen_at DESC);
                ",
            )?;
        }

        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        Ok(())
    }

    // ─── Identity ───────────────────────────────────────────────

    pub fn save_identity(&self, identity: &StoredIdentity) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO identity
                (id, peer_id, signing_key_b64, verifying_key_b64, display_name, bio, avatar_b64, created_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                identity.peer_id,
                identity.signing_key_b64,
                identity.verifying_key_b64,
                identity.display_name,
                identity.bio,
                identity.avatar_b64,
                identity.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn load_identity(&self) -> Result<Option<StoredIdentity>> {
        let conn = self.conn.lock();
        let result = conn
            .query_row(
                "SELECT peer_id, signing_key_b64, verifying_key_b64, display_name, bio, avatar_b64, created_at
                 FROM identity WHERE id = 1",
                [],
                |row| {
                    Ok(StoredIdentity {
                        peer_id: row.get(0)?,
                        signing_key_b64: row.get(1)?,
                        verifying_key_b64: row.get(2)?,
                        display_name: row.get(3)?,
                        bio: row.get(4)?,
                        avatar_b64: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    // ─── Contacts ───────────────────────────────────────────────

    pub fn upsert_contact(&self, contact: &StoredContact) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO contacts (peer_id, display_name, bio, avatar_b64, status, last_seen_at, blocked, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(peer_id) DO UPDATE SET
                display_name = COALESCE(excluded.display_name, contacts.display_name),
                bio          = COALESCE(excluded.bio, contacts.bio),
                avatar_b64   = COALESCE(excluded.avatar_b64, contacts.avatar_b64),
                status       = excluded.status,
                last_seen_at = MAX(excluded.last_seen_at, contacts.last_seen_at),
                blocked      = excluded.blocked",
            params![
                contact.peer_id,
                contact.display_name,
                contact.bio,
                contact.avatar_b64,
                contact.status,
                contact.last_seen_at,
                contact.blocked,
                contact.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_contacts(&self) -> Result<Vec<StoredContact>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT peer_id, display_name, bio, avatar_b64, status, last_seen_at, blocked, created_at
             FROM contacts WHERE blocked = 0 ORDER BY last_seen_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(StoredContact {
                peer_id: row.get(0)?,
                display_name: row.get(1)?,
                bio: row.get(2)?,
                avatar_b64: row.get(3)?,
                status: row.get(4)?,
                last_seen_at: row.get(5)?,
                blocked: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        let mut contacts = Vec::new();
        for row in rows {
            contacts.push(row?);
        }
        Ok(contacts)
    }

    pub fn block_contact(&self, peer_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE contacts SET blocked = 1 WHERE peer_id = ?1",
            params![peer_id],
        )?;
        Ok(())
    }

    // ─── Messages ───────────────────────────────────────────────

    pub fn insert_message(&self, msg: &StoredMessage) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO messages
                (id, peer_id, from_id, text, msg_type, metadata_json, reply_to_id, delivery, created_at, edited_at, deleted)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                msg.id,
                msg.peer_id,
                msg.from_id,
                msg.text,
                msg.msg_type,
                msg.metadata_json,
                msg.reply_to_id,
                msg.delivery,
                msg.created_at,
                msg.edited_at,
                msg.deleted,
            ],
        )?;
        Ok(())
    }

    pub fn get_messages(
        &self,
        peer_id: &str,
        limit: u32,
        before_ts: i64,
    ) -> Result<Vec<StoredMessage>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, peer_id, from_id, text, msg_type, metadata_json, reply_to_id,
                    delivery, created_at, edited_at, deleted
             FROM messages
             WHERE peer_id = ?1 AND created_at < ?2 AND deleted = 0
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![peer_id, before_ts, limit], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                peer_id: row.get(1)?,
                from_id: row.get(2)?,
                text: row.get(3)?,
                msg_type: row.get(4)?,
                metadata_json: row.get(5)?,
                reply_to_id: row.get(6)?,
                delivery: row.get(7)?,
                created_at: row.get(8)?,
                edited_at: row.get(9)?,
                deleted: row.get(10)?,
            })
        })?;
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        messages.reverse(); // chronological order
        Ok(messages)
    }

    pub fn update_delivery(&self, msg_id: &str, delivery: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE messages SET delivery = ?1 WHERE id = ?2",
            params![delivery, msg_id],
        )?;
        Ok(())
    }

    pub fn soft_delete_message(&self, msg_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE messages SET deleted = 1, text = NULL WHERE id = ?1",
            params![msg_id],
        )?;
        Ok(())
    }

    pub fn prune_old_messages(&self, peer_id: &str, keep_last: u32) -> Result<u64> {
        let conn = self.conn.lock();
        let deleted = conn.execute(
            "DELETE FROM messages WHERE peer_id = ?1 AND id NOT IN (
                SELECT id FROM messages WHERE peer_id = ?1
                ORDER BY created_at DESC LIMIT ?2
             )",
            params![peer_id, keep_last],
        )?;
        Ok(deleted as u64)
    }

    // ─── Ratchet Sessions ───────────────────────────────────────

    pub fn save_ratchet_session(&self, session: &StoredRatchetSession) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO ratchet_sessions (peer_id, state_json_encrypted, updated_at)
             VALUES (?1, ?2, ?3)",
            params![
                session.peer_id,
                session.state_json_encrypted,
                session.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn load_ratchet_session(&self, peer_id: &str) -> Result<Option<StoredRatchetSession>> {
        let conn = self.conn.lock();
        let result = conn
            .query_row(
                "SELECT peer_id, state_json_encrypted, updated_at
                 FROM ratchet_sessions WHERE peer_id = ?1",
                params![peer_id],
                |row| {
                    Ok(StoredRatchetSession {
                        peer_id: row.get(0)?,
                        state_json_encrypted: row.get(1)?,
                        updated_at: row.get(2)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    pub fn delete_ratchet_session(&self, peer_id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM ratchet_sessions WHERE peer_id = ?1",
            params![peer_id],
        )?;
        Ok(())
    }

    // ─── KV Store (misc settings) ───────────────────────────────

    pub fn kv_set(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        let result = conn
            .query_row("SELECT value FROM kv WHERE key = ?1", params![key], |row| {
                row.get(0)
            })
            .optional()?;
        Ok(result)
    }

    // ─── Known Peers (persistent peer cache) ────────────────────

    /// Upsert a known peer address. Called when Kademlia, mDNS, or
    /// Identify discovers a peer's address.
    pub fn save_known_peer(
        &self,
        peer_id: &str,
        addr: &str,
        source: &str,
    ) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO known_peers (peer_id, addr, last_seen_at, source)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(peer_id, addr) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                source       = excluded.source",
            params![
                peer_id,
                addr,
                chrono::Utc::now().timestamp_millis(),
                source,
            ],
        )?;
        Ok(())
    }

    /// Load the most recently seen known peers (up to `limit`).
    /// Returns (peer_id, addr) pairs suitable for seeding Kademlia.
    pub fn load_known_peers(&self, limit: u32) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT peer_id, addr FROM known_peers
             ORDER BY last_seen_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut peers = Vec::new();
        for row in rows {
            peers.push(row?);
        }
        Ok(peers)
    }

    /// Prune peers not seen for more than `max_age_ms` milliseconds.
    pub fn prune_known_peers(&self, max_age_ms: i64) -> Result<u64> {
        let cutoff = chrono::Utc::now().timestamp_millis() - max_age_ms;
        let conn = self.conn.lock();
        let deleted = conn.execute(
            "DELETE FROM known_peers WHERE last_seen_at < ?1",
            params![cutoff],
        )?;
        Ok(deleted as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_roundtrip() {
        let db = Database::open_in_memory().unwrap();
        let id = StoredIdentity {
            peer_id: "test-peer-id".into(),
            signing_key_b64: "sk_base64".into(),
            verifying_key_b64: "vk_base64".into(),
            display_name: "Alice".into(),
            bio: "Hello!".into(),
            avatar_b64: None,
            created_at: 1700000000000,
        };
        db.save_identity(&id).unwrap();
        let loaded = db.load_identity().unwrap().unwrap();
        assert_eq!(loaded.peer_id, "test-peer-id");
        assert_eq!(loaded.display_name, "Alice");
    }

    #[test]
    fn test_messages_crud() {
        let db = Database::open_in_memory().unwrap();
        let msg = StoredMessage {
            id: "msg1".into(),
            peer_id: "peer1".into(),
            from_id: "me".into(),
            text: Some("Hello".into()),
            msg_type: "text".into(),
            metadata_json: None,
            reply_to_id: None,
            delivery: "sent".into(),
            created_at: 1000,
            edited_at: None,
            deleted: false,
        };
        db.insert_message(&msg).unwrap();
        let msgs = db.get_messages("peer1", 50, i64::MAX).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].text.as_deref(), Some("Hello"));

        db.soft_delete_message("msg1").unwrap();
        let msgs = db.get_messages("peer1", 50, i64::MAX).unwrap();
        assert_eq!(msgs.len(), 0); // deleted = true, filtered out
    }
}
