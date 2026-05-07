// Port of src/peer/signaling.js — PeerJS host list, ICE config, backoff.
//
// Pure logic — no I/O. Consumed by peer_connection_manager.dart.

import 'dart:math';

const String peerServerSentinel = '__URL__';

const List<Map<String, Object>> defaultIceServers = [
  {'urls': 'stun:stun.l.google.com:19302'},
  {'urls': 'stun:stun1.l.google.com:19302'},
  {'urls': 'stun:stun2.l.google.com:19302'},
  {'urls': 'stun:stun3.l.google.com:19302'},
  {'urls': 'stun:stun4.l.google.com:19302'},
  {'urls': 'stun:stun.services.mozilla.com'},
  {'urls': 'stun:global.stun.twilio.com:3478'},
];

/// Environment knobs. Mirrors the `import.meta.env` subset used in the JS build.
class PeerEnv {
  final String? peerServer;     // VITE_PEER_SERVER (full URL override)
  final String? peerHost;       // VITE_PEER_HOST   (pinned host, disables rotation)
  final String? peerPath;       // VITE_PEER_PATH
  final int? peerPort;          // VITE_PEER_PORT
  final bool? peerSecure;       // VITE_PEER_SECURE
  final String? turnUrl;
  final String? turnUsername;
  final String? turnCredential;
  final bool relayOnly;

  const PeerEnv({
    this.peerServer,
    this.peerHost,
    this.peerPath,
    this.peerPort,
    this.peerSecure,
    this.turnUrl,
    this.turnUsername,
    this.turnCredential,
    this.relayOnly = false,
  });
}

/// Initial rotation list of signaling hosts. Mirrors buildSignalingHosts.
List<String> buildSignalingHosts(PeerEnv env) {
  if (env.peerServer != null) return [peerServerSentinel];
  if (env.peerHost != null) return [env.peerHost!];
  return const ['0.peerjs.com', '1.peerjs.com', '2.peerjs.com'];
}

/// Rotation is disabled when the user pinned a specific host.
bool canRotateHosts(PeerEnv env, List<String> hosts) {
  if (hosts.length <= 1) return false;
  return env.peerHost == null;
}

/// Exponential backoff with jitter, capped at 30s. Mirrors computeBackoffMs.
int computeBackoffMs(int attempt, {int base = 800, int maxMs = 30000, int jitter = 500}) {
  final safe = attempt < 0 ? 0 : attempt;
  final expMs = min(maxMs, (base * pow(2, safe)).toInt());
  return expMs + Random().nextInt(jitter);
}

/// Build the ICE servers list for an RTCPeerConnection. When TURN creds are
/// configured and the user enabled "relay only", we force iceTransportPolicy.
({List<Map<String, Object>> iceServers, String? iceTransportPolicy}) buildRtcConfig(PeerEnv env) {
  final hasTurn = env.turnUrl != null && env.turnUsername != null && env.turnCredential != null;
  final servers = [...defaultIceServers];
  if (hasTurn) {
    servers.add({
      'urls': env.turnUrl!,
      'username': env.turnUsername!,
      'credential': env.turnCredential!,
    });
  }
  final policy = (hasTurn && env.relayOnly) ? 'relay' : null;
  return (iceServers: servers, iceTransportPolicy: policy);
}

/// Resolved signaling endpoint the WebSocket client should dial.
class ResolvedSignalingEndpoint {
  final String host;
  final int port;
  final String path;
  final bool secure;
  const ResolvedSignalingEndpoint({
    required this.host,
    required this.port,
    required this.path,
    required this.secure,
  });
}

/// Resolve the host/port/path/secure tuple from env + rotating host. Mirrors
/// the logic inside createPeerInstance in signaling.js — we don't instantiate
/// a Peer object here (no Dart equivalent), just produce the values that the
/// future peerjs_client.dart will use to open its WebSocket.
ResolvedSignalingEndpoint resolveEndpoint({required String host, required PeerEnv env}) {
  var resolvedHost = host;
  var path = env.peerPath ?? '/';
  var secure = env.peerSecure ?? true;
  var port = env.peerPort ?? (secure ? 443 : 80);

  final peerServer = env.peerServer;
  if (peerServer != null) {
    final uri = Uri.parse(peerServer);
    resolvedHost = uri.host;
    secure = uri.scheme == 'https' || uri.scheme == 'wss';
    port = uri.hasPort ? uri.port : (secure ? 443 : 80);
    path = uri.path.isEmpty ? '/' : uri.path;
  }

  return ResolvedSignalingEndpoint(
    host: resolvedHost == peerServerSentinel ? '' : resolvedHost,
    port: port,
    path: path,
    secure: secure,
  );
}
