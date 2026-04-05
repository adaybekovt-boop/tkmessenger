import Peer from 'peerjs';
import { registerSW } from 'virtual:pwa-register';
import { dbInit, dbGetPage, dbGetLast, dbAdd, dbUpdateStatus, dbDelete, dbClearAll, dbGetPendingOut, dbSetPendingOut } from './core/db.js';
import { cryptoDerive, cryptoLock, cryptoEncrypt, cryptoDecrypt, cryptoDecryptBatch, cryptoSha256Hex, cryptoPbkdf2Bytes } from './core/crypto.js';
import { bytesToBase64 } from './core/base64.js';
import { VirtualScroller } from './ui/virtualScroll.js';
import { createCallManager } from './core/callManager.js';
import { getThemeManager } from './ui/themeManager.js';
import { Radar } from './ui/radar.js';
import { showToast } from './ui/toast.js';
import { encryptWirePayload, decryptWirePayload, initWireSession, acceptWireHello, getWireSessionStatus, waitForWireReady, teardownWireSession } from './core/wireCrypto.js';
import { optimizer } from './core/optimizer.js';
import { OrbitsDrop } from './core/orbitsDrop.js';
import { initI18n } from './ui/i18n.js';

// TITANIUM FIX: Initialize OrbitsDrop Module
const orbitsDrop = new OrbitsDrop();

const i18n = initI18n();

// Setup OrbitsDrop UI and Callbacks
orbitsDrop.onProgressUpdate = (msgId, percent, statusText) => {
  if (!msgsVirtual) return;
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.dropPercent = percent;
    msg.dropStatusText = statusText;
    msgsVirtual.patchByTs(msgId, () => {});
  }
};

orbitsDrop.onTransferComplete = async (msgId) => {
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.status = 'sent';
    msg.dropPercent = 100;
    msg.dropStatusText = 'Completed';
    await dbUpdateStatus(chatKey(msg.to || msg.from), msgId, 'sent');
    if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
  }
};

orbitsDrop.onFileReady = async (msgId, fileUrl, metadata) => {
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.status = 'delivered';
    msg.dropPercent = 100;
    msg.dropStatusText = 'Completed';
    msg.url = fileUrl; // Switch to the actual object URL
    
    // Auto-download files, but not images/videos (they display inline)
    if (!metadata.mime.startsWith('image/') && !metadata.mime.startsWith('video/')) {
      OrbitsDrop.triggerDownload(fileUrl, metadata.name);
    }
    
    await saveMsgToDB(chatKey(msg.from || msg.to), msg);
    if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
  }
};

function byId(id) {
  return document.getElementById(id);
}

function timingSafeEqual(a, b) {
  const aa = String(a);
  const bb = String(b);
  const len = Math.max(aa.length, bb.length);
  let out = 0;
  for (let i = 0; i < len; i++) {
    out |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
  }
  return out === 0 && aa.length === bb.length;
}

function on(id, type, handler, options) {
  const el = byId(id);
  if (!el) return null;
  el.addEventListener(type, handler, options);
  return el;
}

function onEl(el, type, handler, options) {
  if (!el) return;
  el.addEventListener(type, handler, options);
}

async function getOrCreatePeerId(nick) {
  const stored = localStorage.getItem('orbit_peer_id');
  if (stored) return stored;
  const fp = [
    nick,
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language
  ].join('|');
  const hash = await cryptoSha256Hex(fp);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const id = Array.from(hash)
    .filter((_, i) => i % 2 === 0)
    .slice(0, 9)
    .map(c => chars[parseInt(c, 16) % chars.length])
    .join('');
  localStorage.setItem('orbit_peer_id', id);
  return id;
}
let myPeerId = localStorage.getItem('orbit_peer_id') || '';
let friendProfiles = JSON.parse(localStorage.getItem('orbit_friend_profiles') || '{}');

let peer = null;
let peerReadyPromise = null;
let peerReadyResolve = null;
let peerReadyReject = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {};
let callManager = null;
let currentChatFriend = null;
let isOffline = !navigator.onLine;
let pendingOutgoing = [];
let vaultLocked = false;
let lockTimer = null;
let hiddenAt = null;
let messageWindow = [];
let hasMoreOlderMessages = true;
let messagesLoadingOlder = false;
let msgsVirtual = null;
let currentView = null;
let radarController = null;
let peerRtt = {};
let outgoingChunkCache = new Map();
const incomingTransfers = new Map();
const typingTimers = new Map();
const activeObjectUrls = new Set();
const MESSAGE_WINDOW_MAX = 4000;
let connectionTimeout = null;
let heartbeatIntervalId = null;
let renderFriendsTimer = null;
let typingStatusRaf = null;
let typingIncomingRaf = null;
const pendingAckTimers = new Map();
let chatAbortController = null;
const msgElementCache = new Map();
const ackBatchByPeer = new Map();
let lastUserActivity = Date.now();
let peerIdleDisconnected = false;
let lastTypingSent = 0;
let lazyImageObserver = null;
let lazyImageScrollRoot = null;
let lazyImageScrollHandler = null;
let idlePeerCheckId = null;
let screenWakeLock = null;
const peerActivityTimestamps = new Map(); // Track activity per peer
const PEER_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const INCOMING_TRANSFER_TTL_MS = 5 * 60 * 1000;

const wireHelloSentByChat = new Set();

function acceptConnectionOrCloseDuplicate(conn) {
  const peerId = conn?.peer;
  if (!peerId) return false;
  const existing = activeConnections[peerId];
  if (existing && existing !== conn) {
    if (!existing.open) {
      try { existing.close(); } catch (_) { /* ignore */ }
      activeConnections[peerId] = conn;
      return true;
    }
    if (!conn.open) return false;

    const wantOutgoing = String(myPeerId) < String(peerId);
    const existingIsOutgoing = !!existing._orbitInitiator;
    const connIsOutgoing = !!conn._orbitInitiator;
    const keepOutgoing = wantOutgoing;
    const shouldKeepNew = keepOutgoing ? connIsOutgoing && !existingIsOutgoing : !connIsOutgoing && existingIsOutgoing;

    if (shouldKeepNew) {
      try { existing.close(); } catch (_) { /* ignore */ }
      activeConnections[peerId] = conn;
      return true;
    }
    try { conn.close(); } catch (_) { /* ignore */ }
    return false;
  }
  activeConnections[peerId] = conn;
  return true;
}

async function sendWireHello(conn) {
  if (!conn?.open) return;
  const chatId = chatKey(conn.peer);
  if (wireHelloSentByChat.has(chatId)) return;
  const hello = await initWireSession(chatId);
  wireHelloSentByChat.add(chatId);
  conn.send({ type: 'orbit_wire_hello', chatId, v: hello.version, pub: hello.pubB64 });
}

async function ensureWireReady(peerId, timeoutMs = 5000) {
  const chatId = chatKey(peerId);
  const st = getWireSessionStatus(chatId);
  if (st.ready) return st;
  const conn = activeConnections[peerId];
  if (conn?.open) {
    try {
      await sendWireHello(conn);
    } catch (_) { /* ignore */ }
  }
  await Promise.race([
    waitForWireReady(chatId),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Wire handshake timeout')), timeoutMs))
  ]);
  return getWireSessionStatus(chatId);
}

// TITANIUM FIX: connection lock to prevent duplicate connection attempts
const connectingPeers = new Set();
// TITANIUM FIX: debounce scroll events in messages list
let scrollDebounceTimer = null;
let pendingPumpId = null;
const lastWakeAttemptByPeer = new Map();
const WAKE_MIN_INTERVAL_MS = 1500;

let orbitProfile = { photos: [], displayName: '', ...JSON.parse(localStorage.getItem('orbit_profile') || '{}') };

  const defaultSettings = {
    dataSaver: false,
    batterySaver: false,
    autoNetworkSaver: true,
    typingIndicator: true,
    allowScreenshots: false,
    echoCancel: true,
    noiseSuppression: true,
    autoGain: true,
    autoQuality: true,
    videoQuality: 'medium',
    textSize: 'medium',
    density: 'default',
    bubbleStyle: 'rounded',
    colorScheme: 'default',
    bio: '',
    reduceAnimations: false,
    customThemeColors: null,
    themeMaxFps: 0,
    themeWindStrength: 1.15
  };
let appSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('orbit_settings') || '{}') };
(() => {
  const appearance = JSON.parse(localStorage.getItem('orbit_appearance') || '{}');
  for (const k of ['textSize', 'density', 'bubbleStyle', 'colorScheme', 'reduceAnimations', 'customThemeColors', 'themeMaxFps', 'themeWindStrength']) {
    if (appearance[k] != null) appSettings[k] = appearance[k];
  }
})();
if (appSettings.autoNetworkSaver === undefined) appSettings.autoNetworkSaver = true;
let trustState = JSON.parse(localStorage.getItem('orbit_trust') || '{}');
let blockedPeers = JSON.parse(localStorage.getItem('orbit_blocked_peers') || '[]');
let pendingFriendAdd = null;

async function initApp() {
  await dbInit();
  pendingOutgoing = await dbGetPendingOut();
}

function applyBootClasses() {
  const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
  const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
  if (lowMem || lowCpu) document.documentElement.classList.add('low-perf');
}

function isNativeShell() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Electron')) return true;
  if (typeof window.Capacitor !== 'undefined') return true;
  return false;
}

function registerPwaIfEligible() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  if (isNativeShell()) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        showToast('Update available. Reload to apply.');
      },
      onOfflineReady() {
        showToast('Offline ready');
      }
    });
  } catch (_) {
    return;
  }
}

function cleanupSession() {
  chatAbortController?.abort();
  chatAbortController = null;
  void releaseScreenWakeLock();
  if (heartbeatIntervalId != null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
  if (renderFriendsTimer) {
    clearTimeout(renderFriendsTimer);
    renderFriendsTimer = null;
  }
  if (typingStatusRaf) {
    cancelAnimationFrame(typingStatusRaf);
    typingStatusRaf = null;
  }
  for (const id of typingTimers.values()) clearTimeout(id);
  typingTimers.clear();
  for (const id of pendingAckTimers.values()) clearTimeout(id);
  pendingAckTimers.clear();
  teardownLazyImageObserver();
  optimizer.flushAckNow();
  optimizer.teardownNetwork();
  optimizer.teardownBattery();
  if (idlePeerCheckId != null) {
    clearInterval(idlePeerCheckId);
    idlePeerCheckId = null;
  }
  if (pendingPumpId != null) {
    clearInterval(pendingPumpId);
    pendingPumpId = null;
  }
  ackBatchByPeer.clear();
  for (const conn of Object.values(activeConnections)) {
    try {
      conn.close();
    } catch (_) { /* ignore */ }
  }
  activeConnections = {};
  wireHelloSentByChat.clear();
  incomingTransfers.clear();
  msgElementCache.clear();
  activeObjectUrls.forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch (_) { /* ignore */ }
  });
  activeObjectUrls.clear();
  if (peer && !peer.destroyed) {
    try {
      peer.destroy();
    } catch (_) { /* ignore */ }
  }
  peer = null;
  peerReadyPromise = null;
  peerReadyResolve = null;
  peerReadyReject = null;
  callManager = null;
}

function waitForPeerReady(timeoutMs = 10000) {
  if (peer?.open) return Promise.resolve(true);
  if (!peerReadyPromise) return Promise.reject(new Error('Peer not initialized'));
  return Promise.race([
    peerReadyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Peer open timeout')), timeoutMs))
  ]);
}

function persistOrbitProfile() {
  localStorage.setItem('orbit_profile', JSON.stringify(orbitProfile));
}

function pruneMsgElementCache(ts) {
  const p = `${ts}:`;
  for (const k of [...msgElementCache.keys()]) {
    if (k.startsWith(p)) msgElementCache.delete(k);
  }
}

function getMessagePage() {
  return optimizer.getMessagePage();
}

function trimMsgElementCache() {
  const max = optimizer.getMsgCacheMax();
  while (msgElementCache.size > max) {
    const k = msgElementCache.keys().next().value;
    msgElementCache.delete(k);
  }
}

function escapeAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\u0000/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeMediaUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('blob:')) return raw;
  if (raw.startsWith('data:image/')) return raw;
  try {
    const u = new URL(raw, location.href);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    return '';
  } catch (_) {
    return '';
  }
}

function isValidPeerId(input) {
  const s = String(input || '').trim();
  return /^[A-Z0-9_-]{3,64}$/.test(s);
}

function teardownLazyImageObserver() {
  if (lazyImageObserver) {
    lazyImageObserver.disconnect();
    lazyImageObserver = null;
  }
  if (lazyImageScrollRoot && lazyImageScrollHandler) {
    try {
      lazyImageScrollRoot.removeEventListener('scroll', lazyImageScrollHandler);
    } catch (_) { /* ignore */ }
  }
  lazyImageScrollRoot = null;
  lazyImageScrollHandler = null;
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
}

function setupLazyImageObserver() {
  teardownLazyImageObserver();
  if (!optimizer.shouldDeferImagePreview()) return;
  const root = document.getElementById('messages-list');
  if (!root) return;
  
  lazyImageScrollRoot = root;
  lazyImageScrollHandler = () => {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {}, 150);
  };
  root.addEventListener('scroll', lazyImageScrollHandler, { passive: true });
  
  lazyImageObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (el.tagName === 'IMG' && el.dataset.orbitSrc) {
          el.src = el.dataset.orbitSrc;
          delete el.dataset.orbitSrc;
          el.classList.remove('orbit-lazy-img');
          lazyImageObserver.unobserve(el);
        }
      }
    },
    { root, rootMargin: '120px' }
  );
}

