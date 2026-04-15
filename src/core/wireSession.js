// WireSessionManager — per-peer handshake state machine on top of the
// Double Ratchet. Owns the ready-promise that outbound messages wait on,
// buffers handshake messages until both sides have exchanged dhPub, and
// persists ratchet state to IndexedDB so sessions survive reloads.
//
// Handshake protocol (break-compat v2):
//   1. On reliable `open`, each side sends:
//        { type: 'wireHello', v: 2, pub: base64(spki) }
//   2. Peer with the lexicographically smaller peerId becomes "Alice"
//      (initiator); the other becomes "Bob" (responder).
//   3. Alice builds state immediately (has Bob's pub → can derive sendCk).
//   4. Bob waits for Alice's first ciphertext, which triggers a DH ratchet
//      step on receive.
//   5. Either side may send `{ type: 'wireRekey', v: 2, pub: ... }` to
//      force fresh state (reset + re-handshake).

import { base64ToBytes, bytesToBase64 } from './base64.js';
import {
  generateDhKeyPair,
  exportSpkiBytes,
  importRemoteSpki,
  ratchetInitAlice,
  ratchetInitBob,
  ratchetEncrypt,
  ratchetDecrypt,
  decodeWire,
  encodeWire,
  isWireCiphertext
} from './doubleRatchet.js';
import {
  loadRatchetState,
  saveRatchetState,
  deleteRatchetState
} from './db.js';

const HKDF_SALT_TAG = 'orbits-wire-v2';

// In-memory: peerId → session object.
const sessions = new Map();

// Buffer for ciphertexts that arrive before the ratchet is ready (race between
// message arrival and acceptHello completion). Drained once the session is ready.
const pendingInbound = new Map(); // peerId → [{wireStr, resolve, reject}]

function createPendingReady() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function getOrCreateSession(peerId) {
  let s = sessions.get(peerId);
  if (!s) {
    const pr = createPendingReady();
    s = {
      peerId,
      state: null,
      localDhKeyPair: null,
      localDhPubSpki: null,
      remoteDhPubSpki: null,
      role: null, // 'alice' | 'bob'
      ready: false,
      readyPromise: pr.promise,
      resolveReady: pr.resolve,
      rejectReady: pr.reject,
      persistLock: Promise.resolve()
    };
    sessions.set(peerId, s);
  }
  return s;
}

function resetPendingReady(session) {
  const pr = createPendingReady();
  session.readyPromise = pr.promise;
  session.resolveReady = pr.resolve;
  session.rejectReady = pr.reject;
  session.ready = false;
}

async function deriveSharedSecret(localPrivateKey, remotePubSpkiBytes, myPeerId, peerId) {
  const remoteKey = await importRemoteSpki(remotePubSpkiBytes);
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteKey },
    localPrivateKey,
    256
  );
  const shared = new Uint8Array(bits);

  // Mix in a transcript-bound salt so the shared secret is scoped to this
  // particular peer pair + protocol version.
  const sorted = [String(myPeerId), String(peerId)].sort().join('|');
  const saltData = new TextEncoder().encode(`${HKDF_SALT_TAG}|${sorted}`);
  const hkdfIn = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const bits2 = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: saltData, info: new TextEncoder().encode('sk') },
    hkdfIn,
    256
  );
  return new Uint8Array(bits2);
}

async function persistSession(session) {
  if (!session.state) return;
  // Serialize to a structured-cloneable shape. CryptoKey/CryptoKeyPair are
  // structured-cloneable in all modern browsers; Uint8Arrays are too.
  const snapshot = {
    peerId: session.peerId,
    role: session.role,
    rootKey: session.state.rootKey,
    sendCk: session.state.sendCk,
    recvCk: session.state.recvCk,
    dhKeyPair: session.state.dhKeyPair,
    dhPubSpki: session.state.dhPubSpki,
    remoteDhPub: session.state.remoteDhPub,
    Ns: session.state.Ns,
    Nr: session.state.Nr,
    PN: session.state.PN,
    // Skipped map → plain object (Map is structured-cloneable too, but object
    // gives cleaner debugging).
    skipped: Object.fromEntries(session.state.skipped || new Map()),
    updatedAt: Date.now()
  };
  // Serialize persistence per-session to avoid interleaving writes.
  session.persistLock = session.persistLock.then(() => saveRatchetState(snapshot)).catch((err) => {
    try { console.warn('[wire] persistSession failed — forward secrecy may degrade on reload', err); } catch (_) {}
  });
  await session.persistLock;
}

