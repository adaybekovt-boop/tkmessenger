// net/discovery.rs — Kademlia DHT + mDNS peer discovery helpers.
//
// Provides:
//   - NetworkConfig: runtime-configurable network parameters
//   - Kademlia configuration with seed nodes
//   - Persistent peer cache (load/save from SQLite)
//   - Relay server connection helpers

use std::path::Path;
use std::time::Duration;

use libp2p::{kad, Multiaddr, PeerId};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::db::Database;

// ─── Network configuration ──────────────────────────────────────

/// Runtime network configuration. Loaded from
/// `{app_data_dir}/network.json` with sane defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    /// Bootstrap / seed nodes (multiaddr with embedded /p2p/<peer_id>).
    /// These are the first nodes contacted to join the DHT.
    #[serde(default)]
    pub bootnodes: Vec<String>,

    /// Relay servers for NAT traversal (multiaddr with /p2p/<peer_id>).
    /// The client will dial these, request a reservation, and listen
    /// on the relayed address so peers behind NAT can reach us.
    #[serde(default)]
    pub relay_servers: Vec<String>,

    /// Fixed TCP listen port. 0 = OS-assigned random port.
    #[serde(default)]
    pub tcp_port: u16,

    /// Fixed QUIC listen port. 0 = OS-assigned random port.
    #[serde(default)]
    pub quic_port: u16,

    /// Enable mDNS for local-network peer discovery.
    #[serde(default = "default_true")]
    pub mdns_enabled: bool,

    /// Kademlia bootstrap interval in seconds.
    /// Periodic re-bootstrap keeps the routing table fresh.
    #[serde(default = "default_bootstrap_interval")]
    pub bootstrap_interval_secs: u64,

    /// Maximum age (in hours) for cached peers before pruning.
    #[serde(default = "default_peer_cache_hours")]
    pub peer_cache_max_age_hours: u64,
}

fn default_true() -> bool { true }
fn default_bootstrap_interval() -> u64 { 300 } // 5 minutes
fn default_peer_cache_hours() -> u64 { 72 } // 3 days

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            bootnodes: Vec::new(),
            relay_servers: Vec::new(),
            tcp_port: 0,
            quic_port: 0,
            mdns_enabled: true,
            bootstrap_interval_secs: default_bootstrap_interval(),
            peer_cache_max_age_hours: default_peer_cache_hours(),
        }
    }
}

impl NetworkConfig {
    /// Load from a JSON file, falling back to defaults if missing.
    pub fn load_or_default(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => match serde_json::from_str(&json) {
                Ok(cfg) => {
                    info!(path = %path.display(), "Loaded network config");
                    cfg
                }
                Err(e) => {
                    warn!(%e, "Malformed network.json — using defaults");
                    Self::default()
                }
            },
            Err(_) => {
                info!("No network.json found — using defaults");
                Self::default()
            }
        }
    }

    /// Save current config to disk (so the user can edit it).
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(path, json)
    }

    /// Build the listen multiaddrs from configured ports.
    pub fn listen_addrs(&self) -> Vec<Multiaddr> {
        vec![
            format!("/ip4/0.0.0.0/tcp/{}", self.tcp_port)
                .parse()
                .expect("valid multiaddr"),
            format!("/ip4/0.0.0.0/udp/{}/quic-v1", self.quic_port)
                .parse()
                .expect("valid multiaddr"),
        ]
    }
}

// ─── Kademlia ───────────────────────────────────────────────────

