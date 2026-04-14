// net/mod.rs — libp2p Swarm management for Orbits P2P networking.
//
// Composes all libp2p protocols (request-response, Kademlia, mDNS,
// identify, relay, DCUtR, ping) into a single behaviour and runs
// the swarm event loop in a background tokio task.
//
// Fixes for production networking:
//   - Configurable bootnodes, relay servers, and ports
//   - Periodic Kademlia re-bootstrap (not just once at startup)
//   - Relay server dial + reservation for NAT traversal
//   - Persistent peer cache in SQLite

pub mod discovery;
pub mod protocol;

use std::collections::HashSet;
use std::time::Duration;

use futures::StreamExt;
use libp2p::{
    dcutr, identify, identity, kad, mdns, noise, ping, relay,
    request_response::{self, ProtocolSupport},
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId, StreamProtocol, Swarm,
};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

use crate::db::Database;
use crate::errors::{OrbitsError, Result};
use discovery::NetworkConfig;
use protocol::{OrbitsCodec, OrbitsRequest, OrbitsResponse};

// ─── Composed Behaviour ─────────────────────────────────────────

#[derive(NetworkBehaviour)]
pub struct OrbitsBehaviour {
    pub request_response: request_response::Behaviour<OrbitsCodec>,
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
    pub relay_client: relay::client::Behaviour,
    pub dcutr: dcutr::Behaviour,
    pub ping: ping::Behaviour,
}

// ─── Command / Event channel types ──────────────────────────────

pub enum NetworkCommand {
    SendRequest {
        peer_id: PeerId,
        request: OrbitsRequest,
    },
    SendResponse {
        channel: request_response::ResponseChannel<OrbitsResponse>,
        response: OrbitsResponse,
    },
    Dial {
        peer_id: PeerId,
        addr: Multiaddr,
    },
    Listen {
        addr: Multiaddr,
    },
    Bootstrap,
    Advertise,
    FindPeer {
        peer_id: PeerId,
    },
    /// Connect to a relay and request a reservation.
    ConnectRelay {
        relay_addr: Multiaddr,
    },
    Shutdown,
}

#[derive(Debug)]
pub enum NetworkEvent {
    IncomingMessage {
        from: PeerId,
        request: OrbitsRequest,
    },
    IncomingFileOffer {
        from: PeerId,
        request: OrbitsRequest,
        channel: request_response::ResponseChannel<OrbitsResponse>,
    },
    ResponseReceived {
        peer_id: PeerId,
        request_id: request_response::OutboundRequestId,
        response: OrbitsResponse,
    },
    OutboundFailure {
        peer_id: PeerId,
        request_id: request_response::OutboundRequestId,
        error: String,
    },
    PeerConnected(PeerId),
    PeerDisconnected(PeerId),
    Listening(Multiaddr),
}

// ─── Public handle ──────────────────────────────────────────────

#[derive(Clone)]
pub struct NetworkHandle {
    command_tx: mpsc::Sender<NetworkCommand>,
    local_peer_id: PeerId,
}

impl NetworkHandle {
    pub fn local_peer_id(&self) -> PeerId {
        self.local_peer_id
    }

    pub async fn send_request(&self, peer_id: PeerId, request: OrbitsRequest) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::SendRequest { peer_id, request })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn send_response(
        &self,
        channel: request_response::ResponseChannel<OrbitsResponse>,
        response: OrbitsResponse,
    ) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::SendResponse { channel, response })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn dial(&self, peer_id: PeerId, addr: Multiaddr) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::Dial { peer_id, addr })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn listen(&self, addr: Multiaddr) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::Listen { addr })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn bootstrap(&self) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::Bootstrap)
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn find_peer(&self, peer_id: PeerId) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::FindPeer { peer_id })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn connect_relay(&self, relay_addr: Multiaddr) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::ConnectRelay { relay_addr })
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }

    pub async fn shutdown(&self) -> Result<()> {
        self.command_tx
            .send(NetworkCommand::Shutdown)
            .await
            .map_err(|_| OrbitsError::ChannelClosed)
    }
}

// ─── Network runner ─────────────────────────────────────────────