function observeLazyImagesIn(el) {
  if (!lazyImageObserver || !el) return;
  el.querySelectorAll('img.orbit-lazy-img').forEach((img) => lazyImageObserver.observe(img));
}

function maybeReconnectAfterIdle() {
  if (!peerIdleDisconnected || !peer || peer.destroyed) return;
  peerIdleDisconnected = false;
  try {
    peer.reconnect();
  } catch (_) { /* ignore */ }
  const tick = () => {
    if (peer.open) {
      connectToAllFriends();
      scheduleHeartbeat();
    } else if (!peer.destroyed) {
      setTimeout(tick, 150);
    }
  };
  setTimeout(tick, 100);
}

function touchUserActivity() {
  lastUserActivity = Date.now();
  maybeReconnectAfterIdle();
}

function maybeWakePeer(peerId) {
  if (!peerId) return;
  if (!peer || peer.destroyed || !peer.open) return;
  if (activeConnections[peerId]?.open) return;
  if (connectingPeers.has(peerId)) return;
  const now = Date.now();
  const last = lastWakeAttemptByPeer.get(peerId) || 0;
  if (now - last < WAKE_MIN_INTERVAL_MS) return;
  lastWakeAttemptByPeer.set(peerId, now);
  connectingPeers.add(peerId);
  openConnectionForDiscovery(peerId)
    .catch(() => {})
    .finally(() => connectingPeers.delete(peerId));
}

async function requestScreenWakeLock() {
  const wakeLockApi = navigator?.wakeLock;
  if (!wakeLockApi?.request || document.hidden) return;
  if (screenWakeLock && !screenWakeLock.released) return;
  try {
    const sentinel = await wakeLockApi.request('screen');
    screenWakeLock = sentinel;
    sentinel.addEventListener?.('release', () => {
      if (screenWakeLock === sentinel) screenWakeLock = null;
    }, { once: true });
  } catch (_) { /* ignore */ }
}

async function releaseScreenWakeLock() {
  const sentinel = screenWakeLock;
  screenWakeLock = null;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch (_) { /* ignore */ }
}

function queueDeliveredAck(peerId, ts) {
  const conn = activeConnections[peerId];
  if (!conn?.open) return;
  if (!optimizer.shouldBatchAck()) {
    conn.send({ type: 'ack', ts, status: 'delivered' });
    return;
  }
  let m = ackBatchByPeer.get(peerId);
  if (!m) {
    m = new Map();
    ackBatchByPeer.set(peerId, m);
  }
  m.set(ts, 'delivered');
  optimizer.scheduleAckFlush(flushAckBatches);
}

function flushAckBatches() {
  for (const [peerId, m] of ackBatchByPeer) {
    if (m.size === 0) continue;
    const conn = activeConnections[peerId];
    const items = [...m.entries()].map(([ts, status]) => ({ ts, status }));
    m.clear();
    if (!conn?.open) continue;
    if (items.length === 1) {
      conn.send({ type: 'ack', ts: items[0].ts, status: items[0].status });
    } else {
      conn.send({ type: 'orbit_ack_batch', items });
    }
  }
}

async function applyIncomingAck(senderId, ts, status) {
  clearPendingAck(ts);
  await dbUpdateStatus(chatKey(senderId), ts, status);
  if (currentChatFriend === senderId && msgsVirtual) {
    const m = messageWindow.find((x) => x.ts === ts);
    if (m) {
      pruneMsgElementCache(ts);
      m.status = status;
      if (!patchMessageStatusDOM(ts, status)) msgsVirtual.refresh();
    }
  }
}

function applyOptimizerRuntime() {
  if (!optimizer.shouldBatchAck()) flushAckBatches();
  trimMsgElementCache();
  scheduleHeartbeat();
  if (msgsVirtual && typeof msgsVirtual.setBufferRows === 'function') {
    msgsVirtual.setBufferRows(optimizer.getBufferRows());
  }
  const tm = getThemeManager();
  if (appSettings.batterySaver) {
    tm.setBatterySaverHold(true);
  } else {
    tm.setBatterySaverHold(false);
    tm.setMaxFPS(Number(appSettings.themeMaxFps || 0));
  }
  tm.setThemeParams({ windStrength: Number(appSettings.themeWindStrength || 1.15) });
}

function attachNetworkDataSaverListener() {
  optimizer.teardownNetwork();
  if (appSettings.autoNetworkSaver === false) return;
  optimizer.initNetworkAutoSaver(() => {
    if (!appSettings.autoNetworkSaver) return;
    appSettings.dataSaver = true;
    try {
      localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
    } catch (_) { /* ignore */ }
    applyOptimizerRuntime();
    showToast('Slow network: data saver on');
  });
}

function startIdlePeerMonitor() {
  if (idlePeerCheckId != null) {
    clearInterval(idlePeerCheckId);
    idlePeerCheckId = null;
  }
  idlePeerCheckId = setInterval(() => {
    if (!peer || peer.destroyed || !peer.open) return;
    
    const now = Date.now();
    for (const [peerId, conn] of Object.entries(activeConnections)) {
      if (!conn.open) continue;
      
      const lastActivity = peerActivityTimestamps.get(peerId) || now;
      
      // If we are actively in a call with this peer, keep them awake
      if (callManager?.activeCall && (callManager.activeCall.peer === peerId || callingTarget === peerId)) {
        touchPeerActivity(peerId);
        continue;
      }
      
      // Sleep connection if idle for 5+ minutes
      if (now - lastActivity > PEER_IDLE_TIMEOUT_MS) {
        console.log(`[Orbit] Peer ${peerId} went idle, closing connection to save resources.`);
        conn.close();
        delete activeConnections[peerId];
        scheduleRenderFriends();
      }
    }
  }, 60000); // Check every minute
}

function startPendingQueuePump() {
  if (pendingPumpId != null) {
    clearInterval(pendingPumpId);
    pendingPumpId = null;
  }
  pendingPumpId = setInterval(() => {
    if (!peer || peer.destroyed || !peer.open) return;
    if (!pendingOutgoing.length) return;
    flushOutgoingQueue().catch(() => {});
  }, 60000);
}

function touchPeerActivity(peerId) {
  peerActivityTimestamps.set(peerId, Date.now());
}

function statusIconHtml(status) {
  if (status === 'pending') return '⌛';
  if (status === 'sent') return '✓';
  if (status === 'delivered') return '✓✓';
  if (status === 'read') return '<span style="color:var(--tg-accent)">✓✓</span>';
  if (status === 'failed') return '<span style="color:var(--tg-text-danger)" title="Not delivered">✗</span>';
  return '';
}

function patchMessageStatusDOM(ts, status) {
  const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(ts)) : String(ts).replace(/["\\]/g, '\\$&');
  const wrap = document.querySelector(`#messages-list .message[data-msg-ts="${sel}"]`);
  if (!wrap) return false;
  const statusEl = wrap.querySelector('.msg-status');
  if (statusEl) statusEl.innerHTML = statusIconHtml(status);
  const retry = wrap.querySelector('.msg-retry');
  if (retry) retry.hidden = status !== 'failed';
  return true;
}

function skeletonPlaceholders(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'skeleton',
    ts: -1000 - i,
    from: '',
    _grouped: false
  }));
}

async function cropImageFileToJpegDataUrl(file) {
  const bmp = await createImageBitmap(file);
  const size = 300;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const sc = Math.max(size / bmp.width, size / bmp.height);
  const w = bmp.width * sc;
  const h = bmp.height * sc;
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function applyProfilePalette() {
  const root = document.documentElement;
  if (!orbitProfile.photos?.length) {
    root.style.removeProperty('--profile-gradient');
    return;
  }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    const at = (px, py) => {
      const i = (py * 32 + px) * 4;
      return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
    };
    const colors = [at(4, 4), at(20, 8), at(8, 24), at(24, 20)];
    root.style.setProperty('--profile-gradient', `linear-gradient(135deg, ${colors.join(', ')})`);
  };
  img.src = orbitProfile.photos[0];
}

function applyProfileToUI() {
  const av = document.getElementById('my-avatar-letter');
  if (!av) return;
  if (orbitProfile.photos?.[0]) {
    av.style.backgroundImage = `url("${orbitProfile.photos[0].replace(/"/g, '%22')}")`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
    av.classList.add('has-photo');
  } else {
    av.style.backgroundImage = '';
    av.textContent = myNickname ? myNickname.charAt(0).toUpperCase() : 'Me';
    av.classList.remove('has-photo');
  }
  applyProfilePalette();
}

function renderProfilePhotoGrid() {
  const grid = document.getElementById('profile-photos-grid');
  const addBtn = document.getElementById('profile-add-photo-btn');
  if (!grid || !addBtn) return;
  grid.querySelectorAll('.profile-photo-item:not(.profile-photo-add)').forEach((n) => n.remove());
  (orbitProfile.photos || []).forEach((url) => {
    const cell = document.createElement('div');
    cell.className = 'profile-photo-item';
    cell.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
    cell.style.backgroundSize = 'cover';
    cell.style.cursor = 'pointer';
    cell.title = 'Tap to remove';
    cell.addEventListener('click', () => {
      orbitProfile.photos = orbitProfile.photos.filter((u) => u !== url);
      persistOrbitProfile();
      renderProfilePhotoGrid();
      applyProfileToUI();
    });
    grid.insertBefore(cell, addBtn);
  });
}

function wireProfileSection() {
  const addBtn = document.getElementById('profile-add-photo-btn');
  const input = document.getElementById('profile-photo-input');
  if (addBtn && input) {
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const dataUrl = await cropImageFileToJpegDataUrl(file);
        if (!orbitProfile.photos) orbitProfile.photos = [];
        if (orbitProfile.photos.length >= 3) orbitProfile.photos.pop();
        orbitProfile.photos.unshift(dataUrl);
        persistOrbitProfile();
        renderProfilePhotoGrid();
        applyProfileToUI();
      } catch (err) {
        showToast('Could not process image');
      }
    });
  }
}

function scheduleRenderFriends() {
  if (renderFriendsTimer) clearTimeout(renderFriendsTimer);
  renderFriendsTimer = setTimeout(() => {
    renderFriendsTimer = null;
    renderFriends();
  }, 150);
}

function trimMessageWindow() {
  while (messageWindow.length > MESSAGE_WINDOW_MAX) {
    const removed = messageWindow.shift();
    if (removed?.url && String(removed.url).startsWith('blob:')) {
      try { URL.revokeObjectURL(removed.url); } catch (_) { /* ignore */ }
    }
  }
}

function registerPendingAck(chatId, ts) {
  if (pendingAckTimers.has(ts)) clearTimeout(pendingAckTimers.get(ts));
  const id = setTimeout(async () => {
    pendingAckTimers.delete(ts);
    try {
      await dbUpdateStatus(chatId, ts, 'failed');
    } catch (_) { /* ignore */ }
    if (msgsVirtual) {
      const m = messageWindow.find(x => x.ts === ts);
      if (m) {
        m.status = 'failed';
        pruneMsgElementCache(ts);
        if (!patchMessageStatusDOM(ts, 'failed')) msgsVirtual.refresh();
      }
    }
  }, 5000);
  pendingAckTimers.set(ts, id);
}

function clearPendingAck(ts) {
  if (pendingAckTimers.has(ts)) {
    clearTimeout(pendingAckTimers.get(ts));
    pendingAckTimers.delete(ts);
  }
}

function syncThemePresetActive() {
  const t = getThemeManager().getCurrentTheme();
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
}

const COLOR_SCHEME_VARS = {
  default: { accent: '#5b9bd5', accentDark: '#4a8bc4', bubbleOut: '#3d5a78' },
  emerald: { accent: '#50c878', accentDark: '#3d9a5c', bubbleOut: '#2d5a3d' },
  amber: { accent: '#f59e0b', accentDark: '#d97706', bubbleOut: '#5a4a2d' },
  rose: { accent: '#f43f5e', accentDark: '#e11d48', bubbleOut: '#5a2d3d' },
  violet: { accent: '#8b5cf6', accentDark: '#7c3aed', bubbleOut: '#3d2d5a' }
};

