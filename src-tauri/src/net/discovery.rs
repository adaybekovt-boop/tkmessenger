// net/discovery.rs — Kademlia DHT + mDNS peer discovery helpers.
//
// Provides configuration builders and bootstrap logic for the
// distributed peer discovery layer.

use std::time::Duration;

use libp2p::{kad, Multiaddr, PeerId};
use tracing::{debug, info, warn};

/// Bootstrap nodes for initial DHT entry.
///
/// In production, populate with relay/bootstrap server multiaddrs, e.g.:
/// `"/ip4/203.0.113.1/tcp/4001/p2p/12D3KooW..."`
pub const BOOTSTRAP_NODES: &[&str] = &[];

/// Build a Kademlia behaviour with sensible defaults for Orbits.
pub fn build_kademlia(local_peer_id: PeerId) -> kad::Behaviour<kad::store::MemoryStore> {
    let store = kad::store::MemoryStore::new(local_peer_id);

    let mut config = kad::Config::default();
    config.set_query_timeout(Duration::from_secs(60));
    config.set_record_ttl(Some(Duration::from_secs(3600)));
    config.set_provider_record_ttl(Some(Duration::from_secs(3600)));

    let mut behaviour = kad::Behaviour::with_config(local_peer_id, store, config);
    behaviour.set_mode(Some(kad::Mode::Server));

    // Seed bootstrap nodes into the routing table.
    for node_str in BOOTSTRAP_NODES {
        if let Ok(addr) = node_str.parse::<Multiaddr>() {
            if let Some(peer_id) = peer_id_from_multiaddr(&addr) {
                behaviour.add_address(&peer_id, addr);
            }
        }
    }

    behaviour
}

/// Kick off a Kademlia bootstrap round (random walk to populate the
/// routing table). Safe to call even with an empty routing table —
/// it will just log a warning.
pub fn bootstrap(kademlia: &mut kad::Behaviour<kad::store::MemoryStore>) {
    match kademlia.bootstrap() {
        Ok(query_id) => info!(?query_id, "Kademlia bootstrap started"),
        Err(e) => warn!("Kademlia bootstrap skipped (no known peers): {e:?}"),
    }
}

/// Extract the `PeerId` from the `/p2p/<peer_id>` component of a multiaddr.
pub fn peer_id_from_multiaddr(addr: &Multiaddr) -> Option<PeerId> {
    addr.iter().find_map(|proto| {
        if let libp2p::multiaddr::Protocol::P2p(id) = proto {
            Some(id)
        } else {
            None
        }
    })
}