struct NetworkRunner {
    swarm: Swarm<OrbitsBehaviour>,
    command_rx: mpsc::Receiver<NetworkCommand>,
    event_tx: mpsc::Sender<NetworkEvent>,
    db: Database,
    config: NetworkConfig,
    /// Relay PeerIds we've connected to and hold reservations on.
    active_relays: HashSet<PeerId>,
}

/// Build the swarm and spawn the network event loop.
pub async fn start(
    keypair: Option<identity::Keypair>,
    config: NetworkConfig,
    db: Database,
) -> Result<(NetworkHandle, mpsc::Receiver<NetworkEvent>, JoinHandle<()>)> {
    let listen_addrs = config.listen_addrs();
    let swarm = build_swarm(keypair, &config, &db)?;
    let local_peer_id = *swarm.local_peer_id();
    info!(%local_peer_id, "Network node identity");

    let (command_tx, command_rx) = mpsc::channel(256);
    let (event_tx, event_rx) = mpsc::channel(256);

    let mut runner = NetworkRunner {
        swarm,
        command_rx,
        event_tx,
        db,
        config,
        active_relays: HashSet::new(),
    };

    // Start listening on configured addresses.
    for addr in listen_addrs {
        runner
            .swarm
            .listen_on(addr.clone())
            .map_err(|e| OrbitsError::TransportError(format!("listen on {addr}: {e}")))?;
    }

    let join = tokio::spawn(async move { runner.run().await });

    let handle = NetworkHandle {
        command_tx,
        local_peer_id,
    };

    Ok((handle, event_rx, join))
}

/// Default listen addresses (used when no config file exists).
pub fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/0".parse().expect("valid multiaddr"),
        "/ip4/0.0.0.0/udp/0/quic-v1".parse().expect("valid multiaddr"),
    ]
}

// ─── Swarm construction ─────────────────────────────────────────

fn build_swarm(
    keypair: Option<identity::Keypair>,
    config: &NetworkConfig,
    db: &Database,
) -> Result<Swarm<OrbitsBehaviour>> {
    let builder = match keypair {
        Some(kp) => libp2p::SwarmBuilder::with_existing_identity(kp),
        None => libp2p::SwarmBuilder::with_new_identity(),
    };

    let cfg = config.clone();
    let db2 = db.clone();

    let swarm = builder
        .with_tokio()
        .with_tcp(
            tcp::Config::default().nodelay(true),
            noise::Config::new,
            yamux::Config::default,
        )
        .map_err(|e| OrbitsError::TransportError(format!("TCP: {e}")))?
        .with_quic()
        .with_relay_client(noise::Config::new, yamux::Config::default)
        .map_err(|e| OrbitsError::TransportError(format!("Relay client: {e}")))?
        .with_behaviour(|key, relay_client| {
            let local_peer_id = key.public().to_peer_id();

            let request_response = request_response::Behaviour::new(
                [(
                    StreamProtocol::new("/orbits/msg/1.0.0"),
                    ProtocolSupport::Full,
                )],
                request_response::Config::default(),
            );

            // Kademlia — seeded from config bootnodes + persistent cache.
            let kademlia = discovery::build_kademlia(local_peer_id, &cfg, &db2);

            let mdns = mdns::tokio::Behaviour::new(
                mdns::Config::default(),
                local_peer_id,
            )?;

            let identify = identify::Behaviour::new(identify::Config::new(
                "/orbits/id/1.0.0".to_string(),
                key.public(),
            ));

            let dcutr = dcutr::Behaviour::new(local_peer_id);
            let ping = ping::Behaviour::default();

            Ok(OrbitsBehaviour {
                request_response,
                kademlia,
                mdns,
                identify,
                relay_client,
                dcutr,
                ping,
            })
        })
        .map_err(|e| OrbitsError::TransportError(format!("Behaviour init: {e}")))?
        .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(120)))
        .build();

    Ok(swarm)
}

// ─── Event loop ─────────────────────────────────────────────────