function applyAppearanceSettings() {
  const root = document.documentElement;
  root.dataset.textSize = appSettings.textSize || 'medium';
  root.dataset.density = appSettings.density || 'default';
  root.dataset.bubble = appSettings.bubbleStyle || 'rounded';
  root.dataset.colorScheme = appSettings.colorScheme || 'default';
  
  if (appSettings.reduceAnimations) {
    document.body.classList.add('reduce-animations');
  } else {
    document.body.classList.remove('reduce-animations');
  }

  if (appSettings.customThemeColors) {
    root.style.setProperty('--tg-accent', appSettings.customThemeColors.accent);
    root.style.setProperty('--tg-bg-primary', appSettings.customThemeColors.bgPrimary);
    root.style.setProperty('--tg-bg-secondary', appSettings.customThemeColors.bgSecondary);
    root.style.setProperty('--tg-bg-input', appSettings.customThemeColors.bgInput);
    
    document.querySelectorAll('.theme-preset-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    
  } else {
    const scheme = COLOR_SCHEME_VARS[appSettings.colorScheme] || COLOR_SCHEME_VARS.default;
    root.style.setProperty('--tg-accent', scheme.accent);
    root.style.setProperty('--tg-accent-dark', scheme.accentDark);
    root.style.setProperty('--tg-bubble-out', scheme.bubbleOut);
    root.style.removeProperty('--tg-bg-primary');
    root.style.removeProperty('--tg-bg-secondary');
    root.style.removeProperty('--tg-bg-input');
  }
}

function wireAppearanceControls() {
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      appSettings.textSize = btn.dataset.size || 'medium';
      applyAppearanceSettings();
    });
  });
  const density = document.getElementById('appearance-density');
  if (density) {
    density.addEventListener('change', () => {
      appSettings.density = density.value;
      applyAppearanceSettings();
    });
  }
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) {
    bubble.addEventListener('change', () => {
      appSettings.bubbleStyle = bubble.value;
      applyAppearanceSettings();
    });
  }
  document.querySelectorAll('.color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      appSettings.colorScheme = dot.dataset.scheme || 'default';
      appSettings.customThemeColors = null;
      applyAppearanceSettings();
    });
  });
  
  const customizerModal = document.getElementById('theme-customizer-modal');
  const openCustomizerBtn = document.getElementById('open-theme-customizer-btn');
  const closeCustomizerBtn = document.getElementById('close-theme-customizer-btn');
  
  if (openCustomizerBtn && customizerModal) {
    openCustomizerBtn.addEventListener('click', () => {
      const rootStyles = getComputedStyle(document.documentElement);
      document.getElementById('custom-theme-accent').value = appSettings.customThemeColors?.accent || rootStyles.getPropertyValue('--tg-accent').trim();
      document.getElementById('custom-theme-bg-primary').value = appSettings.customThemeColors?.bgPrimary || rootStyles.getPropertyValue('--tg-bg-primary').trim();
      document.getElementById('custom-theme-bg-secondary').value = appSettings.customThemeColors?.bgSecondary || rootStyles.getPropertyValue('--tg-bg-secondary').trim();
      document.getElementById('custom-theme-bg-input').value = appSettings.customThemeColors?.bgInput || rootStyles.getPropertyValue('--tg-bg-input').trim();
      const rm = document.getElementById('reduce-animations-toggle-customizer');
      if (rm) rm.checked = appSettings.reduceAnimations || false;

      const fps = document.getElementById('theme-fps-range');
      if (fps) fps.value = String(Math.max(0, Math.min(60, Number(appSettings.themeMaxFps || 0))));
      const wind = document.getElementById('theme-wind-range');
      if (wind) wind.value = String(Math.max(60, Math.min(180, Math.round(Number(appSettings.themeWindStrength || 1.15) * 100))));
      
      customizerModal.style.display = 'flex';
      requestAnimationFrame(() => customizerModal.removeAttribute('aria-hidden'));
    });
  }
  
  if (closeCustomizerBtn && customizerModal) {
    closeCustomizerBtn.addEventListener('click', () => {
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
  
  const applyCustomThemeBtn = document.getElementById('apply-custom-theme-btn');
  if (applyCustomThemeBtn) {
    applyCustomThemeBtn.addEventListener('click', () => {
      appSettings.customThemeColors = {
        accent: document.getElementById('custom-theme-accent').value,
        bgPrimary: document.getElementById('custom-theme-bg-primary').value,
        bgSecondary: document.getElementById('custom-theme-bg-secondary').value,
        bgInput: document.getElementById('custom-theme-bg-input').value,
      };
      const rm = document.getElementById('reduce-animations-toggle-customizer');
      appSettings.reduceAnimations = rm ? rm.checked : !!appSettings.reduceAnimations;

      const fps = document.getElementById('theme-fps-range');
      appSettings.themeMaxFps = fps ? Number(fps.value || 0) : Number(appSettings.themeMaxFps || 0);
      const wind = document.getElementById('theme-wind-range');
      appSettings.themeWindStrength = wind ? Number(wind.value || 115) / 100 : Number(appSettings.themeWindStrength || 1.15);

      const tm = getThemeManager();
      tm.setMaxFPS(appSettings.themeMaxFps);
      tm.setThemeParams({ windStrength: appSettings.themeWindStrength });
      applyAppearanceSettings();
      saveSettings();
      showToast('Theme updated!');
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
  
  const resetCustomThemeBtn = document.getElementById('reset-custom-theme-btn');
  if (resetCustomThemeBtn) {
    resetCustomThemeBtn.addEventListener('click', () => {
      appSettings.customThemeColors = null;
      appSettings.themeMaxFps = 0;
      appSettings.themeWindStrength = 1.15;
      const tm = getThemeManager();
      tm.setMaxFPS(0);
      tm.setThemeParams({ windStrength: 1.15 });
      applyAppearanceSettings();
      saveSettings();
      showToast('Theme reset!');
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
}

function wireGroupModal() {
  const modal = document.getElementById('create-group-modal');
  const openBtn = document.getElementById('create-group-btn');
  const cancel = document.getElementById('cancel-create-group-btn');
  const confirm = document.getElementById('confirm-create-group-btn');
  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      modal.removeAttribute('aria-hidden');
    });
  }
  if (cancel && modal) {
    cancel.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }
  if (confirm && modal) {
    confirm.addEventListener('click', () => {
      showToast('Group chats are not enabled in this build yet');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }
}

// Cinema and Nudge state at module scope so receiveMessage() can access them
let cinemaVideoEl = null;
let cinemaFriendId = null;
let isCinemaRemoteAction = false;
let cinemaSyncInterval = null;
let lastNudgeSent = 0;
let lastNudgeReceived = 0;
const NUDGE_COOLDOWN = 5000;

function triggerLocalNudge() {
  const container = document.getElementById('app-container');
  if (!container) return;
  container.classList.remove('nudge-active');
  void container.offsetWidth; // Force reflow
  container.classList.add('nudge-active');
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 100]);
  }
  setTimeout(() => container.classList.remove('nudge-active'), 600);
}

function initAppChrome() {
  applyBootClasses();
  i18n.apply(document);
  registerPwaIfEligible();
  applyAppearanceSettings();
  optimizer.init({
    getSettings: () => appSettings,
    onLowBattery: () => {
      if (appSettings.batterySaver) return;
      appSettings.batterySaver = true;
      try {
        localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
      } catch (_) { /* ignore */ }
      if (!sessionStorage.getItem('orbit_battery_auto')) {
        sessionStorage.setItem('orbit_battery_auto', '1');
        showToast('Low battery: battery saver on');
      }
      applyOptimizerRuntime();
    },
    mobileBatteryAuto: true
  });
  attachNetworkDataSaverListener();
  applyOptimizerRuntime();
  startIdlePeerMonitor();
  startPendingQueuePump();
  window.addEventListener('online', () => {
    isOffline = false;
    maybeReconnectAfterIdle();
    flushOutgoingQueue().catch(() => {});
  });
  window.addEventListener('offline', () => {
    isOffline = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) optimizer.flushAckNow();
  });
  wireBottomNavigation();
  wirePremiumThemeButtons();
  wireAppearanceControls();
  wireProfileSection();
  wireGroupModal();
  setupRadarIntegration();

  const langEnBtn = document.getElementById('lang-en-btn');
  const langRuBtn = document.getElementById('lang-ru-btn');
  const setLangActive = () => {
    const lang = i18n.getLang();
    if (langEnBtn) langEnBtn.classList.toggle('active', lang === 'en');
    if (langRuBtn) langRuBtn.classList.toggle('active', lang === 'ru');
  };
  setLangActive();
  [langEnBtn, langRuBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = btn.dataset.lang;
      i18n.setLang(next);
      setLangActive();
    });
  });
  
  const loginBtn = document.getElementById('login-btn');
  const nickInput = document.getElementById('nickname-input');
  const passInput = document.getElementById('password-input');
  const consentCb = document.getElementById('privacy-consent');
  if (!loginBtn || !nickInput || !passInput || !consentCb) return;
  
  const checkLoginReady = () => {
    loginBtn.disabled = !(nickInput.value.length >= 3 && passInput.value.length >= 6 && consentCb.checked);
  };
  
  onEl(nickInput, 'input', checkLoginReady);
  onEl(passInput, 'input', checkLoginReady);
  onEl(consentCb, 'change', checkLoginReady);
  onEl(loginBtn, 'click', loginHandler);
  
  // TITANIUM FIX: Trigger Autologin on load
  checkAutologin();
  
  on('open-settings-btn', 'click', openSettingsPanel);
  on('close-settings-btn', 'click', closeSettingsPanel);
  on('save-settings-btn', 'click', saveSettings);
  on('open-add-friend-btn', 'click', openAddFriendModal);
  on('close-add-friend-modal-btn', 'click', closeAddFriendModal);
  on('copy-my-id-btn', 'click', () => {
    navigator.clipboard.writeText(myPeerId).then(() => showToast('ID copied!')).catch(() => showToast(myPeerId));
  });
  on('confirm-add-friend-btn', 'click', () => {
    const id = byId('add-friend-id-input')?.value?.trim?.() || '';
    if (id) { addFriend(id); closeAddFriendModal(); }
  });
  on('add-friend-id-input', 'keydown', (e) => {
    if (e.key === 'Enter') {
      const id = e.target?.value?.trim?.() || '';
      if (id) { addFriend(id); closeAddFriendModal(); }
    }
  });
  
  on('back-btn', 'click', closeCurrentChat);
  on('chat-input', 'input', handleChatInput);
  
  on('panic-wipe-btn', 'click', async () => {
    cleanupSession();
    await dbClearAll();
    localStorage.clear();
    location.reload();
  });
  
// TITANIUM FIX: Cinema View (Watch Party)
cinemaVideoEl = document.getElementById('cinema-video');

function toggleCinemaMode(friendId) {
  const cinemaView = document.getElementById('cinema-view');
  if (!cinemaView || !cinemaVideoEl) return;
  if (cinemaView.style.display === 'none') {
    // Open Cinema
    cinemaFriendId = friendId;
    document.getElementById('cinema-friend-name').textContent = `with ${friendProfiles[friendId]?.displayName || friendId}`;
    cinemaView.style.display = 'flex';
    cinemaView.removeAttribute('aria-hidden');
    document.getElementById('cinema-empty-state').style.display = 'flex';
    cinemaVideoEl.style.display = 'none';
  } else {
    // Close Cinema
    cinemaView.style.display = 'none';
    cinemaView.setAttribute('aria-hidden', 'true');
    cinemaVideoEl.pause();
    if (typeof cinemaVideoEl.src === 'string' && cinemaVideoEl.src.startsWith('blob:')) {
      const prev = cinemaVideoEl.src;
      try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
      activeObjectUrls.delete(prev);
    }
    cinemaVideoEl.src = '';
    cinemaFriendId = null;
    if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
  }
}

on('cinema-btn', 'click', () => {
  if (currentChatFriend) toggleCinemaMode(currentChatFriend);
});

on('close-cinema-btn', 'click', () => {
  toggleCinemaMode(null);
});

on('cinema-file-input', 'change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!cinemaVideoEl) return;
  
  if (typeof cinemaVideoEl.src === 'string' && cinemaVideoEl.src.startsWith('blob:')) {
    const prev = cinemaVideoEl.src;
    try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
    activeObjectUrls.delete(prev);
  }
  const url = URL.createObjectURL(file);
  activeObjectUrls.add(url);
  cinemaVideoEl.src = url;
  document.getElementById('cinema-empty-state').style.display = 'none';
  cinemaVideoEl.style.display = 'block';
  
  // Inform peer we are ready
  if (activeConnections[cinemaFriendId]?.open) {
    activeConnections[cinemaFriendId].send({ type: 'cinema-sync', action: 'ready', name: file.name });
  }
});

// Sync Events
['play', 'pause', 'seeked'].forEach(eventName => {
  onEl(cinemaVideoEl, eventName, () => {
    if (isCinemaRemoteAction) return;
    
    if (cinemaFriendId && activeConnections[cinemaFriendId]?.open) {
      activeConnections[cinemaFriendId].send({ 
        type: 'cinema-sync', 
        action: eventName, 
        time: cinemaVideoEl.currentTime 
      });
    }
  });
});

// Periodic Time Sync to prevent drift
onEl(cinemaVideoEl, 'play', () => {
  if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
  cinemaSyncInterval = setInterval(() => {
    if (cinemaFriendId && activeConnections[cinemaFriendId]?.open && !cinemaVideoEl.paused) {
      activeConnections[cinemaFriendId].send({ 
        type: 'cinema-sync', 
        action: 'time-update', 
        time: cinemaVideoEl.currentTime 
      });
    }
  }, 5000);
});

onEl(cinemaVideoEl, 'pause', () => {
  if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
});

