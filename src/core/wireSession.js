// WireSessionManager — per-peer handshake state machine on top of the
// Double Ratchet. Owns the ready-promise that outbound messages wait on,
// buffers handshake messages until both sides have exchanged dhPub, and
// persists ratchet state to IndexedDB so sessions survive reloads.
//
// Handshake protocol v3 (signed, MITM-resistant):
//   1. On reliable `open`, each side sends:
//        { type: 'wireHello', v: 3, pub, idPub, sig }
//      where:
//        pub   = base64(DH pubkey SPKI) — ephemeral, per-session
//        idPub = base64(identity ECDSA pubkey SPKI) — long-term, per-install
//        sig   = base64(ECDSA-P256/SHA-256 signature over buildSignedHelloBlob)
//   2. The receiver verifies the signature with idPub. A v3 hello with an
//      invalid signature is REJECTED outright — no ratchet, no sharedSecret.
//   3. Trust-on-first-use: the receiver pins the sender's idPub fingerprint
//      on first success. Any later v3 hello from the same peerId with a
//      different idPub is REJECTED until the user clears the pin.
//   4. Peer with the lexicographically smaller peerId becomes "Alice"
//      (initiator); the other becomes "Bob" (responder).
//   5. Alice builds state immediately (has Bob's pub → can derive sendCk).
//   6. Bob waits for Alice's first ciphertext, which triggers a DH ratchet
//      step on receive.
//   7. Either side may send `{ type: 'wireRekey', v: 3, ... }` to force
//      fresh state (reset + re-handshake). Rekey is signed like wireHello.
//
// Legacy v2 hellos (unsigned) are still accepted for compat with older peers,
// but the resulting session is marked as `verified: false`. The UI should
// badge those chats with a "not verified" indicator.

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
import {
  exportIdentityPubSpki,
  signBytes,
  verifyWithRemoteSpki,
  buildSignedHelloBlob,
  computeFingerprint
} from './identityKey.js';
import { checkPin, setPin } from './peerPins.js';
import { wrapBytes, unwrapBytes, hasVaultKek } from './vaultKek.js';
import { deriveInitiatorBootstrap, deriveResponderBootstrap } from './x3dhSession.js';
import { isX3dhEnabled } from './featureFlags.js';

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
      // v3 identity material — populated when a signed hello completes.
      remoteIdSpki: null,
      remoteFingerprint: null,
      verified: false, // true iff signature + pin both matched
      protocolVersion: null, // 2 (legacy unsigned) | 3 (signed) | 4 (X3DH)
      // X3DH bootstrap secret. Set by initiateHandshake on alice when a bundle
      // is cached, or by acceptHello on bob after replaying responder X3DH.
      // When present, replaces the plain DH-of-ephemerals secret as the seed
      // for the Double Ratchet root key.
      bootstrapSK: null,
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
  // When the vault KEK is present (user is unlocked), wrap the sensitive byte
  // fields (rootKey, chain keys, skipped message keys) with AES-GCM so an
  // attacker with raw IDB access cannot recover them. `hasVaultKek()` guards
  // against pre-unlock writes to avoid persisting plaintext and then
  // overwriting with ciphertext on the next save (which would race).
  const shouldWrap = hasVaultKek();
  const wrap = (v) => (shouldWrap && v ? wrapBytes(v) : v);

  const wrappedRoot = await wrap(session.state.rootKey);
  const wrappedSend = await wrap(session.state.sendCk);
  const wrappedRecv = await wrap(session.state.recvCk);

  const skippedPlain = session.state.skipped || new Map();
  let skippedSerialized;
  if (shouldWrap) {
    skippedSerialized = {};
    for (const [k, v] of skippedPlain.entries()) {
      skippedSerialized[k] = await wrap(v);
    }
  } else {
    skippedSerialized = Object.fromEntries(skippedPlain);
  }

  const snapshot = {
    peerId: session.peerId,
    role: session.role,
    encVersion: shouldWrap ? 1 : 0,
    rootKey: wrappedRoot,
    sendCk: wrappedSend,
    recvCk: wrappedRecv,
    dhKeyPair: session.state.dhKeyPair,
    dhPubSpki: session.state.dhPubSpki,
    remoteDhPub: session.state.remoteDhPub,
    Ns: session.state.Ns,
    Nr: session.state.Nr,
    PN: session.state.PN,
    // Skipped map → plain object (Map is structured-cloneable too, but object
    // gives cleaner debugging).
    skipped: skippedSerialized,
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
    // Wrapped fields become readable once the vault is unlocked. If the KEK
    // is not yet available (e.g. autolock timed out mid-session), we can't
    // hydrate — return null and leave the row on disk for a later retry.
    let rootKey, sendCk, recvCk;
    try {
      rootKey = await unwrapBytes(row.rootKey);
      sendCk = row.sendCk ? await unwrapBytes(row.sendCk) : null;
      recvCk = row.recvCk ? await unwrapBytes(row.recvCk) : null;
    } catch (err) {
      try { console.warn('[wire] hydrateSession: vault locked, deferring', peerId); } catch (_) {}
      return null;
    }
    const skippedMap = new Map();
    for (const [k, v] of Object.entries(row.skipped || {})) {
      try {
        skippedMap.set(k, await unwrapBytes(v));
      } catch (_) {
        // One corrupt entry shouldn't kill the session — just drop it.
      }
    }
    const session = getOrCreateSession(peerId);
    session.role = row.role || null;
    session.state = {
      rootKey,
      sendCk,
      recvCk,
      dhKeyPair: row.dhKeyPair,
      dhPubSpki: row.dhPubSpki,
      remoteDhPub: row.remoteDhPub || null,
      Ns: row.Ns | 0,
      Nr: row.Nr | 0,
      PN: row.PN | 0,
      skipped: skippedMap
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
 * Build the signed hello payload we will send for a given peer. Pulled out
 * of initiateHandshake so acceptHello can reuse it when it needs to send a
 * reply hello (the peer's hello arrived before our own open event).
 */
async function buildSignedHello({ session, myPeerId, peerId, type = 'wireHello', x3dhExtras = null }) {
  const idSpki = await exportIdentityPubSpki();
  const blob = buildSignedHelloBlob({
    senderPeerId: myPeerId,
    receiverPeerId: peerId,
    senderDhSpki: session.localDhPubSpki,
    senderIdSpki: idSpki,
    x3dhExtras: x3dhExtras
      ? { x3dhIkSpki: x3dhExtras.myX3dhIkSpki, ekSpki: x3dhExtras.ekSpki, spkId: x3dhExtras.spkId, opkId: x3dhExtras.opkId }
      : null
  });
  const sig = await signBytes(blob);
  const hello = {
    type,
    v: x3dhExtras ? 4 : 3,
    pub: bytesToBase64(session.localDhPubSpki),
    idPub: bytesToBase64(idSpki),
    sig: bytesToBase64(sig)
  };
  if (x3dhExtras) {
    hello.x3dhIk = bytesToBase64(x3dhExtras.myX3dhIkSpki);
    hello.x3dhIkSig = bytesToBase64(x3dhExtras.myX3dhIkSig);
    hello.ek = bytesToBase64(x3dhExtras.ekSpki);
    hello.spkId = String(x3dhExtras.spkId);
    if (x3dhExtras.opkId) hello.opkId = String(x3dhExtras.opkId);
  }
  return hello;
}

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

  // X3DH fast path: if we're the initiator and have a cached bundle for the
  // peer, bootstrap the root key from X3DH instead of a plain DH-of-ephemerals
  // round-trip. Falls through to v3 if no bundle is cached (first contact) or
  // derivation fails. The stashed SK is consumed later in acceptHello when the
  // peer's reply arrives.
  session.bootstrapSK = null;
  let x3dhExtras = null;
  if (session.role === 'alice' && isX3dhEnabled()) {
    try {
      const boot = await deriveInitiatorBootstrap(peerId);
      if (boot) {
        session.bootstrapSK = boot.sk;
        x3dhExtras = boot;
      }
    } catch (err) {
      try { console.warn('[wire] X3DH initiator bootstrap failed, falling back to v3', err); } catch (_) {}
    }
  }

  return buildSignedHello({ session, myPeerId, peerId, x3dhExtras });
}

/**
 * Verify a v3 signed hello. Returns { ok, idSpki, fingerprint, pinStatus }
 * on success, or throws with a descriptive message on any failure. Callers
 * MUST NOT proceed to key derivation on failure — that is the whole point
 * of the signature.
 */
async function verifySignedHello({ helloMsg, senderPeerId, receiverPeerId, remoteDhSpki, x3dhExtras = null }) {
  const idPubB64 = String(helloMsg.idPub || '');
  const sigB64 = String(helloMsg.sig || '');
  if (!idPubB64 || !sigB64) throw new Error('signed hello missing idPub or sig');

  let idSpki;
  let sigBytes;
  try {
    idSpki = base64ToBytes(idPubB64);
    sigBytes = base64ToBytes(sigB64);
  } catch (_) {
    throw new Error('signed hello has malformed base64 fields');
  }

  const blob = buildSignedHelloBlob({
    senderPeerId,
    receiverPeerId,
    senderDhSpki: remoteDhSpki,
    senderIdSpki: idSpki,
    x3dhExtras: x3dhExtras
      ? { x3dhIkSpki: x3dhExtras.x3dhIkSpki, ekSpki: x3dhExtras.ekSpki, spkId: x3dhExtras.spkId, opkId: x3dhExtras.opkId }
      : null
  });
  const ok = await verifyWithRemoteSpki(idSpki, blob, sigBytes);
  if (!ok) throw new Error('wireHello signature verification failed — possible MITM');

  // TOFU: the first verified handshake pins the peer's identity fingerprint.
  // Subsequent handshakes with a *different* idPub are rejected.
  const pinStatus = await checkPin(senderPeerId, idSpki);
  if (pinStatus.status === 'mismatch') {
    throw new Error(
      `Peer ${senderPeerId} identity key changed (expected ${pinStatus.expected.slice(0, 16)}, ` +
      `got ${pinStatus.fingerprint.slice(0, 16)}) — possible MITM or legitimate key rotation. ` +
      `Clear the pin manually to accept the new key.`
    );
  }
  if (pinStatus.status === 'new') {
    await setPin(senderPeerId, idSpki);
  }

  const fingerprint = await computeFingerprint(idSpki);
  return { ok: true, idSpki, fingerprint, pinStatus: pinStatus.status };
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

  const helloVer = Number(helloMsg.v) | 0;
  const protocolVersion = helloVer >= 4 ? 4 : helloVer >= 3 ? 3 : 2;
  const remoteDhSpki = base64ToBytes(pubB64);

  // Decode v4 X3DH fields up front (used for sig verification + responder
  // derivation). All fields must be present together; partial v4 is rejected.
  let v4Extras = null;
  if (protocolVersion >= 4) {
    try {
      v4Extras = {
        x3dhIkSpki: base64ToBytes(String(helloMsg.x3dhIk || '')),
        x3dhIkSig: base64ToBytes(String(helloMsg.x3dhIkSig || '')),
        ekSpki: base64ToBytes(String(helloMsg.ek || '')),
        spkId: String(helloMsg.spkId || ''),
        opkId: helloMsg.opkId ? String(helloMsg.opkId) : null
      };
    } catch (_) {
      throw new Error('v4 hello has malformed X3DH fields');
    }
    if (!v4Extras.x3dhIkSpki.byteLength || !v4Extras.ekSpki.byteLength || !v4Extras.spkId) {
      throw new Error('v4 hello missing required X3DH fields');
    }
  }

  // v3+: verify signature BEFORE we touch any session/ratchet state. If the
  // signature fails or the pin changed, we refuse to derive a shared secret.
  let verified = false;
  let remoteIdSpki = null;
  let remoteFingerprint = null;
  if (protocolVersion >= 3) {
    const v = await verifySignedHello({
      helloMsg,
      senderPeerId: peerId,
      receiverPeerId: myPeerId,
      remoteDhSpki,
      x3dhExtras: v4Extras
    });
    verified = true;
    remoteIdSpki = v.idSpki;
    remoteFingerprint = v.fingerprint;
  }

  // If we haven't generated our own DH yet (peer's hello arrived before our
  // reliable open fired), do it now and return a matching hello to send back.
  let reply = null;
  if (!session.localDhKeyPair) {
    session.localDhKeyPair = await generateDhKeyPair();
    session.localDhPubSpki = await exportSpkiBytes(session.localDhKeyPair.publicKey);
    session.role = String(myPeerId).localeCompare(String(peerId)) < 0 ? 'alice' : 'bob';
    // Match the peer's protocol version so mixed-version peers stay
    // compatible. A v2 peer gets an unsigned reply; a v3 peer gets a signed
    // reply that it can verify.
    if (protocolVersion >= 3) {
      reply = await buildSignedHello({ session, myPeerId, peerId });
    } else {
      reply = {
        type: 'wireHello',
        v: 2,
        pub: bytesToBase64(session.localDhPubSpki)
      };
    }
  }

  session.remoteDhPubSpki = remoteDhSpki;
  session.protocolVersion = protocolVersion;
  session.verified = verified;
  session.remoteIdSpki = remoteIdSpki;
  session.remoteFingerprint = remoteFingerprint;

  // Treat wireRekey as a full reset: drop any prior ratchet state.
  // Also reset on a fresh wireHello if we already had a completed session —
  // the remote side reconnected with new DH keys, so the old ratchet is stale.
  if (session.state && (helloMsg.type === 'wireRekey' || session.ready)) {
    session.state = null;
    resetPendingReady(session);
  }

  // If this is a v4 hello (alice initiated X3DH), replay the responder DHs
  // against our local prekey privates. The resulting SK is the Double Ratchet
  // bootstrap secret — it must match whatever alice derived, otherwise her
  // first ciphertext will fail to decrypt.
  if (v4Extras) {
    const boot = await deriveResponderBootstrap({
      senderIdSpki: remoteIdSpki,
      senderX3dhIkSpki: v4Extras.x3dhIkSpki,
      senderX3dhIkSig: v4Extras.x3dhIkSig,
      ekSpki: v4Extras.ekSpki,
      spkId: v4Extras.spkId,
      opkId: v4Extras.opkId
    });
    if (!boot.ok) throw new Error(boot.reason || 'x3dh responder failed');
    session.bootstrapSK = boot.sk;
  }

  // Prefer an X3DH-derived bootstrap (set either by us on alice during
  // initiateHandshake or by the responder branch above on bob). Otherwise
  // fall back to the legacy DH-of-ephemerals transcript-bound secret.
  const shared = session.bootstrapSK
    ? session.bootstrapSK
    : await deriveSharedSecret(
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
  return { reply, verified, fingerprint: remoteFingerprint };
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

/**
 * Read-only snapshot of the handshake verification state for a peer. Used
 * by the UI to render a "verified" badge and the peer's fingerprint for
 * out-of-band comparison. Returns null if no session exists.
 */
export function getVerification(peerId) {
  const s = sessions.get(peerId);
  if (!s) return null;
  return {
    peerId: s.peerId,
    verified: !!s.verified,
    protocolVersion: s.protocolVersion,
    fingerprint: s.remoteFingerprint || null
  };
}

export function __sessions_for_test() { return sessions; }
export { isWireCiphertext };