impl NetworkRunner {
    async fn run(&mut self) {
        info!("Network event loop started");

        // ── Initial actions after listeners are up ──────────────
        // Short delay so TCP/QUIC listeners bind before we bootstrap.
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Prune stale peer cache entries.
        discovery::prune_peer_cache(&self.db, self.config.peer_cache_max_age_hours);

        // Initial Kademlia bootstrap.
        discovery::bootstrap(&mut self.swarm.behaviour_mut().kademlia);

        // Dial relay servers and request reservations.
        self.connect_configured_relays();

        // Periodic bootstrap timer.
        let bootstrap_interval = Duration::from_secs(
            self.config.bootstrap_interval_secs.max(60),
        );
        let mut bootstrap_timer = tokio::time::interval(bootstrap_interval);
        bootstrap_timer.tick().await; // consume the first immediate tick

        loop {
            tokio::select! {
                event = self.swarm.select_next_some() => {
                    self.handle_swarm_event(event).await;
                }
                cmd = self.command_rx.recv() => {
                    match cmd {
                        Some(NetworkCommand::Shutdown) | None => {
                            info!("Network event loop shutting down");
                            break;
                        }
                        Some(cmd) => self.handle_command(cmd),
                    }
                }
                _ = bootstrap_timer.tick() => {
                    debug!("Periodic Kademlia re-bootstrap");
                    discovery::bootstrap(&mut self.swarm.behaviour_mut().kademlia);

                    // Re-check relay reservations.
                    self.reconnect_dead_relays();
                }
            }
        }
    }

    // ── Relay management ────────────────────────────────────────

    /// Dial all relay servers from config and listen on their
    /// circuit addresses.
    fn connect_configured_relays(&mut self) {
        for relay_str in self.config.relay_servers.clone() {
            if let Some((relay_pid, relay_addr)) = discovery::parse_peer_multiaddr(&relay_str) {
                info!(%relay_pid, %relay_addr, "Dialing relay server");

                // Add to Kademlia so we know how to reach it.
                self.swarm
                    .behaviour_mut()
                    .kademlia
                    .add_address(&relay_pid, relay_addr.clone());

                // Dial the relay.
                if let Err(e) = self.swarm.dial(relay_addr) {
                    warn!(%relay_pid, ?e, "Failed to dial relay");
                    continue;
                }

                // Listen on the relay-circuit address so inbound
                // connections can reach us through the relay.
                let circuit_addr = discovery::relay_listen_addr(&relay_pid);
                if let Err(e) = self.swarm.listen_on(circuit_addr.clone()) {
                    warn!(%relay_pid, ?e, "Failed to listen on relay circuit");
                } else {
                    info!(%relay_pid, %circuit_addr, "Listening via relay");
                    self.active_relays.insert(relay_pid);
                }
            } else {
                warn!(relay_str, "Invalid relay multiaddr — skipping");
            }
        }
    }

    /// Re-connect to relays that have dropped.
    fn reconnect_dead_relays(&mut self) {
        let configured: Vec<_> = self.config.relay_servers.clone();
        for relay_str in configured {
            if let Some((relay_pid, relay_addr)) = discovery::parse_peer_multiaddr(&relay_str) {
                if !self.swarm.is_connected(&relay_pid) {
                    info!(%relay_pid, "Relay disconnected — reconnecting");
                    self.active_relays.remove(&relay_pid);

                    self.swarm
                        .behaviour_mut()
                        .kademlia
                        .add_address(&relay_pid, relay_addr.clone());

                    let _ = self.swarm.dial(relay_addr);

                    let circuit_addr = discovery::relay_listen_addr(&relay_pid);
                    let _ = self.swarm.listen_on(circuit_addr);
                    self.active_relays.insert(relay_pid);
                }
            }
        }
    }

    // ── Swarm events ────────────────────────────────────────────