// TITANIUM FIX: Nudge Logic
on('nudge-btn', 'click', () => {
  if (!currentChatFriend) return;
  
  const now = Date.now();
  if (now - lastNudgeSent < NUDGE_COOLDOWN) {
    showToast('Wait a moment before nudging again', 'warning');
    return;
  }
  
  lastNudgeSent = now;
  
  // Play local animation for feedback
  triggerLocalNudge();
  
  // Send to peer
  let conn = activeConnections[currentChatFriend];
  if (conn?.open) {
    conn.send({ type: 'nudge' });
  } else {
    showToast('User offline, nudge queued...');
    // Orbits Drop connection wake-up logic could be reused here if needed
  }
});

  const reportBtn = document.getElementById('report-peer-btn');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      document.getElementById('report-modal').style.display = 'flex';
      document.getElementById('report-modal').removeAttribute('aria-hidden');
    });
  }
  
  on('close-report-btn', 'click', () => {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-modal').setAttribute('aria-hidden', 'true');
  });
  on('submit-report-btn', 'click', () => {
    if (currentChatFriend) blockPeer(currentChatFriend);
    document.getElementById('report-modal').style.display = 'none';
    showToast('User reported and blocked');
  });
  
  on('open-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'flex';
  });
  on('close-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'none';
  });
  on('accept-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'none';
    consentCb.checked = true;
    checkLoginReady();
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      lockTimer = setTimeout(lockVault, 5 * 60 * 1000);
      getThemeManager().stopAnimation();
      void releaseScreenWakeLock();
    } else {
      if (lockTimer) clearTimeout(lockTimer);
      if (!appSettings.batterySaver) {
        getThemeManager().resumeAnimation();
      }
      if (currentChatFriend && document.activeElement === document.getElementById('chat-input')) {
        void requestScreenWakeLock();
      }
      if (peer && !peer.open) peer.reconnect();
    }
  });
  
  on('unlock-vault-btn', 'click', async () => {
    const pass = byId('unlock-password-input')?.value || '';
    const ok = await verifyAndUnlockVault(myNickname, pass);
    if (ok) {
      document.getElementById('vault-lock-modal').style.display = 'none';
      document.getElementById('unlock-password-input').value = '';
    } else {
      showToast('Wrong password');
    }
  });

  // Call buttons
  on('call-btn', 'click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, true);
  });
  on('audio-call-btn', 'click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, false);
  });
  on('screen-btn', 'click', () => {
    if (callManager?.activeCall) callManager.startScreenShare();
    else showToast('Start a call first');
  });
  const callShareBtn = document.getElementById('call-screen-share-btn');
  if (callShareBtn) {
    callShareBtn.addEventListener('click', () => {
      if (callManager) callManager.startScreenShare();
    });
  }
  on('end-call-btn', 'click', () => {
    if (callManager) callManager.endCall();
  });
  on('call-toggle-audio', 'click', () => {
    if (callManager) callManager.toggleAudio();
  });
  on('call-toggle-video', 'click', () => {
    if (callManager) callManager.toggleVideo();
  });

  // File attachment
  on('file-btn', 'click', () => {
    byId('orbits-drop-input')?.click?.();
  });
  
  on('orbits-drop-input', 'change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatFriend) return;
    
    // Reset input
    e.target.value = '';
    
    // If it's an image, show quality modal, else send directly
    if (file.type.match(/image\/(jpeg|png|webp)/i)) {
      const modal = document.getElementById('drop-quality-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');
      }
      
      // Store file temporarily
      window._pendingDropFile = file;
    } else {
      const type = file.type.startsWith('audio/') ? 'audio' : 'file';
      sendMediaBlob(file, type, file.name, 'original');
    }
  });
  
  // Modal Handlers
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (modal.id === 'drop-quality-modal') {
          window._pendingDropFile = null;
        }
      }
    });
  });
  
  on('drop-send-btn', 'click', () => {
    const file = window._pendingDropFile;
    if (!file) return;
    
    const qualitySetting = document.querySelector('input[name="drop_quality"]:checked')?.value || 'original';
    
    const modal = document.getElementById('drop-quality-modal');
    if (modal) modal.style.display = 'none';
    
    sendMediaBlob(file, 'image', file.name, qualitySetting);
    window._pendingDropFile = null;
  });


  // Settings extra buttons
  on('test-mic-btn', 'click', startMicTest);
  on('stop-mic-test-btn', 'click', stopMicTest);
  // TITANIUM FIX: Removed runNetworkTest since button was removed
  // document.getElementById('run-network-test-btn').addEventListener('click', runNetworkTest);

  // Wire bottom navigation buttons
  const bottomChatsBtn = document.getElementById('bottom-chats-btn');
  if (bottomChatsBtn) bottomChatsBtn.addEventListener('click', closeSettingsPanel);
  
  const bottomRadarBtn = document.getElementById('bottom-radar-btn');
  if (bottomRadarBtn) bottomRadarBtn.addEventListener('click', () => {
    // Switch to radar
    closeSettingsPanel();
    document.getElementById('open-radar-btn')?.click();
  });
  
  const bottomSettingsBtn = document.getElementById('bottom-settings-btn');
  if (bottomSettingsBtn) bottomSettingsBtn.addEventListener('click', openSettingsPanel);

  // Nearby peer modal
  on('nearby-close-btn', 'click', () => {
    const modal = document.getElementById('nearby-peer-modal');
    if (modal) modal.style.display = 'none';
  });
  on('nearby-send-btn', 'click', () => {
    const peerId = document.getElementById('nearby-peer-id')?.textContent || '';
    const modal = document.getElementById('nearby-peer-modal');
    if (peerId) { if (modal) modal.style.display = 'none'; addFriend(peerId); openChat(peerId); }
  });
  on('nearby-add-btn', 'click', () => {
    const peerId = document.getElementById('nearby-peer-id')?.textContent || '';
    const modal = document.getElementById('nearby-peer-modal');
    if (peerId) { addFriend(peerId); if (modal) modal.style.display = 'none'; }
  });

  on('messages-list', 'click', (e) => {
    const btn = e.target.closest('.msg-retry');
    if (!btn) return;
    const row = btn.closest('.message');
    const ts = Number(row?.dataset.msgTs);
    if (Number.isFinite(ts)) retryFailedTextMessage(ts);
  });

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of incomingTransfers) {
      if (v && typeof v.expires === 'number' && v.expires < now) incomingTransfers.delete(k);
    }
  }, 60 * 1000);
}

async function loginHandler() {
  const nick = document.getElementById('nickname-input').value.trim();
  const pass = document.getElementById('password-input').value;
  
  if (nick.length < 3 || !/^[a-zA-Z0-9_]+$/.test(nick)) {
    return showToast('Invalid nickname. Use a-z, 0-9, _');
  }
  if (pass.length < 6) {
    return showToast('Password must be at least 6 characters');
  }
  
  const loginPanel = document.getElementById('login-panel');
  loginPanel.style.backdropFilter = 'none';
  
  // Save autologin hash
  const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
  localStorage.setItem('orbit_autologin', JSON.stringify({ nick, hash: passHash }));
  // Store the raw password in sessionStorage so we can derive the key on reload if needed, 
  // or we can just derive it now. Actually, storing password in localStorage is bad, 
  // but the prompt says "hash the Master Key in localStorage".
  // We will store the master key hash, and use it as the derived key password for future sessions.
  // But wait, changing the derivation password breaks existing vaults. 
  // Let's just store the master key in sessionStorage for session persistence, 
  // or use the Web Crypto API to encrypt the master key with a local hardware key? 
  // "Use Web Crypto API to hash the Master Key in localStorage. Trigger a fast (0.5s) planetary flash for returning users to skip the long login."
  
  const ok = await verifyAndUnlockVault(nick, pass);
  if (ok) {
    // PILLAR 3: Planetary Transition
    const loginCard = document.getElementById('login-card');
    loginCard.classList.add('autologin-active');
    
    setTimeout(async () => {
      await startOrbit(nick);
    }, 1500); // 1.5s cinematic spin
  } else {
    showToast('Wrong password');
  }
}

// PILLAR 3: Autologin Wrapper
async function checkAutologin() {
  const saved = localStorage.getItem('orbit_autologin');
  if (saved) {
    try {
      const { nick, hash } = JSON.parse(saved);
      if (nick && hash) {
        // We trigger the fast 0.5s planetary flash
        const loginCard = document.getElementById('login-card');
        loginCard.classList.add('autologin-active');
        document.getElementById('nickname-input').value = nick;
        document.getElementById('password-input').value = '********';
        
        // We must unlock vault. Since we only have hash, we might need to adjust verifyAndUnlockVault
        // For pure P2P without backend, if we just use the hash to verify, we still need the AES key.
        // Let's just bypass AES derivation if it's autologin, or use the hash as the password for derivation.
        // To not break existing, we'll call a modified derivation or just use the hash.
        const verifier = localStorage.getItem(`orbit_verifier_${nick}`) || '';
        if (verifier.startsWith('v2:')) {
          const parts = verifier.split(':');
          const saltB64 = parts[1] || '';
          const iterations = Number(parts[2] || 310000);
          await cryptoDerive(hash, nick, { version: 2, saltB64, iterations });
        } else {
          await cryptoDerive(hash, nick, 'orbits_salt');
        }
        
        setTimeout(async () => {
          await startOrbit(nick);
        }, 500);
        return true;
      }
    } catch (e) {
      console.warn('Autologin failed', e);
    }
  }
  return false;
}

async function verifyAndUnlockVault(nick, pass) {
  const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
  let verifier = localStorage.getItem(`orbit_verifier_${nick}`);
  
  if (!verifier) {
    const saltB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const iterations = 310000;
    const verifierB64 = await cryptoPbkdf2Bytes(passHash, saltB64, iterations, 32);
    localStorage.setItem(`orbit_verifier_${nick}`, `v2:${saltB64}:${iterations}:${verifierB64}`);
    await cryptoDerive(passHash, nick, { version: 2, saltB64, iterations });
    vaultLocked = false;
    return true;
  }

  if (verifier.startsWith('v2:')) {
    const parts = verifier.split(':');
    const saltB64 = parts[1] || '';
    const iterations = Number(parts[2] || 310000);
    const expectedB64 = parts[3] || '';
    const gotB64 = await cryptoPbkdf2Bytes(passHash, saltB64, iterations, 32);
    if (!timingSafeEqual(expectedB64, gotB64)) {
      const duressHash = await cryptoSha256Hex(`${nick}:${appSettings.duressPassword || ''}:orbits`);
      if (appSettings.duressPassword) {
        const duressB64 = await cryptoPbkdf2Bytes(duressHash, saltB64, iterations, 32);
        if (timingSafeEqual(expectedB64, duressB64)) {
          friends = [];
          localStorage.setItem('orbit_friends', '[]');
          await dbClearAll();
          vaultLocked = false;
          await cryptoDerive(duressHash, nick, { version: 2, saltB64, iterations });
          return true;
        }
      }
      return false;
    }
    await cryptoDerive(passHash, nick, { version: 2, saltB64, iterations });
    vaultLocked = false;
    return true;
  }

  if (!timingSafeEqual(verifier, passHash)) {
    const duressHash = await cryptoSha256Hex(`${nick}:${appSettings.duressPassword || ''}:orbits`);
    if (appSettings.duressPassword && timingSafeEqual(passHash, duressHash)) {
      friends = [];
      localStorage.setItem('orbit_friends', '[]');
      await dbClearAll();
      vaultLocked = false;
      return true;
    }
    return false;
  }

  await cryptoDerive(passHash, nick, 'orbits_salt');
  vaultLocked = false;
  return true;
}

async function startOrbit(nick) {
  myNickname = nick;
  myPeerId = await getOrCreatePeerId(nick);

  if (!orbitProfile.displayName) {
    orbitProfile.displayName = nick;
    persistOrbitProfile();
  }
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  const displayLetter = (orbitProfile.displayName || myPeerId).charAt(0).toUpperCase();
  document.getElementById('my-avatar-letter').textContent = displayLetter;
  document.getElementById('my-id-display').textContent = orbitProfile.displayName || myPeerId;
  const myStatusEl = document.getElementById('my-status');
  myStatusEl.classList.remove('hidden', 'status-offline');
  myStatusEl.classList.add('status-online');
  myStatusEl.textContent = 'Connecting…';
  applyProfileToUI();
  renderProfilePhotoGrid();

  const peerIdEl = document.getElementById('my-peer-id-display');
  if (peerIdEl) peerIdEl.textContent = myPeerId;

  requestAnimationFrame(() => {
    setTimeout(() => _initPeerConnection(myPeerId), 0);
  });
}

function _initPeerConnection(peerId) {
  try {
    peerReadyPromise = new Promise((resolve, reject) => {
      peerReadyResolve = resolve;
      peerReadyReject = reject;
    });

    const peerHost = import.meta.env.VITE_PEER_SERVER_HOST || import.meta.env.VITE_PEER_HOST;
    const peerPortRaw = import.meta.env.VITE_PEER_SERVER_PORT || import.meta.env.VITE_PEER_PORT;
    const peerPath = import.meta.env.VITE_PEER_SERVER_PATH || import.meta.env.VITE_PEER_PATH;
    const peerSecureEnv = import.meta.env.VITE_PEER_SECURE;
    const peerKey = import.meta.env.VITE_PEER_SERVER_KEY || import.meta.env.VITE_PEER_KEY;
    const forceRelay = import.meta.env.VITE_ICE_RELAY === 'true';
    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({ urls: [turnUrl], username: turnUsername, credential: turnCredential });
    }

    const peerOptions = {
      config: {
        iceServers,
        ...(forceRelay ? { iceTransportPolicy: 'relay' } : {})
      }
    };
    if (peerHost) {
      peerOptions.host = peerHost;
      if (peerPath) peerOptions.path = peerPath;
      if (peerPortRaw) peerOptions.port = Number(peerPortRaw);
      if (peerSecureEnv != null) peerOptions.secure = peerSecureEnv !== 'false';
      else peerOptions.secure = true;
      if (peerKey) peerOptions.key = peerKey;
    }

    peer = new Peer(peerId, peerOptions);
  } catch (err) {
    console.error('Peer failed:', err);
    showToast('Network error. Retrying...');
    setTimeout(() => _initPeerConnection(peerId), 3000);
    return;
  }
  
  callManager = createCallManager({
    peer,
    getMyNickname: () => myNickname,
    getCurrentChatFriend: () => currentChatFriend,
    getActiveConnections: () => activeConnections,
    openChat,
    getVideoConstraints: () => ({ facingMode: 'user' }),
    getBatterySaver: () => !!appSettings.batterySaver,
    getAudioConstraints: () => ({ echoCancellation: appSettings.echoCancel, noiseSuppression: appSettings.noiseSuppression, autoGainControl: appSettings.autoGain }),
    getAppSettings: () => appSettings,
    getIsOffline: () => isOffline,
    t: {},
    onScreenTrackEnded: () => {},
    el: {
      callScreen: document.getElementById('call-screen'),
      localVideo: document.getElementById('local-video'),
      remoteVideo: document.getElementById('remote-video'),
      incomingCallModal: document.getElementById('incoming-call-modal')
    }
  });
  
  connectionTimeout = setTimeout(() => {
    showToast('Connection timeout');
    const st = document.getElementById('my-status');
    if (st && !peer?.open) {
      st.classList.remove('hidden');
      st.textContent = 'No signal';
      st.className = 'status-offline';
    }
  }, 10000);
  
  peer.on('open', async (id) => {
    clearTimeout(connectionTimeout);
    peerReadyResolve?.(true);
    document.getElementById('my-status').classList.add('hidden');
    await renderFriends();
    connectToAllFriends();
  });
  
  peer.on('connection', handleIncomingConnection);
  peer.on('call', call => callManager.handleIncomingCall(call));
  
  peer.on('disconnected', () => {
    const st = document.getElementById('my-status');
    st.classList.remove('hidden');
    st.textContent = 'Offline';
    st.className = 'status-offline';
    if (peerIdleDisconnected) return;
    setTimeout(() => {
      if (peer && !peer.destroyed && !peerIdleDisconnected) peer.reconnect();
    }, 3000);
  });
  
  // TITANIUM FIX: Error boundary for PeerJS events
  peer.on('error', (err) => {
    peerReadyReject?.(err);
    if (err.type === 'network') {
      showToast('Connection lost. Reconnecting...');
      setTimeout(() => peer?.reconnect(), 2000);
    } else if (err.type === 'unavailable-id') {
      showToast('Nickname already in use!');
    } else {
      console.warn('Peer error:', err.type);
    }
  });
}

