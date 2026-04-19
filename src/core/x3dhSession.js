// X3DH session orchestration — glue between the pure X3DH math, the local
// prekey store, and the cached remote bundles.
//
// Two entry points:
//   * `deriveInitiatorBootstrap(peerId)` — called by "alice" (lexicographically
//     smaller peerId) when she has a cached verified bundle for `peerId`.
//     Generates a fresh ephemeral EK, runs DH1..DH4, and returns both the SK
//     used to seed the Double Ratchet and the fields that must ride on the
//     outgoing hello_v4 so bob can replay the math.
//
//   * `deriveResponderBootstrap(fields)` — called by "bob" when an incoming
//     hello_v4 carries X3DH fields. Looks up his SPK priv by id, optionally
//     consumes the referenced OPK, verifies alice's x3dh-identity binding,
//     and derives the matching SK.
//
// On a successful initiator bootstrap we delete the cached bundle so the next
// session refetches a fresh OPK — reusing an OPK across sessions would break
// X3DH forward secrecy (bob's consume-once check would also reject it).

import { getCachedBundle, deleteCachedBundle } from './bundleCache.js';
import {
  getOrCreateX3DHIdentity,
  exportX3DHIdentityPubSpki,
  verifyX3DHBinding
} from './identityKey.js';
import { getSignedPrekeyById, consumeOPK } from './prekeyStore.js';
import {
  initiatorX3DH,
  responderX3DH,
  generateEphemeralECDHPair,
  exportECDHPubSpki
} from './x3dh.js';

/**
 * Attempt to bootstrap X3DH as the initiator for `peerId`. Returns `null` if
 * we have no cached bundle (caller should fall back to the plain DH hello).
 * On success:
 *   {
 *     sk,                  // Uint8Array(32) — seed for the Double Ratchet root key
 *     ekSpki,              // SPKI bytes of the fresh ephemeral ECDH pub
 *     spkId,               // bob's SPK id we DH'd against
 *     opkId,               // bob's OPK id we consumed, or null
 *     myX3dhIkSpki,        // our long-term X3DH ECDH pub SPKI
 *     myX3dhIkSig          // our ECDSA binding over myX3dhIkSpki
 *   }
 */
export async function deriveInitiatorBootstrap(peerId) {
  const cached = await getCachedBundle(peerId);
  if (!cached) return null;
  const { bundle } = cached;

  const myIdentity = await getOrCreateX3DHIdentity();
  const myX3dhIkSpki = await exportX3DHIdentityPubSpki();

  const ek = await generateEphemeralECDHPair();
  const ekSpki = await exportECDHPubSpki(ek.publicKey);

  const { sk } = await initiatorX3DH({
    IK_a_priv: myIdentity.privateKey,
    EK_a_priv: ek.privateKey,
    IK_b_spki: bundle.x3dhIdentitySpki,
    SPK_b_spki: bundle.spk.pub,
    OPK_b_spki: bundle.opk ? bundle.opk.pub : null
  });

  // One-shot: drop the cache so the next connection pulls a fresh bundle
  // (bob's OPK is now consumed on his side once he processes our hello).
  try { await deleteCachedBundle(peerId); } catch (_) {}

  return {
    sk,
    ekSpki,
    spkId: bundle.spk.id,
    opkId: bundle.opk ? bundle.opk.id : null,
    myX3dhIkSpki,
    myX3dhIkSig: myIdentity.bindingSig
  };
}

/**
 * Replay the X3DH DHs on bob's side. Returns `{ ok:true, sk }` on success or
 * `{ ok:false, reason }` on any failure (unknown SPK, already-consumed OPK,
 * malformed binding sig, etc.). Caller decides whether to abort the handshake
 * or fall back — in our wiring we hard-fail, since silently dropping to plain
 * DH would leave alice using a different bootstrap than bob.
 */
export async function deriveResponderBootstrap({
  senderIdSpki,
  senderX3dhIkSpki,
  senderX3dhIkSig,
  ekSpki,
  spkId,
  opkId = null
}) {
  if (!senderIdSpki || !senderX3dhIkSpki || !senderX3dhIkSig) {
    return { ok: false, reason: 'x3dh: missing sender identity fields' };
  }
  if (!ekSpki || !spkId) {
    return { ok: false, reason: 'x3dh: missing ek or spkId' };
  }

  const bindingOk = await verifyX3DHBinding(senderIdSpki, senderX3dhIkSpki, senderX3dhIkSig);
  if (!bindingOk) return { ok: false, reason: 'x3dh: sender binding invalid' };

  const spk = await getSignedPrekeyById(spkId);
  if (!spk) return { ok: false, reason: `x3dh: unknown spk ${spkId}` };

  let opkPriv = null;
  if (opkId) {
    const opk = await consumeOPK(opkId);
    if (!opk) return { ok: false, reason: `x3dh: unknown or consumed opk ${opkId}` };
    opkPriv = opk.privateKey;
  }

  const myIdentity = await getOrCreateX3DHIdentity();
  const { sk } = await responderX3DH({
    SPK_b_priv: spk.privateKey,
    IK_b_priv: myIdentity.privateKey,
    OPK_b_priv: opkPriv,
    IK_a_spki: senderX3dhIkSpki,
    EK_a_spki: ekSpki
  });
  return { ok: true, sk };
}