    async fn handle_swarm_event(&mut self, event: SwarmEvent<OrbitsBehaviourEvent>) {
        match event {
            // ── Request-Response ──────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RequestResponse(
                request_response::Event::Message { peer, message },
            )) => match message {
                request_response::Message::Request {
                    request, channel, ..
                } => {
                    self.handle_incoming_request(peer, request, channel).await;
                }
                request_response::Message::Response {
                    request_id,
                    response,
                } => {
                    self.emit(NetworkEvent::ResponseReceived {
                        peer_id: peer,
                        request_id,
                        response,
                    })
                    .await;
                }
            },

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RequestResponse(
                request_response::Event::OutboundFailure {
                    peer,
                    request_id,
                    error,
                },
            )) => {
                warn!(%peer, ?error, "Outbound request failed");
                self.emit(NetworkEvent::OutboundFailure {
                    peer_id: peer,
                    request_id,
                    error: format!("{error}"),
                })
                .await;
            }

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RequestResponse(
                request_response::Event::InboundFailure {
                    peer, error, ..
                },
            )) => {
                warn!(%peer, ?error, "Inbound request failed");
            }

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RequestResponse(
                request_response::Event::ResponseSent { .. },
            )) => {}

            // ── Kademlia ─────────────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Kademlia(event)) => {
                self.handle_kademlia_event(event);
            }

            // ── mDNS ─────────────────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Mdns(event)) => {
                self.handle_mdns_event(event);
            }

            // ── Identify ─────────────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Identify(
                identify::Event::Received { peer_id, info, .. },
            )) => {
                debug!(%peer_id, protocols = ?info.protocols, "Identify received");
                for addr in &info.listen_addrs {
                    self.swarm
                        .behaviour_mut()
                        .kademlia
                        .add_address(&peer_id, addr.clone());

                    // Persist to peer cache.
                    discovery::cache_peer(&self.db, &peer_id, addr, "identify");
                }
            }

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Identify(_)) => {}

            // ── Relay client ─────────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RelayClient(
                relay::client::Event::ReservationReqAccepted { relay_peer_id, .. },
            )) => {
                info!(%relay_peer_id, "Relay reservation accepted — we are reachable via relay");
                self.active_relays.insert(relay_peer_id);
            }

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RelayClient(
                relay::client::Event::ReservationReqFailed {
                    relay_peer_id,
                    error,
                    ..
                },
            )) => {
                warn!(%relay_peer_id, ?error, "Relay reservation FAILED");
                self.active_relays.remove(&relay_peer_id);
            }

            SwarmEvent::Behaviour(OrbitsBehaviourEvent::RelayClient(_)) => {}

            // ── DCUtR (hole punching) ────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Dcutr(event)) => {
                debug!(?event, "DCUtR event");
            }

            // ── Ping ─────────────────────────────────────────
            SwarmEvent::Behaviour(OrbitsBehaviourEvent::Ping(_)) => {}

            // ── Connection lifecycle ─────────────────────────
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                info!(%peer_id, "Connection established");
                self.emit(NetworkEvent::PeerConnected(peer_id)).await;
            }

            SwarmEvent::ConnectionClosed {
                peer_id, cause, ..
            } => {
                info!(%peer_id, ?cause, "Connection closed");
                self.emit(NetworkEvent::PeerDisconnected(peer_id)).await;
            }

            SwarmEvent::NewListenAddr { address, .. } => {
                info!(%address, "Listening on");
                self.emit(NetworkEvent::Listening(address)).await;
            }

            SwarmEvent::IncomingConnectionError {
                local_addr, error, ..
            } => {
                warn!(%local_addr, ?error, "Incoming connection error");
            }

            SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
                if let Some(peer_id) = peer_id {
                    warn!(%peer_id, ?error, "Outgoing connection error");
                }
            }

            _ => {}
        }
    }

    async fn handle_incoming_request(
        &mut self,
        from: PeerId,
        request: OrbitsRequest,
        channel: request_response::ResponseChannel<OrbitsResponse>,
    ) {
        match &request {
            OrbitsRequest::FileOffer { .. } => {
                self.emit(NetworkEvent::IncomingFileOffer {
                    from,
                    request,
                    channel,
                })
                .await;
            }
            _ => {
                let _ = self
                    .swarm
                    .behaviour_mut()
                    .request_response
                    .send_response(channel, OrbitsResponse::Ok);
                self.emit(NetworkEvent::IncomingMessage { from, request })
                    .await;
            }
        }
    }

    fn handle_kademlia_event(&mut self, event: kad::Event) {
        match event {
            kad::Event::OutboundQueryProgressed { result, .. } => match result {
                kad::QueryResult::Bootstrap(Ok(ok)) => {
                    debug!(num_remaining = ok.num_remaining, "Kademlia bootstrap progress");
                }
                kad::QueryResult::Bootstrap(Err(e)) => {
                    warn!(?e, "Kademlia bootstrap failed");
                }
                kad::QueryResult::GetClosestPeers(Ok(ok)) => {
                    debug!(key = ?ok.key, "GetClosestPeers completed");
                }
                kad::QueryResult::GetClosestPeers(Err(e)) => {
                    warn!("GetClosestPeers failed: {e:?}");
                }
                _ => {}
            },
            kad::Event::RoutingUpdated {
                peer, addresses, ..
            } => {
                debug!(%peer, "Kademlia routing table updated");
                // Cache every address Kademlia learns about.
                for addr in addresses.iter() {
                    discovery::cache_peer(&self.db, &peer, addr, "kademlia");
                }
            }
            _ => {}
        }
    }

    fn handle_mdns_event(&mut self, event: mdns::Event) {
        match event {
            mdns::Event::Discovered(peers) => {
                for (peer_id, addr) in peers {
                    info!(%peer_id, %addr, "mDNS: discovered peer");
                    self.swarm
                        .behaviour_mut()
                        .kademlia
                        .add_address(&peer_id, addr.clone());

                    discovery::cache_peer(&self.db, &peer_id, &addr, "mdns");
                    let _ = self.swarm.dial(peer_id);
                }
            }
            mdns::Event::Expired(peers) => {
                for (peer_id, addr) in peers {
                    debug!(%peer_id, %addr, "mDNS: peer expired");
                }
            }
        }
    }

    // ── Application commands ────────────────────────────────────

    fn handle_command(&mut self, cmd: NetworkCommand) {
        match cmd {
            NetworkCommand::SendRequest { peer_id, request } => {
                self.swarm
                    .behaviour_mut()
                    .request_response
                    .send_request(&peer_id, request);
            }
            NetworkCommand::SendResponse { channel, response } => {
                if self
                    .swarm
                    .behaviour_mut()
                    .request_response
                    .send_response(channel, response)
                    .is_err()
                {
                    warn!("Failed to send response (connection may have closed)");
                }
            }
            NetworkCommand::Dial { peer_id, addr } => {
                self.swarm
                    .behaviour_mut()
                    .kademlia
                    .add_address(&peer_id, addr);
                if let Err(e) = self.swarm.dial(peer_id) {
                    warn!(%peer_id, ?e, "Dial failed");
                }
            }
            NetworkCommand::Listen { addr } => {
                if let Err(e) = self.swarm.listen_on(addr.clone()) {
                    warn!(%addr, ?e, "Listen failed");
                }
            }
            NetworkCommand::Bootstrap => {
                discovery::bootstrap(&mut self.swarm.behaviour_mut().kademlia);
            }
            NetworkCommand::Advertise => {
                let local_peer_id = *self.swarm.local_peer_id();
                let _ = self
                    .swarm
                    .behaviour_mut()
                    .kademlia
                    .start_providing(kad::RecordKey::new(&local_peer_id.to_bytes()));
            }
            NetworkCommand::FindPeer { peer_id } => {
                self.swarm
                    .behaviour_mut()
                    .kademlia
                    .get_closest_peers(peer_id);
            }
            NetworkCommand::ConnectRelay { relay_addr } => {
                if let Some((relay_pid, _)) = discovery::parse_peer_multiaddr(&relay_addr.to_string()) {
                    self.swarm
                        .behaviour_mut()
                        .kademlia
                        .add_address(&relay_pid, relay_addr.clone());

                    if let Err(e) = self.swarm.dial(relay_addr) {
                        warn!(%relay_pid, ?e, "Failed to dial relay");
                        return;
                    }

                    let circuit_addr = discovery::relay_listen_addr(&relay_pid);
                    let _ = self.swarm.listen_on(circuit_addr);
                    self.active_relays.insert(relay_pid);
                }
            }
            NetworkCommand::Shutdown => {}
        }
    }

    async fn emit(&self, event: NetworkEvent) {
        if self.event_tx.send(event).await.is_err() {
            warn!("Event receiver dropped — application may be shutting down");
        }
    }
}