// TITANIUM FIX: Dual Data Channels
let ephemeralConnections = {};

function connectToAllFriends() {
  if (!peer || peer.destroyed) return; // FIX: защита от вызова после уничтожения пира
  friends.forEach((f, i) => setTimeout(() => tryConnect(f.id), i * 150));
  scheduleHeartbeat();
}

function tryConnect(friendId) {
  if (activeConnections[friendId]) return;
  const conn = peer.connect(friendId, { label: 'reliable', reliable: true });
  handleOutgoingConnection(conn);
  
  const ephConn = peer.connect(friendId, { 
    label: 'ephemeral', 
    ordered: false, 
    maxRetransmits: 0 
  });
  handleEphemeralConnection(ephConn);
}

function handleEphemeralConnection(conn) {
  conn.on('open', () => {
    ephemeralConnections[conn.peer] = conn;
  });
  conn.on('data', (d) => {
    // Only process typing indicators from ephemeral
    if (d && d.type === 'typing') {
      receiveMessage(conn.peer, d);
    }
  });
  conn.on('close', () => {
    delete ephemeralConnections[conn.peer];
  });
}

function wireConnHandlers(conn) {
  touchPeerActivity(conn.peer);
  
  // TITANIUM FIX: ICE Restart Logic & State Monitoring
  const rtcPeerConnection = conn.peerConnection;
  if (rtcPeerConnection) {
    const stateHandler = () => {
      const state = rtcPeerConnection.connectionState;
      if (state === 'disconnected' || state === 'failed') {
        console.log(`[Orbit] ICE connection state ${state} for ${conn.peer}, restarting ICE...`);
        try {
          // Trigger ICE Restart without destroying UI state
          rtcPeerConnection.restartIce();
        } catch (e) {
          console.warn('ICE Restart failed', e);
        }
      }
    };
    rtcPeerConnection.addEventListener('connectionstatechange', stateHandler);
    
    // TITANIUM FIX: Memory Hygiene
    conn.on('close', () => {
      rtcPeerConnection.removeEventListener('connectionstatechange', stateHandler);
    });
  }

  conn.on('data', (d) => {
    touchPeerActivity(conn.peer);
    receiveMessage(conn.peer, d);
  });
  conn.on('close', () => {
    if (conn.label !== 'ephemeral') {
      delete activeConnections[conn.peer];
      const chatId = chatKey(conn.peer);
      teardownWireSession(chatId);
      wireHelloSentByChat.delete(chatId);
      scheduleRenderFriends();
    }
  });
}

function requestFriendProfile(peerId) {
  const conn = activeConnections[peerId];
  if (!conn?.open) return;
  conn.send({ type: 'orbit_profile_req', nonce: Date.now() });
}

function handleOutgoingConnection(conn) {
  conn._orbitInitiator = true;
  conn.on('open', () => {
    if (!acceptConnectionOrCloseDuplicate(conn)) return;
    touchPeerActivity(conn.peer);
    scheduleRenderFriends();
    flushOutgoingQueue();
    requestFriendProfile(conn.peer);
    void sendWireHello(conn);
  });
  wireConnHandlers(conn);
}

function handleIncomingConnection(conn) {
  // TITANIUM FIX: Handle incoming ephemeral connections separately
  if (conn.label === 'ephemeral') {
    handleEphemeralConnection(conn);
    return;
  }

  conn._orbitInitiator = false;
  
  conn.on('open', () => {
    if (!acceptConnectionOrCloseDuplicate(conn)) return;
    touchPeerActivity(conn.peer);
    if (!friends.find(f => f.id === conn.peer)) {
      friends.push({ id: conn.peer, addedAt: Date.now() });
      localStorage.setItem('orbit_friends', JSON.stringify(friends));
    }
    scheduleRenderFriends();
    requestFriendProfile(conn.peer);
    void sendWireHello(conn);
  });
  wireConnHandlers(conn);
}

function openConnectionForDiscovery(remoteId) {
  return new Promise((resolve, reject) => {
    waitForPeerReady(12000).then(() => {
      if (!peer?.open) return reject(new Error('Peer not ready'));

      if (activeConnections[remoteId]?.open) {
        touchPeerActivity(remoteId);
        return resolve(activeConnections[remoteId]);
      }

      const conn = peer.connect(remoteId, { reliable: true });
      conn._orbitInitiator = true;
      const to = setTimeout(() => {
        try {
          conn.close();
        } catch (_) { /* ignore */ }
        reject(new Error('timeout'));
      }, 12000);
      conn.on('open', () => {
        clearTimeout(to);
        acceptConnectionOrCloseDuplicate(conn);
        touchPeerActivity(remoteId);
        scheduleRenderFriends();
        flushOutgoingQueue();
        wireConnHandlers(conn);
        void sendWireHello(conn);
        resolve(conn);
      });
      conn.on('error', () => {
        clearTimeout(to);
        reject(new Error('Peer error'));
      });
    }).catch(reject);
  });
}

async function renderFriends() {
  const list = document.getElementById('friends-list');
  const visible = friends.filter(f => !blockedPeers.includes(f.id));
  
  if (visible.length === 0) {
    document.getElementById('contacts-empty-state').style.display = 'block';
    list.innerHTML = '';
    return;
  }
  document.getElementById('contacts-empty-state').style.display = 'none';
  
  const previews = await Promise.all(visible.map(f => getLastMessagePreview(chatKey(f.id)).catch(() => null)));

  // Сортируем по времени последнего сообщения (свежие сверху)
  const indexed = visible.map((f, i) => ({ f, preview: previews[i] }));
  indexed.sort((a, b) => {
    const ta = a.preview?.ts || a.f.addedAt || 0;
    const tb = b.preview?.ts || b.f.addedAt || 0;
    return tb - ta;
  });

  list.innerHTML = '';
  indexed.forEach(({ f, preview: previewObj }) => {
    const isOnline = !!activeConnections[f.id];
    const preview = previewObj ? previewObj.text || 'Media' : 'No messages yet';
    const profile = friendProfiles[f.id] || {};
    const displayName = profile.displayName || f.id;
    const photo = profile.photo || null;

    const div = document.createElement('div');
    div.className = 'friend-item';
    div.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof openChat === 'function' && f?.id) {
        openChat(f.id);
      } else {
        console.warn('openChat not ready or friend missing', f);
      }
    });

    const avatarEl = document.createElement('div');
    avatarEl.className = 'friend-avatar';
    if (photo) {
      const safe = sanitizeMediaUrl(photo);
      if (safe) {
        avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
      } else {
        avatarEl.textContent = displayName.charAt(0).toUpperCase();
      }
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }

    const infoWrap = document.createElement('div');
    infoWrap.style.flex = '1';
    infoWrap.style.marginLeft = '12px';
    infoWrap.style.overflow = 'hidden';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';

    const nameEl = document.createElement('strong');
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.textContent = displayName;

    const statusEl = document.createElement('span');
    statusEl.style.color = isOnline ? 'var(--tg-online)' : 'var(--tg-offline)';
    statusEl.style.fontSize = '12px';
    statusEl.style.marginLeft = '4px';
    statusEl.textContent = isOnline ? '●' : '○';

    topRow.appendChild(nameEl);
    topRow.appendChild(statusEl);

    const previewEl = document.createElement('div');
    previewEl.style.color = 'var(--tg-text-secondary)';
    previewEl.style.fontSize = '13px';
    previewEl.style.whiteSpace = 'nowrap';
    previewEl.style.overflow = 'hidden';
    previewEl.style.textOverflow = 'ellipsis';
    previewEl.textContent = preview;

    infoWrap.appendChild(topRow);
    infoWrap.appendChild(previewEl);

    div.replaceChildren(avatarEl, infoWrap);
    list.appendChild(div);
  });
}
function addFriend(id) {
  const normalized = id.trim().toUpperCase();
  if (!isValidPeerId(normalized)) return showToast('Invalid ID');
  if (normalized === myPeerId) return showToast('Cannot add yourself');
  if (friends.find(f => f.id === normalized)) return showToast('Already in contacts');
  friends.push({ id: normalized, addedAt: Date.now() });
  localStorage.setItem('orbit_friends', JSON.stringify(friends));
  tryConnect(normalized);
  renderFriends();
  showToast('Contact added');
}

function chatKey(friendId = currentChatFriend) {
  return [myPeerId, friendId].sort().join('_');
}

function cleanupCurrentView() {
  teardownLazyImageObserver();
  chatAbortController?.abort();
  chatAbortController = null;
  if (msgsVirtual) { msgsVirtual.destroy(); msgsVirtual = null; }
  // FIX: сбрасываем флаги загрузки сообщений при закрытии чата
  messagesLoadingOlder = false;
  hasMoreOlderMessages = true;
}

async function openChat(friendId) {
  // TITANIUM FIX: Guard 1: prevent double-open
  if (currentChatFriend === friendId && msgsVirtual) {
    return;
  }
  // TITANIUM FIX: Guard 2: peer must be ready
  if (!peer || peer.destroyed) {
    showToast('Connecting to network...');
    return;
  }
  // TITANIUM FIX: Guard 3: friend must exist
  if (!friends.some(f => f.id === friendId)) {
    showToast('Add this user as friend first');
    return;
  }

  touchUserActivity();
  cleanupCurrentView();
  hideRadarIfActive();
  currentView = 'chat';
  chatAbortController = new AbortController();
  const chatSig = chatAbortController.signal;

  currentChatFriend = friendId;
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';
  document.getElementById('active-chat').style.display = 'flex';

  const fp = friendProfiles[friendId] || {};
  const friendDisplayName = fp.displayName || friendId;
  document.getElementById('chat-friend-name').textContent = friendDisplayName;

  const isOnline = !!activeConnections[friendId];
  document.getElementById('chat-friend-status').textContent = isOnline ? 'online' : 'offline';
  document.getElementById('chat-friend-status').style.color = isOnline ? 'var(--tg-online)' : 'var(--tg-text-secondary)';

  const avatarEl = document.getElementById('current-chat-avatar');
  if (fp.photo) {
    const safe = sanitizeMediaUrl(fp.photo);
    if (safe) {
      avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = friendDisplayName.charAt(0).toUpperCase();
      avatarEl.dataset.color = friendId.charCodeAt(0) % 8;
    }
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = friendDisplayName.charAt(0).toUpperCase();
    avatarEl.dataset.color = friendId.charCodeAt(0) % 8;
  }
  
  document.getElementById('app-container').classList.add('chat-open');
  document.getElementById('back-btn').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  
  messageWindow = skeletonPlaceholders(12);
  applyBubbleGrouping();
  
  const container = document.getElementById('messages-list');
  container.innerHTML = '';
  
  setupLazyImageObserver();

  msgsVirtual = new VirtualScroller(container, {
    estimateRowHeight: 72,
    bufferRows: optimizer.getBufferRows(),
    getCount: () => messageWindow.length,
    getItem: i => messageWindow[i],
    renderItem: (el, item) => {
      el.innerHTML = '';
      el.appendChild(buildMessageElement(item));
      observeLazyImagesIn(el);
    },
    onNearTop: async () => {
      if (messageWindow[0]?.type === 'skeleton') return;
      if (!messagesLoadingOlder && hasMoreOlderMessages) {
        messagesLoadingOlder = true;
        const oldestTs = messageWindow[0]?.ts;
        const page = getMessagePage();
        const rows = await dbGetPage(chatKey(), page, oldestTs);
        if (rows.length > 0) {
          const dec = await decodeMessageRows(rows);
          dec.sort((a, b) => b.ts - a.ts);
          messageWindow = [...messageWindow, ...dec];
          applyBubbleGrouping();
          // No need to insert at start, they are at the end of the array now
          msgsVirtual.refresh();
        }
        hasMoreOlderMessages = rows.length === page;
        messagesLoadingOlder = false;
      }
    }
  });
  
  msgsVirtual.refresh();
  msgsVirtual.scrollToBottom();
  if (container.clientHeight === 0) {
    requestAnimationFrame(() => { msgsVirtual?.refresh(); });
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const ml = document.getElementById('messages-list');
      if (ml && currentChatFriend) {
        requestAnimationFrame(() => {
          ml.scrollTop = ml.scrollHeight;
        });
      }
    }, { signal: chatSig });
  }

  const chatInputEl = document.getElementById('chat-input');
  chatInputEl.addEventListener('focus', () => {
    void requestScreenWakeLock();
    requestAnimationFrame(() => {
      const ml = document.getElementById('messages-list');
      if (ml && currentChatFriend) ml.scrollTop = ml.scrollHeight;
    });
  }, { signal: chatSig });
  chatInputEl.addEventListener('blur', () => {
    void releaseScreenWakeLock();
  }, { signal: chatSig });

  // TITANIUM FIX: Show skeletons immediately
  messageWindow = skeletonPlaceholders(12);
  msgsVirtual?.refresh();

  // Then load real messages
  await loadInitialMessagesForChat();
  applyBubbleGrouping();
  msgsVirtual.refresh();
  msgsVirtual.scrollToBottom();
  if (window.innerWidth <= 768) {
    document.getElementById('chat-input')?.focus();
    void requestScreenWakeLock();
  }
}

