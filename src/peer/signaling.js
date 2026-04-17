// PeerJS signaling host list + Peer instance factory + reconnect backoff.
// Extracted from usePeer.js (createPeer + scheduleReconnect + host rotation).

import Peer from 'peerjs';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

const SENTINEL_URL = '__URL__';

/**
 * Build the initial rotation list of signaling hosts based on Vite env vars,
 * falling back to the public PeerJS server pool.
 */
export function buildSignalingHosts(env) {
  const envPeerServer = env?.VITE_PEER_SERVER;
  const envPeerHost = env?.VITE_PEER_HOST;
  const list = [];
  if (envPeerServer) {
    // A fully-qualified URL was provided; we push a sentinel so `createPeerInstance`
    // knows to parse it directly rather than pass it as a host string.
    list.push(SENTINEL_URL);
  } else if (envPeerHost) {
    list.push(String(envPeerHost));
  } else {
    list.push('0.peerjs.com', '1.peerjs.com', '2.peerjs.com');
  }
  return list;
}

/**
 * Whether host rotation is possible given the env (rotation is disabled when
 * the user pinned a specific VITE_PEER_HOST).
 */
export function canRotateHosts(env, hosts) {
  if (!hosts || hosts.length <= 1) return false;
  return !env?.VITE_PEER_HOST;
}

/**
 * Construct a PeerJS `Peer` instance configured with the given signaling host
 * and ICE servers. Accepts an optional `env` so the caller can pass a narrow
 * subset of `import.meta.env` for testing.
 */
export function createPeerInstance({ id, host, env }) {
  const envPeerPath = env?.VITE_PEER_PATH;
  const envPeerPort = env?.VITE_PEER_PORT;
  const envPeerSecure = env?.VITE_PEER_SECURE;
  const envPeerServer = env?.VITE_PEER_SERVER;
  const turnUrl = env?.VITE_TURN_URL;
  const turnUsername = env?.VITE_TURN_USERNAME;
  const turnCredential = env?.VITE_TURN_CREDENTIAL;

  const iceServers = [...DEFAULT_ICE_SERVERS];
  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }

  try {
    let resolvedHost = host;
    let path = envPeerPath ? String(envPeerPath) : '/';
    let secure = envPeerSecure != null ? String(envPeerSecure) === 'true' : true;
    let port = envPeerPort != null ? Number(envPeerPort) : secure ? 443 : 80;

    if (envPeerServer) {
      const u = new URL(String(envPeerServer));
      resolvedHost = u.hostname;
      secure = u.protocol === 'https:';
      port = u.port ? Number(u.port) : secure ? 443 : 80;
      path = u.pathname || '/';
    }

    return new Peer(id || undefined, {
      host: resolvedHost === SENTINEL_URL ? undefined : resolvedHost,
      port,
      path,
      secure,
      debug: 0,
      config: { iceServers }
    });
  } catch (_) {
    return new Peer(undefined, { debug: 0 });
  }
}

/**
 * Compute the delay (ms) for the next reconnect attempt using exponential
 * backoff with jitter, capped at 30s. Mirrors `scheduleReconnect` in usePeer.js.
 */
export function computeBackoffMs(attempt, { base = 800, max = 30_000, jitter = 500 } = {}) {
  const safeAttempt = Math.max(0, attempt | 0);
  const exp = Math.min(max, base * Math.pow(2, safeAttempt));
  return exp + Math.floor(Math.random() * jitter);
}

export { SENTINEL_URL as PEER_SERVER_SENTINEL };