async function hydrateSession(peerId) {
  try {
    const row = await loadRatchetState(peerId);
    if (!row) return null;
    // Validate critical fields before trusting the persisted state.
    if (!row.dhKeyPair || !row.dhPubSpki || !row.rootKey) {
      try { console.warn('[wire] hydrateSession: corrupted ratchet state for', peerId); } catch (_) {}
      await deleteRatchetState(peerId).catch(() => {});
      return null;
    }
    const session = getOrCreateSession(peerId);
    session.role = row.role || null;
    session.state = {
      rootKey: row.rootKey,
      sendCk: row.sendCk || null,
      recvCk: row.recvCk || null,
      dhKeyPair: row.dhKeyPair,
      dhPubSpki: row.dhPubSpki,
      remoteDhPub: row.remoteDhPub || null,
      Ns: row.Ns | 0,
      Nr: row.Nr | 0,
      PN: row.PN | 0,
      skipped: new Map(Object.entries(row.skipped || {}))
    };
    session.localDhKeyPair = row.dhKeyPair;
    session.localDhPubSpki = row.dhPubSpki;
    session.remoteDhPubSpki = row.remoteDhPub || null;
    if (session.state.sendCk || session.state.recvCk || session.role === 'bob') {
      session.ready = true;
      session.resolveReady?.({ peerId });
    }
    return session;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Called when the reliable DataChannel opens. Ensures a local DH key pair
 * exists, attempts to hydrate any persisted state, and sends our wireHello.
 *
 * Returns the hello message the caller should send via conn.send().
 */
export async function initiateHandshake(peerId, myPeerId) {
  const existing = await hydrateSession(peerId);
  const session = existing || getOrCreateSession(peerId);

  if (!session.localDhKeyPair) {
    session.localDhKeyPair = await generateDhKeyPair();
    session.localDhPubSpki = await exportSpkiBytes(session.localDhKeyPair.publicKey);
  }

  // Role is assigned deterministically by peer id comparison.
  session.role = String(myPeerId).localeCompare(String(peerId)) < 0 ? 'alice' : 'bob';

  // Reset readiness so that waitForWireReady blocks until the peer's
  // wireHello arrives and acceptHello completes the new ratchet. Without
  // this, a hydrated session resolves immediately, and outbound messages
  // (profile_req, queued chat messages) get encrypted with the stale
  // ratchet — the peer cannot decrypt them after processing our wireHello
  // and resetting its own ratchet state.
  if (session.ready) {
    resetPendingReady(session);
  }

  return {
    type: 'wireHello',
    v: 2,
    pub: bytesToBase64(session.localDhPubSpki)
  };
}

/**
 * Process an incoming wireHello (or wireRekey) message. If we now have both
 * sides' DH pubs, finalize the ratchet state so outbound messages can flow.
 */
export async function acceptHello(peerId, myPeerId, helloMsg) {
  const session = getOrCreateSession(peerId);
  if (!helloMsg || typeof helloMsg !== 'object') throw new Error('Bad hello');
  const pubB64 = String(helloMsg.pub || '');
  if (!pubB64) throw new Error('Hello missing pub');

  // If we haven't generated our own DH yet (peer's hello arrived before our
  // reliable open fired), do it now and return a matching hello to send back.
  let reply = null;
  if (!session.localDhKeyPair) {
    session.localDhKeyPair = await generateDhKeyPair();
    session.localDhPubSpki = await exportSpkiBytes(session.localDhKeyPair.publicKey);
    session.role = String(myPeerId).localeCompare(String(peerId)) < 0 ? 'alice' : 'bob';
    reply = {
      type: 'wireHello',
      v: 2,
      pub: bytesToBase64(session.localDhPubSpki)
    };
  }

  session.remoteDhPubSpki = base64ToBytes(pubB64);

  // Treat wireRekey as a full reset: drop any prior ratchet state.
  // Also reset on a fresh wireHello if we already had a completed session —
  // the remote side reconnected with new DH keys, so the old ratchet is stale.
  if (session.state && (helloMsg.type === 'wireRekey' || session.ready)) {
    session.state = null;
    resetPendingReady(session);
  }

  const shared = await deriveSharedSecret(
    session.localDhKeyPair.privateKey,
    session.remoteDhPubSpki,
    myPeerId,
    peerId
  );

  if (session.role === 'alice') {
    session.state = await ratchetInitAlice({
      sharedSecret: shared,
      remoteDhPubSpki: session.remoteDhPubSpki
    });
  } else {
    session.state = await ratchetInitBob({
      sharedSecret: shared,
      dhKeyPair: session.localDhKeyPair,
      dhPubSpki: session.localDhPubSpki
    });
  }
  session.ready = true;
  session.resolveReady?.({ peerId });
  await persistSession(session);
  // Drain any ciphertexts that arrived before the handshake completed.
  void drainPendingInbound(peerId);
  return { reply };
}

/** Wait until the ratchet is ready to encrypt an outgoing message. */
export function waitReady(peerId, timeoutMs = 8000) {
  const session = getOrCreateSession(peerId);
  if (session.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Wire session handshake timeout')), timeoutMs);
    session.readyPromise
      .then(() => { clearTimeout(t); resolve(); })
      .catch((err) => { clearTimeout(t); reject(err); });
  });
}

export function isReady(peerId) {
  const s = sessions.get(peerId);
  return !!s?.ready;
}

/** Encrypt a JS object → wire string. */
export async function encryptOutbound(peerId, obj) {
  const session = getOrCreateSession(peerId);
  if (!session.ready || !session.state || !session.state.sendCk) {
    // Bob who hasn't received Alice's first message yet cannot send yet —
    // this should never happen in practice because alice opens the chain.
    // Fall back: regenerate as alice locally isn't safe without roundtrip.
    throw new Error('Wire session not ready for send');
  }
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const { state, envelope } = await ratchetEncrypt(session.state, pt);
  session.state = state;
  persistSession(session).catch(() => {});
  return encodeWire(envelope);
}

/** Decrypt a wire string → JS object. */
export async function decryptInbound(peerId, wireStr) {
  const session = getOrCreateSession(peerId);
  if (!session.state) {
    // No state but ciphertext arrived: try to hydrate from IDB.
    await hydrateSession(peerId);
  }
  if (!session.state) {
    // Ratchet not ready yet — buffer the ciphertext and wait for acceptHello
    // to complete. This avoids silently dropping messages that arrive before
    // the handshake finishes (race condition on fresh connections).
    return new Promise((resolve, reject) => {
      if (!pendingInbound.has(peerId)) pendingInbound.set(peerId, []);
      const queue = pendingInbound.get(peerId);
      // Cap the queue to prevent unbounded growth from a misbehaving peer.
      if (queue.length >= 64) {
        reject(new Error('Too many buffered ciphertexts before handshake'));
        return;
      }
      queue.push({ wireStr, resolve, reject });
      // Auto-reject after 15s if handshake never completes.
      setTimeout(() => {
        const q = pendingInbound.get(peerId);
        if (q) {
          const idx = q.findIndex((e) => e.resolve === resolve);
          if (idx !== -1) {
            q.splice(idx, 1);
            if (!q.length) pendingInbound.delete(peerId);
            reject(new Error('No ratchet state for peer (timeout)'));
          }
        }
      }, 15000);
    });
  }
  const envelope = decodeWire(wireStr);
  if (!envelope) throw new Error('Bad wire envelope');
  const { state, plaintext } = await ratchetDecrypt(session.state, envelope);
  session.state = state;
  // Once Bob sees his first valid inbound, his ratchet now has both chains.
  if (!session.ready) {
    session.ready = true;
    session.resolveReady?.({ peerId });
  }
  persistSession(session).catch(() => {});
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/** Drain any ciphertexts that were buffered before the ratchet was ready. */
async function drainPendingInbound(peerId) {
  const queue = pendingInbound.get(peerId);
  if (!queue || !queue.length) return;
  pendingInbound.delete(peerId);
  for (const entry of queue) {
    try {
      const result = await decryptInbound(peerId, entry.wireStr);
      entry.resolve(result);
    } catch (err) {
      entry.reject(err);
    }
  }
}

/** Reset a session entirely (used by blockPeer, resetIdentity). */
export async function teardownSession(peerId) {
  const s = sessions.get(peerId);
  if (s) {
    try { s.rejectReady?.(new Error('Session torn down')); } catch (_) {}
    sessions.delete(peerId);
  }
  // Reject and discard any buffered inbound ciphertexts.
  const queue = pendingInbound.get(peerId);
  if (queue) {
    for (const entry of queue) {
      try { entry.reject(new Error('Session torn down')); } catch (_) {}
    }
    pendingInbound.delete(peerId);
  }
  try { await deleteRatchetState(peerId); } catch (_) {}
}

export function __sessions_for_test() { return sessions; }
export { isWireCiphertext };