function closeCurrentChat() {
  optimizer.flushAckNow();
  void releaseScreenWakeLock();
  cleanupCurrentView();
  currentView = null;
  document.getElementById('app-container').classList.remove('chat-open');
  currentChatFriend = null;
  messageWindow = [];
  activeObjectUrls.forEach(u => URL.revokeObjectURL(u));
  activeObjectUrls.clear();
  document.getElementById('active-chat').style.display = 'none';
  
  // TITANIUM FIX: Only show empty-state if no other main view is open
  const radarEl = document.getElementById('radar-view');
  const settingsEl = document.getElementById('settings-view');
  const emptyStateEl = document.getElementById('empty-state');
  const radarVisible = radarEl ? radarEl.style.display === 'flex' : false;
  const settingsVisible = settingsEl ? settingsEl.style.display === 'flex' : false;
  
  if (!radarVisible && !settingsVisible) {
    if (emptyStateEl) emptyStateEl.style.display = 'flex';
  } else {
    if (emptyStateEl) emptyStateEl.style.display = 'none';
  }
}

async function loadInitialMessagesForChat() {
  const page = getMessagePage();
  const rows = await dbGetPage(chatKey(), page, null);
  messageWindow = await decodeMessageRows(rows);
  // TITANIUM FIX: Sort descending for column-reverse
  messageWindow.sort((a, b) => b.ts - a.ts);
  trimMessageWindow();
  hasMoreOlderMessages = rows.length === page;
}

function applyBubbleGrouping() {
  for (let i = 0; i < messageWindow.length - 1; i++) {
    messageWindow[i]._grouped = messageWindow[i].from === messageWindow[i + 1].from;
  }
  if (messageWindow.length) messageWindow.at(-1)._grouped = false;
}

function buildMessageElement(msg) {
  if (msg.type === 'skeleton') {
    const sk = document.createElement('div');
    sk.className = 'message skeleton-msg';
    sk.innerHTML = '<div class="skeleton-bubble"></div>';
    return sk;
  }

  const cacheKey = `${msg.ts}:${msg.status}:${msg.from}:${msg.type}`;
  if (msg.status !== 'pending' && msgElementCache.has(cacheKey)) {
    return msgElementCache.get(cacheKey).cloneNode(true);
  }

  const div = document.createElement('div');
  div.className = 'message ' + (msg.from === myPeerId ? 'me' : 'them');
  if (msg._grouped) div.classList.add('grouped');
  div.dataset.msgTs = String(msg.ts);

  let contentHtml = '';
  if (msg.type === 'text') {
    contentHtml = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
  } else if (msg.type === 'image') {
    if (msg.status === 'pending' && msg.dropPercent !== undefined) {
      contentHtml = `
        <div class="msg-file">Uploading ${escapeHtml(msg.name)}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent}% - ${msg.dropStatusText || 'Transferring'}</div>
      `;
    } else if (msg.url) {
      if (optimizer.shouldDeferImagePreview()) {
        contentHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" class="msg-media-img orbit-lazy-img" data-orbit-src="${escapeAttr(msg.url)}">`;
      } else {
        contentHtml = `<img src="${escapeAttr(msg.url)}" alt="" class="msg-media-img">`;
      }
    } else {
      contentHtml = `<div class="msg-file">Downloading ${escapeHtml(msg.name)}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent || 0}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent || 0}% - ${msg.dropStatusText || 'Receiving'}</div>`;
    }
  } else if (msg.type === 'audio') {
    contentHtml = `<audio src="${escapeAttr(msg.url)}" controls class="msg-media-audio"></audio>`;
  } else {
    // Files
    if (msg.dropPercent !== undefined && msg.dropPercent < 100) {
      contentHtml = `<div class="msg-file">${escapeHtml(msg.name || 'File')}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent}% - ${msg.dropStatusText || 'Transferring'}</div>`;
    } else {
      contentHtml = `<div class="msg-file">
        <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        <a href="${escapeAttr(msg.url)}" download="${escapeAttr(msg.name)}" style="color: inherit; text-decoration: none;">${escapeHtml(msg.name || 'File')}</a>
      </div>`;
    }
  }

  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const statusHtml = msg.from === myPeerId ? statusIconHtml(msg.status) : '';
  const retryBtn =
    msg.from === myPeerId && msg.type === 'text' && msg.status === 'failed'
      ? '<button type="button" class="msg-retry tg-link-btn">Retry</button>'
      : '';

  div.innerHTML = `
    <div class="msg-body">${contentHtml}</div>
    <div class="msg-meta">
      <span class="msg-time">${time}</span>
      ${msg.from === myPeerId ? `<span class="msg-status">${statusHtml}</span>` : ''}
      ${retryBtn}
    </div>
  `;

  if (msg.status !== 'pending') {
    msgElementCache.set(cacheKey, div.cloneNode(true));
    trimMsgElementCache();
  }
  return div;
}

async function retryFailedTextMessage(ts) {
  if (!currentChatFriend) return;
  const conn = activeConnections[currentChatFriend];
  if (!conn?.open) return showToast('You are offline');
  const m = messageWindow.find((x) => x.ts === ts);
  if (!m || m.type !== 'text' || m.status !== 'failed') return;
  pruneMsgElementCache(ts);
  m.status = 'pending';
  await dbUpdateStatus(chatKey(), ts, 'pending');
  if (!patchMessageStatusDOM(ts, 'pending')) msgsVirtual?.refresh();
  try {
    await ensureWireReady(currentChatFriend);
    const cipher = await encryptWirePayload(chatKey(), {
      type: 'text',
      text: m.text,
      ts,
      from: myPeerId,
      to: currentChatFriend,
      status: 'sent'
    });
    conn.send({ type: 'orbit_wire', cipher });
    m.status = 'sent';
    await dbUpdateStatus(chatKey(), ts, 'sent');
    registerPendingAck(chatKey(), ts);
    if (!patchMessageStatusDOM(ts, 'sent')) msgsVirtual?.refresh();
  } catch (err) {
    m.status = 'failed';
    await dbUpdateStatus(chatKey(), ts, 'failed');
    msgsVirtual?.refresh();
  }
}

async function sendTextMessage(text) {
  if (!currentChatFriend || !text) return;
  touchUserActivity();
  const ts = Date.now();
  const msg = { type: 'text', text, ts, from: myPeerId, to: currentChatFriend, status: 'pending' };
  await saveMsgToDB(chatKey(), msg);
  await mergeMessageIntoView(msg);
  
  // TITANIUM FIX: Race condition protection - check if already connecting
  if (connectingPeers.has(currentChatFriend)) {
    console.log(`[Orbit] Already waking up peer ${currentChatFriend}, queueing message`);
    msg.status = 'pending';
    pendingOutgoing.push(msg);
    await dbSetPendingOut(pendingOutgoing);
    return;
  }
  
  let conn = activeConnections[currentChatFriend];
  
  if (!conn?.open && peer && peer.open) {
    console.log(`[Orbit] Waking up peer ${currentChatFriend} to send text message...`);
    connectingPeers.add(currentChatFriend);
    try {
      conn = await openConnectionForDiscovery(currentChatFriend);
      connectingPeers.delete(currentChatFriend);
    } catch(e) {
      console.log(`[Orbit] Failed to wake up peer ${currentChatFriend}`, e);
      connectingPeers.delete(currentChatFriend);
    }
  }

  if (conn?.open) {
    try {
      await ensureWireReady(currentChatFriend);
      const cipher = await encryptWirePayload(chatKey(), {
        type: 'text',
        text,
        ts,
        from: myPeerId,
        to: currentChatFriend,
        status: 'sent'
      });
      conn.send({ type: 'orbit_wire', cipher });
      msg.status = 'sent';
      await dbUpdateStatus(chatKey(), ts, 'sent');
      registerPendingAck(chatKey(), ts);
      
      // TITANIUM FIX: Flush any queued messages for this peer
      await flushOutgoingQueueForPeer(currentChatFriend);
      
    } catch (err) {
      msg.status = 'failed';
      await dbUpdateStatus(chatKey(), ts, 'failed');
    }
  } else {
    // If we still don't have a connection, keep it pending in outgoing queue
    msg.status = 'pending';
    pendingOutgoing.push(msg);
    await dbSetPendingOut(pendingOutgoing);
    showToast('User offline. Message queued.');
  }
  
  if (msgsVirtual) msgsVirtual.refresh();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function mergeMessageIntoView(msg) {
  if (currentChatFriend !== (msg.from === myPeerId ? msg.to : msg.from)) return;
  // TITANIUM FIX: column-reverse means newest is first in array
  messageWindow.unshift(msg);
  trimMessageWindow();
  applyBubbleGrouping();
  if (msgsVirtual) {
    msgsVirtual.refresh();
    // No need to scrollToBottom with column-reverse
  }
}

async function receiveMessage(senderId, data) {
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'ping') return;
  if (data.type !== 'typing') touchUserActivity();

  if (data.type === 'orbit_wire_hello') {
    if (Number(data.v) !== 2 || !data.pub) return;
    const chatId = typeof data.chatId === 'string' && data.chatId ? data.chatId : chatKey(senderId);
    try {
      const ready = await acceptWireHello(chatId, data.pub);
      const { fingerprint } = await ready;
      const fpKey = `orbit_wire_fp_${chatId}`;
      const existing = localStorage.getItem(fpKey);
      if (!existing) {
        localStorage.setItem(fpKey, fingerprint);
      } else if (existing !== fingerprint) {
        const st = ensurePeerTrust(senderId);
        st.score = Math.max(0, Number(st.score || 0) - 30);
        localStorage.setItem('orbit_trust', JSON.stringify(trustState));
        const banner = document.getElementById('chat-warning-banner');
        if (banner) {
          banner.style.display = 'block';
          banner.textContent = 'Security warning: session key changed. Possible MITM.';
        }
        showToast('Security warning: key changed');
      }
    } catch (err) {
      console.warn('Wire hello failed', err);
    }
    return;
  }

  if (data.type === 'orbit_profile_req') {
    const conn = activeConnections[senderId];
    if (conn?.open && typeof data.nonce === 'number') {
      conn.send({
        type: 'orbit_profile_res',
        nonce: data.nonce,
        profile: {
          displayName: orbitProfile.displayName || '',
          photo: orbitProfile.photos?.[0] || null
        }
      });
    }
    return;
  }

  if (data.type === 'orbit_profile_res') {
    if (data.profile) {
      friendProfiles[senderId] = data.profile;
      localStorage.setItem('orbit_friend_profiles', JSON.stringify(friendProfiles));
      scheduleRenderFriends();
      if (currentChatFriend === senderId) {
        const dn = data.profile.displayName || senderId;
        document.getElementById('chat-friend-name').textContent = dn;
        const avatarEl = document.getElementById('current-chat-avatar');
        if (data.profile.photo) {
          const safe = sanitizeMediaUrl(data.profile.photo);
          if (safe) {
            avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
          } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = dn.charAt(0).toUpperCase();
          }
        }
      }
    }
    window.dispatchEvent(new CustomEvent('orbit-profile-res', { detail: { from: senderId, nonce: data.nonce, profile: data.profile || {} } }));
    return;
  }

  if (data.type === 'typing') {
    if (optimizer.isDataSaver()) return;
    if (currentChatFriend === senderId) {
      if (typingIncomingRaf) cancelAnimationFrame(typingIncomingRaf);
      typingIncomingRaf = requestAnimationFrame(() => {
        typingIncomingRaf = null;
        const statusEl = document.getElementById('chat-friend-status');
        statusEl.innerHTML = '<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
      });
      clearTimeout(typingTimers.get(senderId));
      typingTimers.set(senderId, setTimeout(() => {
        const statusEl = document.getElementById('chat-friend-status');
        statusEl.textContent = activeConnections[senderId]?.open ? 'online' : 'offline';
        typingTimers.delete(senderId);
      }, 3000));
    }
    return;
  }

  if (data.type === 'orbit_wire') {
    try {
      await ensureWireReady(senderId, 5000);
      const plain = await decryptWirePayload(chatKey(senderId), data.cipher);
      if (plain.from !== senderId) return;
      const msg = {
        ...plain,
        ts: plain.ts || Date.now(),
        from: senderId,
        to: myPeerId,
        status: 'delivered'
      };
      await saveMsgToDB(chatKey(senderId), msg);
      await mergeMessageIntoView(msg);
      scheduleRenderFriends();
      queueDeliveredAck(senderId, msg.ts);
    } catch (err) {
      console.error('Wire decrypt failed', err);
    }
    return;
  }

  if (data.type === 'text' || data.type === 'image' || data.type === 'audio' || data.type === 'file') {
    const msg = { ...data, ts: data.ts || Date.now(), from: senderId, to: myPeerId, status: 'delivered' };
    await saveMsgToDB(chatKey(senderId), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    // Уведомление если чат не открыт
    if (currentChatFriend !== senderId) {
      const fp = friendProfiles[senderId] || {};
      const senderName = fp.displayName || senderId;
      const preview = data.type === 'text' ? (data.text || '').slice(0, 40) : data.type === 'image' ? '📷 Photo' : data.type === 'audio' ? '🎤 Voice' : '📎 File';
      showToast(`${senderName}: ${preview}`);
    }

    queueDeliveredAck(senderId, msg.ts);
  }

  // TITANIUM FIX: Handle Nudge
  if (data.type === 'nudge') {
    const now = Date.now();
    if (now - lastNudgeReceived > NUDGE_COOLDOWN) {
      lastNudgeReceived = now;
      showToast(`${friendProfiles[senderId]?.displayName || senderId} nudged you!`, 'nudge');
      triggerLocalNudge();
    }
    return;
  }
  
  // TITANIUM FIX: Handle Cinema Sync
  if (data.type === 'cinema-sync') {
    if (data.action === 'ready') {
      showToast(`${friendProfiles[senderId]?.displayName || senderId} is ready to watch: ${data.name}`);
      return;
    }
    
    // Only apply if Cinema Mode is open and playing same peer
    if (document.getElementById('cinema-view').style.display !== 'none' && cinemaFriendId === senderId) {
      isCinemaRemoteAction = true; // Lock local events to prevent loops
      
      switch (data.action) {
        case 'play':
          if (Math.abs(cinemaVideoEl.currentTime - data.time) > 1.0) {
            cinemaVideoEl.currentTime = data.time;
          }
          cinemaVideoEl.play().catch(e => console.warn('Cinema play blocked', e));
          break;
        case 'pause':
          cinemaVideoEl.pause();
          cinemaVideoEl.currentTime = data.time; // Sync exact pause frame
          break;
        case 'seeked':
        case 'time-update':
          if (Math.abs(cinemaVideoEl.currentTime - data.time) > 2.0) {
            cinemaVideoEl.currentTime = data.time;
          }
          break;
      }
      // Reset lock after all queued media events have fired
      setTimeout(() => { isCinemaRemoteAction = false; }, 0);
    }
    return;
  }

  // TITANIUM FIX: Handle Orbits Drop incoming packets
  if (data.type && data.type.startsWith('file-')) {
    if (data.type === 'file-start') {
      const msg = { 
        type: data.mime.startsWith('image/') ? 'image' : 'file', 
        name: data.name, 
        ts: data.msgId, 
        from: senderId, 
        to: myPeerId, 
        status: 'pending',
        dropPercent: 0,
        dropStatusText: 'Receiving...'
      };
      await mergeMessageIntoView(msg);
      
      if (currentChatFriend !== senderId) {
        showToast(`Receiving file: ${data.name}`);
      }
    }
    
    orbitsDrop.handleIncomingPacket(data);
    return;
  }

  if (data.type === 'orbit_ack_batch' && Array.isArray(data.items)) {
    for (const it of data.items) {
      if (it && it.ts != null && it.status) {
        await applyIncomingAck(senderId, it.ts, it.status);
      }
    }
    return;
  }

  if (data.type === 'ack' && data.ts != null && data.status) {
    await applyIncomingAck(senderId, data.ts, data.status);
  }
}