/// Build a Kademlia behaviour seeded with bootnodes + cached peers.
pub fn build_kademlia(
    local_peer_id: PeerId,
    config: &NetworkConfig,
    db: &Database,
) -> kad::Behaviour<kad::store::MemoryStore> {
    let store = kad::store::MemoryStore::new(local_peer_id);

    let mut kad_config = kad::Config::default();
    kad_config.set_query_timeout(Duration::from_secs(60));
    kad_config.set_record_ttl(Some(Duration::from_secs(3600)));
    kad_config.set_provider_record_ttl(Some(Duration::from_secs(3600)));

    let mut behaviour = kad::Behaviour::with_config(local_peer_id, store, kad_config);
    behaviour.set_mode(Some(kad::Mode::Server));

    // 1) Seed from config bootnodes.
    let mut seeded = 0usize;
    for node_str in &config.bootnodes {
        if let Some((peer_id, addr)) = parse_peer_multiaddr(node_str) {
            behaviour.add_address(&peer_id, addr);
            seeded += 1;
        }
    }

    // 2) Seed from persistent peer cache.
    match db.load_known_peers(200) {
        Ok(peers) => {
            for (pid_str, addr_str) in &peers {
                if let (Ok(pid), Ok(addr)) = (pid_str.parse::<PeerId>(), addr_str.parse::<Multiaddr>()) {
                    if pid != local_peer_id {
                        behaviour.add_address(&pid, addr);
                        seeded += 1;
                    }
                }
            }
        }
        Err(e) => warn!(%e, "Failed to load peer cache"),
    }

    info!(seeded, "Kademlia routing table seeded");
    behaviour
}

/// Kick off a Kademlia bootstrap round.
pub fn bootstrap(kademlia: &mut kad::Behaviour<kad::store::MemoryStore>) {
    match kademlia.bootstrap() {
        Ok(query_id) => info!(?query_id, "Kademlia bootstrap started"),
        Err(e) => warn!("Kademlia bootstrap skipped (no known peers): {e:?}"),
    }
}

// ─── Relay helpers ──────────────────────────────────────────────

/// Build the relay-circuit listen address for a given relay peer.
///
/// Format: `/p2p/{relay_peer_id}/p2p-circuit`
/// Listening on this address tells libp2p to accept inbound connections
/// relayed through the specified relay server.
pub fn relay_listen_addr(relay_peer_id: &PeerId) -> Multiaddr {
    format!("/p2p/{relay_peer_id}/p2p-circuit")
        .parse()
        .expect("valid relay circuit multiaddr")
}

// ─── Peer cache persistence ─────────────────────────────────────

/// Save a discovered peer address to the DB cache.
pub fn cache_peer(db: &Database, peer_id: &PeerId, addr: &Multiaddr, source: &str) {
    let pid = peer_id.to_string();
    let addr_str = addr.to_string();
    if let Err(e) = db.save_known_peer(&pid, &addr_str, source) {
        debug!(%e, "Failed to cache peer address");
    }
}

/// Prune stale peers from the cache.
pub fn prune_peer_cache(db: &Database, max_age_hours: u64) {
    let max_age_ms = (max_age_hours * 3600 * 1000) as i64;
    match db.prune_known_peers(max_age_ms) {
        Ok(n) if n > 0 => info!(pruned = n, "Pruned stale peers from cache"),
        Ok(_) => {}
        Err(e) => warn!(%e, "Failed to prune peer cache"),
    }
}

// ─── Parsing helpers ────────────────────────────────────────────

/// Parse a multiaddr string that contains an embedded `/p2p/<peer_id>`.
/// Returns (PeerId, Multiaddr-without-p2p-suffix) for use with
/// `Behaviour::add_address`.
pub fn parse_peer_multiaddr(s: &str) -> Option<(PeerId, Multiaddr)> {
    let addr: Multiaddr = s.parse().ok()?;
    let peer_id = peer_id_from_multiaddr(&addr)?;
    Some((peer_id, addr))
}

/// Extract the `PeerId` from the `/p2p/<peer_id>` component.
pub fn peer_id_from_multiaddr(addr: &Multiaddr) -> Option<PeerId> {
    addr.iter().find_map(|proto| {
        if let libp2p::multiaddr::Protocol::P2p(id) = proto {
            Some(id)
        } else {
            None
        }
    })
}