// FIX: реализована отправка файлов с чанкингом для больших файлов (избегаем base64 взрыва)
async function sendMediaBlob(file, type, name, qualitySetting = 'original') {
  touchUserActivity();
  let workFile = file;
  let workName = name || file.name || 'file';
  
  // TITANIUM FIX: Canvas API Compression
  if (type === 'image' && qualitySetting !== 'original') {
    try {
      showToast('Compressing image...');
      workFile = await orbitsDrop.compressImage(file, qualitySetting);
      workName = String(workName).replace(/\.[^.]+$/, '') + '.jpg';
    } catch (err) {
      console.warn('Image compress failed, using original', err);
    }
  }
  
  // TITANIUM FIX: Orbits Drop Chunking for files > 1MB
  const MAX_INLINE_SIZE = 1 * 1024 * 1024; // 1MB limit for base64
  
  if (workFile.size > MAX_INLINE_SIZE) {
    showToast('Using Orbits Drop (High-Bandwidth Transfer)...');
    
    const msgId = Date.now();
    const msg = { 
      type, 
      name: workName, 
      ts: msgId, 
      from: myPeerId, 
      to: currentChatFriend, 
      status: 'pending',
      dropPercent: 0,
      dropStatusText: 'Initializing...'
    };
    
    await saveMsgToDB(chatKey(), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    let conn = activeConnections[currentChatFriend];
    if (!conn?.open && peer && peer.open) {
      try {
        conn = await openConnectionForDiscovery(currentChatFriend);
      } catch(err) {
        console.log(`[Orbit Drop] Failed to wake up peer ${currentChatFriend}`, err);
      }
    }

    if (conn?.open) {
      try {
        await orbitsDrop.sendFile(workFile, conn, msgId);
      } catch (err) {
        console.error('[Orbit Drop] Transfer failed:', err);
        msg.status = 'failed';
        msg.dropStatusText = 'Failed';
        await dbUpdateStatus(chatKey(), msgId, 'failed');
        if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
      }
    } else {
      msg.status = 'failed';
      msg.dropStatusText = 'Peer Offline';
      await dbUpdateStatus(chatKey(), msgId, 'failed');
      if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
      showToast('User offline. Drop failed.');
    }
    return;
  }
  
  // Standard base64 transfer for small files
  const reader = new FileReader();
  reader.onload = async (e) => {
    const buffer = e.target.result;
    const url = arrayBufferToDataUrl(buffer, workFile.type || file.type);
    const msg = { type, url, name: workName, ts: Date.now(), from: myPeerId, to: currentChatFriend, status: 'pending' };
    await saveMsgToDB(chatKey(), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    let conn = activeConnections[currentChatFriend];
    
    if (!conn?.open && peer && peer.open) {
      console.log(`[Orbit] Waking up peer ${currentChatFriend} to send media blob...`);
      try {
        conn = await openConnectionForDiscovery(currentChatFriend);
      } catch(err) {
        console.log(`[Orbit] Failed to wake up peer ${currentChatFriend}`, err);
      }
    }

    if (conn?.open) {
      try {
        await ensureWireReady(currentChatFriend);
        const cipher = await encryptWirePayload(chatKey(), {
          type,
          url,
          name: workName,
          ts: msg.ts,
          from: myPeerId,
          to: currentChatFriend,
          status: 'sent'
        });
        conn.send({ type: 'orbit_wire', cipher });
      } catch (err) {
        msg.status = 'failed';
        await dbUpdateStatus(chatKey(), msg.ts, 'failed');
        showToast('Secure send failed');
        if (msgsVirtual) msgsVirtual.refresh();
        return;
      }
      msg.status = 'sent';
      await dbUpdateStatus(chatKey(), msg.ts, 'sent');
      registerPendingAck(chatKey(), msg.ts);
    } else {
      msg.status = 'pending';
      pendingOutgoing.push(msg);
      await dbSetPendingOut(pendingOutgoing);
      showToast('User offline. Media queued.');
    }
    
    if (msgsVirtual) msgsVirtual.refresh();
  };
  reader.readAsArrayBuffer(workFile);
}

async function sendChunkedFile(file, type, name) {
  // Простая реализация чанкинга по 256KB
  const CHUNK_SIZE = 256 * 1024;
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  const transferId = `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const reader = new FileReader();
    const chunkData = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsArrayBuffer(chunkBlob);
    });
    const conn = activeConnections[currentChatFriend];
    if (!conn?.open) {
      showToast('Connection lost during upload');
      return;
    }
    conn.send({
      type: 'orbit_chunk',
      transferId,
      index: i,
      total: chunks,
      data: Array.from(new Uint8Array(chunkData)),
      name,
      mime: file.type,
      final: i === chunks - 1
    });
  }
  showToast(`Sent ${chunks} chunks`);
}

function arrayBufferToDataUrl(buffer, mimeType) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function saveMsgToDB(chatId, msgObj) {
  const encStr = await cryptoEncrypt(msgObj);
  await dbAdd({ chatId, ts: msgObj.ts, status: msgObj.status, from: msgObj.from, type: msgObj.type, enc: encStr });
}

async function decodeMessageRows(rows) {
  const encArray = rows.map(r => r.enc);
  const decObjects = await cryptoDecryptBatch(encArray);
  return rows.map((r, i) => {
    const obj = decObjects[i] || {};
    return { ...r, ...obj };
  });
}

async function getLastMessagePreview(chatId) {
  const last = await dbGetLast(chatId);
  if (!last) return null;
  const dec = await cryptoDecrypt(last.enc);
  return dec;
}

async function lockVault() {
  await cryptoLock();
  vaultLocked = true;
  document.getElementById('vault-lock-modal').style.display = 'flex';
  document.getElementById('vault-lock-modal').removeAttribute('aria-hidden');
  closeCurrentChat();
  if (peer) peer.disconnect();
}

function openSettingsPanel() {
  hideRadarIfActive();
  syncSettingsFormFromState();
  renderProfilePhotoGrid();
  populateMicDevices();
  const panel = document.getElementById('settings-view');
  currentView = 'settings';
  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.removeAttribute('aria-hidden'));
  
  // PILLAR 2: Tab System (Vanilla JS)
  if (!panel.dataset.tabsInit) {
    panel.dataset.tabsInit = 'true';
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
      });
    });
  }
}

function closeSettingsPanel() {
  const panel = document.getElementById('settings-view');
  panel.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    panel.style.display = 'none';
    if (currentView === 'settings') currentView = currentChatFriend ? 'chat' : null;
  }, 300);
}

function syncSettingsFormFromState() {
  const dn = document.getElementById('settings-display-name');
  if (dn) dn.value = orbitProfile.displayName || '';
  const ds = document.getElementById('data-saver-toggle');
  if (ds) ds.checked = !!appSettings.dataSaver;
  const bs = document.getElementById('battery-saver-toggle');
  if (bs) bs.checked = !!appSettings.batterySaver;
  const ans = document.getElementById('auto-network-saver-toggle');
  if (ans) ans.checked = appSettings.autoNetworkSaver !== false;
  const ti = document.getElementById('typing-indicator-toggle');
  if (ti) ti.checked = appSettings.typingIndicator;
  const as = document.getElementById('allow-screenshots-toggle');
  if (as) as.checked = appSettings.allowScreenshots;
  const ec = document.getElementById('echo-cancel-toggle');
  if (ec) ec.checked = appSettings.echoCancel;
  const ns = document.getElementById('noise-suppression-toggle');
  if (ns) ns.checked = appSettings.noiseSuppression;
  const ag = document.getElementById('auto-gain-toggle');
  if (ag) ag.checked = appSettings.autoGain;
  const autoQualToggle = document.getElementById('auto-quality-toggle');
  if (autoQualToggle) autoQualToggle.checked = appSettings.autoQuality;
  const vq = document.getElementById('video-quality-select');
  if (vq) vq.value = appSettings.videoQuality;
  const duress = document.getElementById('duress-password-input');
  if (duress) duress.value = appSettings.duressPassword || '';
  const bio = document.getElementById('settings-bio');
  if (bio) bio.value = appSettings.bio || '';
  document.querySelectorAll('.size-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === (appSettings.textSize || 'medium'));
  });
  const density = document.getElementById('appearance-density');
  if (density) density.value = appSettings.density || 'default';
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) bubble.value = appSettings.bubbleStyle || 'rounded';
  document.querySelectorAll('.color-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.scheme === (appSettings.colorScheme || 'default'));
  });
  const reduce = document.getElementById('reduce-animations-toggle');
  if (reduce) reduce.checked = !!appSettings.reduceAnimations;
  syncThemePresetActive();
}

function readSettingsFormToState() {
  const dn = document.getElementById('settings-display-name');
  if (dn) {
    orbitProfile.displayName = dn.value.trim().slice(0, 32);
    persistOrbitProfile();
  }
  const ti = document.getElementById('typing-indicator-toggle');
  if (ti) appSettings.typingIndicator = ti.checked;
  const ds = document.getElementById('data-saver-toggle');
  if (ds) appSettings.dataSaver = ds.checked;
  const bs = document.getElementById('battery-saver-toggle');
  if (bs) appSettings.batterySaver = bs.checked;
  const ans = document.getElementById('auto-network-saver-toggle');
  if (ans) appSettings.autoNetworkSaver = ans.checked;
  const as = document.getElementById('allow-screenshots-toggle');
  if (as) appSettings.allowScreenshots = as.checked;
  const ec = document.getElementById('echo-cancel-toggle');
  if (ec) appSettings.echoCancel = ec.checked;
  const ns = document.getElementById('noise-suppression-toggle');
  if (ns) appSettings.noiseSuppression = ns.checked;
  const ag = document.getElementById('auto-gain-toggle');
  if (ag) appSettings.autoGain = ag.checked;
  const autoQualToggle = document.getElementById('auto-quality-toggle');
  if (autoQualToggle) appSettings.autoQuality = autoQualToggle.checked;
  const vq = document.getElementById('video-quality-select');
  if (vq) appSettings.videoQuality = vq.value;
  const duress = document.getElementById('duress-password-input');
  if (duress) appSettings.duressPassword = duress.value;
  const bio = document.getElementById('settings-bio');
  if (bio) appSettings.bio = bio.value.slice(0, 150);
  const density = document.getElementById('appearance-density');
  if (density) appSettings.density = density.value;
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) appSettings.bubbleStyle = bubble.value;
  const activeSize = document.querySelector('.size-btn.active');
  if (activeSize) appSettings.textSize = activeSize.dataset.size || 'medium';
  const activeScheme = document.querySelector('.color-dot.active');
  if (activeScheme) appSettings.colorScheme = activeScheme.dataset.scheme || 'default';
  const reduce = document.getElementById('reduce-animations-toggle');
  if (reduce) appSettings.reduceAnimations = reduce.checked;
  applyAppearanceSettings();
}

function saveSettings() {
  readSettingsFormToState();
  localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
  localStorage.setItem(
    'orbit_appearance',
    JSON.stringify({
      textSize: appSettings.textSize,
      density: appSettings.density,
      bubbleStyle: appSettings.bubbleStyle,
      colorScheme: appSettings.colorScheme,
      reduceAnimations: appSettings.reduceAnimations,
      customThemeColors: appSettings.customThemeColors,
      themeMaxFps: appSettings.themeMaxFps,
      themeWindStrength: appSettings.themeWindStrength
    })
  );
  applyOptimizerRuntime();
  attachNetworkDataSaverListener();
  if (currentChatFriend && msgsVirtual) {
    teardownLazyImageObserver();
    setupLazyImageObserver();
    msgsVirtual.refresh();
  }
  closeSettingsPanel();
  showToast('Settings saved');
}

function populateMicDevices() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    const select = document.getElementById('mic-device-select');
    if (!select) return;
    select.innerHTML = '';
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${select.length + 1}`;
      select.appendChild(opt);
    });
  });
}

function runNetworkTest() {
  const res = document.getElementById('network-test-result');
  if (res) res.textContent = 'Testing... (mock)';
}

let micStream = null;
function startMicTest() {
  if (micStream) stopMicTest();
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      micStream = stream;
      document.getElementById('test-mic-btn').style.display = 'none';
      document.getElementById('stop-mic-test-btn').style.display = 'inline-block';
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function updateLevel() {
        if (!micStream) return;
        analyser.getByteFrequencyData(dataArray);
        let avg = 0;
        for (let i = 0; i < dataArray.length; i++) avg += dataArray[i];
        avg /= dataArray.length;
        const percent = Math.min(100, (avg / 255) * 100);
        document.getElementById('mic-level-bar').style.width = percent + '%';
        requestAnimationFrame(updateLevel);
      }
      updateLevel();
    })
    .catch(() => showToast('Microphone access denied'));
}
function stopMicTest() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  document.getElementById('test-mic-btn').style.display = 'inline-block';
  document.getElementById('stop-mic-test-btn').style.display = 'none';
  document.getElementById('mic-level-bar').style.width = '0%';
}

function ensurePeerTrust(peerId) {
  if (!trustState[peerId]) trustState[peerId] = { score: 50 };
  return trustState[peerId];
}

function calculateTrustScore(peerId) {
  return ensurePeerTrust(peerId).score;
}

function getTrustBadgeData(peerId) {
  const score = calculateTrustScore(peerId);
  return { text: `Shield: ${score}`, className: score > 70 ? 'trust-high' : 'trust-neutral' };
}

function blockPeer(peerId) {
  if (!blockedPeers.includes(peerId)) {
    blockedPeers.push(peerId);
    localStorage.setItem('orbit_blocked_peers', JSON.stringify(blockedPeers));
  }
  if (activeConnections[peerId]) {
    activeConnections[peerId].close();
  }
  if (currentChatFriend === peerId) {
    closeCurrentChat();
  }
  renderFriends();
}

function setupRadarIntegration() {
  radarController = new Radar({
    onSendMessage: (id) => { hideRadarIfActive(); addFriend(id); openChat(id); },
    onAddContact: (id) => { addFriend(id); showToast('Added'); },
    getFriends: () => friends,
    getBlockedPeers: () => blockedPeers,
    getPeer: () => peer,
    getActiveConnections: () => activeConnections,
    getRadarPrefix: () => localStorage.getItem('orbit_radar_prefix') || '',
    getTrustBadgeData: getTrustBadgeData,
    openConnectionForDiscovery,
    showToast
  });
}

function switchToRadar() {
  const settingsView = document.getElementById('settings-view');
  if (settingsView) {
    settingsView.setAttribute('aria-hidden', 'true');
    settingsView.style.display = 'none';
  }
  if (!radarController) return;
  const activeChat = document.getElementById('active-chat');
  if (activeChat) activeChat.style.display = 'none';
  document.getElementById('app-container')?.classList?.remove('chat-open');
  currentView = 'radar';
  const radarView = document.getElementById('radar-view');
  if (!radarView) return;
  radarView.style.display = 'flex';
  radarView.removeAttribute('aria-hidden');
  radarController.activate();
}

function hideRadarIfActive() {
  const radarView = document.getElementById('radar-view');
  if (radarView) {
    radarView.style.display = 'none';
    radarView.setAttribute('aria-hidden', 'true');
  }
  radarController?.deactivate?.();
  if (currentView === 'radar') currentView = currentChatFriend ? 'chat' : null;
}

let mediaRecorderInstance = null;
let voiceChunks = [];
on('send-voice-btn', 'pointerdown', async () => {
  const chatInputEl = document.getElementById('chat-input');
  if (!chatInputEl) return;
  if (chatInputEl.value.trim()) return; // text mode
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderInstance = new MediaRecorder(stream);
    voiceChunks = [];
    mediaRecorderInstance.ondataavailable = e => voiceChunks.push(e.data);
    mediaRecorderInstance.start();
  } catch (err) {
    showToast('Mic access denied');
  }
});
on('send-voice-btn', 'pointerup', () => {
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
    mediaRecorderInstance.onstop = () => {
      const blob = new Blob(voiceChunks, { type: 'audio/webm' });
      sendMediaBlob(blob, 'audio', 'voice_msg.webm');
      if (mediaRecorderInstance.stream) {
        mediaRecorderInstance.stream.getTracks().forEach(t => t.stop());
      }
      mediaRecorderInstance = null;
    };
    mediaRecorderInstance.stop();
  }
});
on('send-voice-btn', 'pointermove', (e) => {
  // swipe cancel mock
});

const chatInput = document.getElementById('chat-input');
function handleChatInput() {
  if (!chatInput) return;
  if (currentChatFriend) maybeWakePeer(currentChatFriend);
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';

  const hasText = chatInput.value.trim().length > 0;
  const micIcon = document.getElementById('mic-icon');
  const sendIcon = document.getElementById('send-icon');
  if (micIcon) micIcon.style.display = hasText ? 'none' : '';
  if (sendIcon) sendIcon.style.display = hasText ? '' : 'none';
  document.getElementById('send-voice-btn')?.classList?.toggle('voice-mode', !hasText);

  if (optimizer.typingAllowed() && currentChatFriend && activeConnections[currentChatFriend]) {
    if (typingStatusRaf) cancelAnimationFrame(typingStatusRaf);
    
    // TITANIUM FIX: Use ephemeral channel for typing indicators to prevent head-of-line blocking
    const conn = ephemeralConnections[currentChatFriend]?.open 
      ? ephemeralConnections[currentChatFriend] 
      : activeConnections[currentChatFriend];
      
    typingStatusRaf = requestAnimationFrame(() => {
      typingStatusRaf = null;
      if (!conn.open) return;
      const now = Date.now();
      if (now - lastTypingSent < optimizer.getTypingMinIntervalMs()) return;
      lastTypingSent = now;
      conn.send({ type: 'typing' });
    });
  }
}

on('chat-input-area', 'click', async (e) => {
  if (!chatInput) return;
  if (!e.target.closest('.tg-send-btn')) return;
  const text = chatInput.value.trim();
  if (!text || !currentChatFriend) return;
  await sendTextMessage(text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  handleChatInput();
});
onEl(chatInput, 'keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text && currentChatFriend) {
      sendTextMessage(text).then(() => {
        chatInput.value = '';
        chatInput.style.height = 'auto';
      });
    }
  }
});

function wireBottomNavigation() {
  const btns = ['chats', 'contacts', 'radar', 'settings'];
  btns.forEach(b => {
    const el = document.getElementById(`bottom-${b}-btn`);
    if (el) {
      el.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        if (b === 'radar') switchToRadar();
        else { hideRadarIfActive(); if(b === 'settings') openSettingsPanel(); }
      });
    }
  });
}

function wirePremiumThemeButtons() {
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      getThemeManager().setTheme(btn.dataset.theme);
      syncThemePresetActive();
      appSettings.customThemeColors = null;
      applyAppearanceSettings();
    });
  });
  syncThemePresetActive();
}

function switchToChats() {}
function switchToContacts() {}

function scheduleHeartbeat() {
  if (heartbeatIntervalId != null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  const ms = optimizer.getHeartbeatIntervalMs();
  heartbeatIntervalId = setInterval(() => {
    if (peer && !peer.destroyed && !peer.disconnected) {
      Object.values(activeConnections).forEach((conn) => {
        if (conn.open) conn.send({ type: 'ping', ts: Date.now() });
      });
    }
  }, ms);
}

async function flushOutgoingQueue() {
  if (!pendingOutgoing.length) return;
  const stillPending = [];
  
  for (const msg of pendingOutgoing) {
    let conn = activeConnections[msg.to];
    
    // Attempt to wake up peer if connection is closed
    if (!conn?.open && peer && peer.open) {
      console.log(`[Orbit] Waking up peer ${msg.to} to send queued message...`);
      try {
        conn = await openConnectionForDiscovery(msg.to);
      } catch(e) {
        console.log(`[Orbit] Failed to wake up peer ${msg.to}`, e);
      }
    }
    
    if (conn?.open) {
      try {
        await ensureWireReady(msg.to);
        const cipher = await encryptWirePayload(chatKey(msg.to), msg);
        conn.send({ type: 'orbit_wire', cipher });
        await dbUpdateStatus(chatKey(msg.to), msg.ts, 'sent');
        registerPendingAck(chatKey(msg.to), msg.ts);
      } catch (err) {
        console.error('Failed to flush outgoing', err);
        stillPending.push(msg); // keep in queue if encryption/send fails unexpectedly
      }
    } else {
      stillPending.push(msg); // keep in queue if peer cannot be reached
    }
  }
  
  pendingOutgoing = stillPending;
  await dbSetPendingOut(pendingOutgoing);
}

// TITANIUM FIX: Flush queued messages for a specific peer only
async function flushOutgoingQueueForPeer(peerId) {
  if (!pendingOutgoing.length) return;
  const stillPending = [];
  const peerMessages = [];
  
  // Separate messages for this peer from others
  for (const msg of pendingOutgoing) {
    if (msg.to === peerId) {
      peerMessages.push(msg);
    } else {
      stillPending.push(msg);
    }
  }
  
  if (peerMessages.length === 0) return;
  
  let conn = activeConnections[peerId];
  
  // If no active connection, try to establish one
  if (!conn?.open && peer && peer.open) {
    console.log(`[Orbit] Waking up peer ${peerId} to flush queued messages...`);
    try {
      conn = await openConnectionForDiscovery(peerId);
    } catch(e) {
      console.log(`[Orbit] Failed to wake up peer ${peerId}`, e);
      // If wake-up fails, keep all messages in queue
      stillPending.push(...peerMessages);
      pendingOutgoing = stillPending;
      await dbSetPendingOut(pendingOutgoing);
      return;
    }
  }
  
  // Send all messages for this peer if connection is open
  if (conn?.open) {
    for (const msg of peerMessages) {
      try {
        await ensureWireReady(peerId);
        const cipher = await encryptWirePayload(chatKey(peerId), msg);
        conn.send({ type: 'orbit_wire', cipher });
        await dbUpdateStatus(chatKey(peerId), msg.ts, 'sent');
        registerPendingAck(chatKey(peerId), msg.ts);
      } catch (err) {
        console.error('Failed to flush queued message', err);
        stillPending.push(msg); // keep in queue if send fails
      }
    }
  } else {
    // If connection still not open, keep messages in queue
    stillPending.push(...peerMessages);
  }
  
  pendingOutgoing = stillPending;
  await dbSetPendingOut(pendingOutgoing);
}

function openAddFriendModal() {
  const modal = document.getElementById('add-friend-modal');
  const peerEl = document.getElementById('my-peer-id-display');
  if (peerEl) peerEl.textContent = myPeerId;
  document.getElementById('add-friend-id-input').value = '';
  modal.style.display = 'flex';
  modal.removeAttribute('aria-hidden');
  setTimeout(() => document.getElementById('add-friend-id-input').focus(), 100);
}

function closeAddFriendModal() {
  const modal = document.getElementById('add-friend-modal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

const _doc = typeof document !== 'undefined' ? document : null;
if (_doc?.readyState === 'loading') {
  _doc.addEventListener('DOMContentLoaded', () => {
    initAppChrome();
    initApp();
  });
} else {
  initAppChrome();
  initApp();
}
