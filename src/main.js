import Peer from 'peerjs';
import { dbInit, dbGetPage, dbGetLast, dbAdd, dbUpdateStatus, dbDelete, dbClearAll, dbGetPendingOut, dbSetPendingOut } from './core/db.js';
import { cryptoDerive, cryptoLock, cryptoEncrypt, cryptoDecrypt, cryptoDecryptBatch, cryptoSha256Hex } from './core/crypto.js';
import { fileSha256Buffer } from './core/file.js';
import { VirtualScroller } from './ui/virtualScroll.js';
import { createCallManager } from './core/callManager.js';
import { getThemeManager } from './ui/themeManager.js';
import { Radar } from './ui/radar.js';
import { showToast } from './ui/toast.js';
import { encryptWirePayload, decryptWirePayload } from './core/wireCrypto.js';
import { optimizer } from './core/optimizer.js';

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
let idlePeerCheckId = null;
let screenWakeLock = null;
const INCOMING_TRANSFER_TTL_MS = 5 * 60 * 1000;

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
  bio: ''
};
let appSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('orbit_settings') || '{}') };
(() => {
  const appearance = JSON.parse(localStorage.getItem('orbit_appearance') || '{}');
  for (const k of ['textSize', 'density', 'bubbleStyle', 'colorScheme']) {
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
  ackBatchByPeer.clear();
  for (const conn of Object.values(activeConnections)) {
    try {
      conn.close();
    } catch (_) { /* ignore */ }
  }
  activeConnections = {};
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
  callManager = null;
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
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function teardownLazyImageObserver() {
  if (lazyImageObserver) {
    lazyImageObserver.disconnect();
    lazyImageObserver = null;
  }
}

function setupLazyImageObserver() {
  teardownLazyImageObserver();
  if (!optimizer.shouldDeferImagePreview()) return;
  const root = document.getElementById('messages-list');
  if (!root) return;
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
  }
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
    if (!appSettings.batterySaver || !peer || peer.destroyed || !peer.open) return;
    if (callManager?.activeCall) return;
    if (Date.now() - lastUserActivity < 30000) return;
    peerIdleDisconnected = true;
    try {
      peer.disconnect();
    } catch (_) { /* ignore */ }
  }, 15000);
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
  const scheme = COLOR_SCHEME_VARS[appSettings.colorScheme] || COLOR_SCHEME_VARS.default;
  root.style.setProperty('--tg-accent', scheme.accent);
  root.style.setProperty('--tg-accent-dark', scheme.accentDark);
  root.style.setProperty('--tg-bubble-out', scheme.bubbleOut);
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
      applyAppearanceSettings();
    });
  });
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

function initAppChrome() {
  applyBootClasses();
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) optimizer.flushAckNow();
  });
  wireBottomNavigation();
  wirePremiumThemeButtons();
  wireAppearanceControls();
  wireProfileSection();
  wireGroupModal();
  setupRadarIntegration();
  
  const loginBtn = document.getElementById('login-btn');
  const nickInput = document.getElementById('nickname-input');
  const passInput = document.getElementById('password-input');
  const consentCb = document.getElementById('privacy-consent');
  
  const checkLoginReady = () => {
    loginBtn.disabled = !(nickInput.value.length >= 3 && passInput.value.length >= 6 && consentCb.checked);
  };
  
  nickInput.addEventListener('input', checkLoginReady);
  passInput.addEventListener('input', checkLoginReady);
  consentCb.addEventListener('change', checkLoginReady);
  loginBtn.addEventListener('click', loginHandler);
  
  document.getElementById('open-settings-btn').addEventListener('click', openSettingsPanel);
  document.getElementById('close-settings-btn').addEventListener('click', closeSettingsPanel);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('open-add-friend-btn').addEventListener('click', openAddFriendModal);
  document.getElementById('close-add-friend-modal-btn').addEventListener('click', closeAddFriendModal);
  document.getElementById('copy-my-id-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(myPeerId).then(() => showToast('ID copied!')).catch(() => showToast(myPeerId));
  });
  document.getElementById('confirm-add-friend-btn').addEventListener('click', () => {
    const id = document.getElementById('add-friend-id-input').value.trim();
    if (id) { addFriend(id); closeAddFriendModal(); }
  });
  document.getElementById('add-friend-id-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const id = e.target.value.trim();
      if (id) { addFriend(id); closeAddFriendModal(); }
    }
  });
  
  document.getElementById('back-btn').addEventListener('click', closeCurrentChat);
  document.getElementById('chat-input').addEventListener('input', handleChatInput);
  
  document.getElementById('panic-wipe-btn').addEventListener('click', async () => {
    cleanupSession();
    await dbClearAll();
    localStorage.clear();
    location.reload();
  });
  
  document.getElementById('report-peer-btn').addEventListener('click', () => {
    document.getElementById('report-modal').style.display = 'flex';
    document.getElementById('report-modal').removeAttribute('aria-hidden');
  });
  document.getElementById('close-report-btn').addEventListener('click', () => {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-modal').setAttribute('aria-hidden', 'true');
  });
  document.getElementById('submit-report-btn').addEventListener('click', () => {
    if (currentChatFriend) blockPeer(currentChatFriend);
    document.getElementById('report-modal').style.display = 'none';
    showToast('User reported and blocked');
  });
  
  document.getElementById('open-policy-btn').addEventListener('click', () => {
    document.getElementById('policy-modal').style.display = 'flex';
  });
  document.getElementById('close-policy-btn').addEventListener('click', () => {
    document.getElementById('policy-modal').style.display = 'none';
  });
  document.getElementById('accept-policy-btn').addEventListener('click', () => {
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
  
  document.getElementById('unlock-vault-btn').addEventListener('click', async () => {
    const pass = document.getElementById('unlock-password-input').value;
    const ok = await verifyAndUnlockVault(myNickname, pass);
    if (ok) {
      document.getElementById('vault-lock-modal').style.display = 'none';
      document.getElementById('unlock-password-input').value = '';
    } else {
      showToast('Wrong password');
    }
  });

  // Call buttons
  document.getElementById('call-btn').addEventListener('click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, true);
  });
  document.getElementById('audio-call-btn').addEventListener('click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, false);
  });
  document.getElementById('screen-btn').addEventListener('click', () => {
    if (callManager?.activeCall) callManager.startScreenShare();
    else showToast('Start a call first');
  });
  const callShareBtn = document.getElementById('call-screen-share-btn');
  if (callShareBtn) {
    callShareBtn.addEventListener('click', () => {
      if (callManager) callManager.startScreenShare();
    });
  }
  document.getElementById('end-call-btn').addEventListener('click', () => {
    if (callManager) callManager.endCall();
  });
  document.getElementById('call-toggle-audio').addEventListener('click', () => {
    if (callManager) callManager.toggleAudio();
  });
  document.getElementById('call-toggle-video').addEventListener('click', () => {
    if (callManager) callManager.toggleVideo();
  });

  // File attachment
  document.getElementById('file-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatFriend) return;
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file';
    sendMediaBlob(file, type, file.name);
    e.target.value = '';
  });


  // Settings extra buttons
  document.getElementById('test-mic-btn').addEventListener('click', startMicTest);
  document.getElementById('stop-mic-test-btn').addEventListener('click', stopMicTest);
  document.getElementById('run-network-test-btn').addEventListener('click', runNetworkTest);

  // Nearby peer modal
  document.getElementById('nearby-close-btn').addEventListener('click', () => {
    document.getElementById('nearby-peer-modal').style.display = 'none';
  });
  document.getElementById('nearby-send-btn').addEventListener('click', () => {
    const peerId = document.getElementById('nearby-peer-id').textContent;
    if (peerId) { document.getElementById('nearby-peer-modal').style.display = 'none'; addFriend(peerId); openChat(peerId); }
  });
  document.getElementById('nearby-add-btn').addEventListener('click', () => {
    const peerId = document.getElementById('nearby-peer-id').textContent;
    if (peerId) { addFriend(peerId); document.getElementById('nearby-peer-modal').style.display = 'none'; }
  });

  document.getElementById('messages-list').addEventListener('click', (e) => {
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
  
  const ok = await verifyAndUnlockVault(nick, pass);
  if (ok) {
    await startOrbit(nick);
  } else {
    showToast('Wrong password');
  }
}

async function verifyAndUnlockVault(nick, pass) {
  const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
  let verifier = localStorage.getItem(`orbit_verifier_${nick}`);
  
  if (!verifier) {
    localStorage.setItem(`orbit_verifier_${nick}`, passHash);
    await cryptoDerive(pass, nick, 'orbits_salt');
    vaultLocked = false;
    return true;
  }
  
  if (verifier !== passHash) {
    const duressHash = await cryptoSha256Hex(`${nick}:${appSettings.duressPassword || ''}:orbits`);
    if (appSettings.duressPassword && passHash === duressHash) {
      friends = [];
      localStorage.setItem('orbit_friends', '[]');
      await dbClearAll();
      vaultLocked = false;
      return true;
    }
    return false;
  }
  
  await cryptoDerive(pass, nick, 'orbits_salt');
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
  peer = new Peer(peerId);
  
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
  
  peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      showToast('Nickname already in use!');
    } else {
      console.error(err);
    }
  });
}

function connectToAllFriends() {
  if (!peer || peer.destroyed) return; // FIX: защита от вызова после уничтожения пира
  friends.forEach((f, i) => setTimeout(() => tryConnect(f.id), i * 150));
  scheduleHeartbeat();
}

function tryConnect(friendId) {
  if (activeConnections[friendId]) return;
  const conn = peer.connect(friendId, { reliable: true });
  handleOutgoingConnection(conn);
}

function wireConnHandlers(conn) {
  conn.on('data', (d) => receiveMessage(conn.peer, d));
  conn.on('close', () => {
    delete activeConnections[conn.peer];
    scheduleRenderFriends();
  });
}

function requestFriendProfile(peerId) {
  const conn = activeConnections[peerId];
  if (!conn?.open) return;
  conn.send({ type: 'orbit_profile_req', nonce: Date.now() });
}

function handleOutgoingConnection(conn) {
  conn.on('open', () => {
    activeConnections[conn.peer] = conn;
    scheduleRenderFriends();
    flushOutgoingQueue();
    requestFriendProfile(conn.peer);
  });
  wireConnHandlers(conn);
}

function handleIncomingConnection(conn) {
  conn.on('open', () => {
    activeConnections[conn.peer] = conn;
    if (!friends.find(f => f.id === conn.peer)) {
      friends.push({ id: conn.peer, addedAt: Date.now() });
      localStorage.setItem('orbit_friends', JSON.stringify(friends));
    }
    scheduleRenderFriends();
    requestFriendProfile(conn.peer);
  });
  wireConnHandlers(conn);
}

function openConnectionForDiscovery(remoteId) {
  return new Promise((resolve, reject) => {
    if (!peer?.open) return reject(new Error('Peer not ready'));
    if (activeConnections[remoteId]?.open) return resolve(activeConnections[remoteId]);
    const conn = peer.connect(remoteId, { reliable: true });
    const to = setTimeout(() => {
      try {
        conn.close();
      } catch (_) { /* ignore */ }
      reject(new Error('timeout'));
    }, 12000);
    conn.on('open', () => {
      clearTimeout(to);
      activeConnections[remoteId] = conn;
      scheduleRenderFriends();
      flushOutgoingQueue();
      wireConnHandlers(conn);
      resolve(conn);
    });
    conn.on('error', () => {
      clearTimeout(to);
      reject(new Error('Peer error'));
    });
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
    div.onclick = () => openChat(f.id);

    const avatarHtml = photo
      ? `<div class="friend-avatar" style="background-image:url('${escapeAttr(photo)}');background-size:cover;background-position:center;"></div>`
      : `<div class="friend-avatar">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>`;

    div.innerHTML = `
      ${avatarHtml}
      <div style="flex:1;margin-left:12px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(displayName)}</strong>
          <span style="color:${isOnline ? 'var(--tg-online)' : 'var(--tg-offline)'};font-size:12px;margin-left:4px;">${isOnline ? '●' : '○'}</span>
        </div>
        <div style="color:var(--tg-text-secondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preview)}</div>
      </div>
    `;
    list.appendChild(div);
  });
}
function addFriend(id) {
  const normalized = id.trim().toUpperCase();
  if (!normalized || normalized.length < 3) return showToast('Invalid ID');
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
  touchUserActivity();
  cleanupCurrentView();
  currentView = 'chat';
  chatAbortController = new AbortController();
  const chatSig = chatAbortController.signal;

  currentChatFriend = friendId;
  document.getElementById('active-chat').style.display = 'flex';

  const fp = friendProfiles[friendId] || {};
  const friendDisplayName = fp.displayName || friendId;
  document.getElementById('chat-friend-name').textContent = friendDisplayName;

  const isOnline = !!activeConnections[friendId];
  document.getElementById('chat-friend-status').textContent = isOnline ? 'online' : 'offline';
  document.getElementById('chat-friend-status').style.color = isOnline ? 'var(--tg-online)' : 'var(--tg-text-secondary)';

  const avatarEl = document.getElementById('current-chat-avatar');
  if (fp.photo) {
    avatarEl.style.backgroundImage = `url('${fp.photo}')`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    avatarEl.textContent = '';
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
          messageWindow = [...dec, ...messageWindow];
          applyBubbleGrouping();
          msgsVirtual.insertRowsAtStart(dec.length);
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
}

async function loadInitialMessagesForChat() {
  const page = getMessagePage();
  const rows = await dbGetPage(chatKey(), page, null);
  messageWindow = await decodeMessageRows(rows);
  messageWindow.sort((a, b) => a.ts - b.ts);
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
    if (optimizer.shouldDeferImagePreview()) {
      contentHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" class="msg-media-img orbit-lazy-img" data-orbit-src="${escapeAttr(msg.url)}">`;
    } else {
      contentHtml = `<img src="${escapeAttr(msg.url)}" alt="" class="msg-media-img">`;
    }
  } else if (msg.type === 'audio') {
    contentHtml = `<audio src="${msg.url}" controls class="msg-media-audio"></audio>`;
  } else {
    contentHtml = `<div class="msg-file">${escapeHtml(msg.name || 'File')}</div>`;
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
  const conn = activeConnections[currentChatFriend];
  if (conn?.open) {
    try {
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
    } catch (err) {
      msg.status = 'failed';
      await dbUpdateStatus(chatKey(), ts, 'failed');
    }
    if (msgsVirtual) msgsVirtual.refresh();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function mergeMessageIntoView(msg) {
  if (currentChatFriend !== (msg.from === myPeerId ? msg.to : msg.from)) return;
  messageWindow.push(msg);
  trimMessageWindow();
  applyBubbleGrouping();
  if (msgsVirtual) {
    msgsVirtual.refresh();
    msgsVirtual.scrollToBottom();
  }
}

async function receiveMessage(senderId, data) {
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'ping') return;
  if (data.type !== 'typing') touchUserActivity();

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
          avatarEl.style.backgroundImage = `url('${data.profile.photo}')`;
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
          avatarEl.textContent = '';
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
async function sendMediaBlob(file, type, name) {
  touchUserActivity();
  let workFile = file;
  let workName = name;
  if (type === 'image' && optimizer.shouldCompressOutgoingImages() && file?.type?.startsWith('image/')) {
    try {
      workFile = await optimizer.compressImageFile(file, 800, 0.7);
      workName = String(name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
    } catch (err) {
      console.warn('Image compress skipped', err);
    }
  }
  
  // Для файлов больше 10 МБ используем чанкинг (избегаем data URL)
  const MAX_INLINE_SIZE = 10 * 1024 * 1024;
  if (workFile.size > MAX_INLINE_SIZE) {
    showToast('Large file: sending in chunks...');
    await sendChunkedFile(workFile, type, workName);
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const buffer = e.target.result;
    const url = arrayBufferToDataUrl(buffer, workFile.type || file.type);
    const msg = { type, url, name: workName, ts: Date.now(), from: myPeerId, to: currentChatFriend, status: 'pending' };
    await saveMsgToDB(chatKey(), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    const conn = activeConnections[currentChatFriend];
    if (conn) {
      try {
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
        console.error('Wire encrypt failed', err);
        conn.send(msg);
      }
      msg.status = 'sent';
      await dbUpdateStatus(chatKey(), msg.ts, 'sent');
      registerPendingAck(chatKey(), msg.ts);
      if (msgsVirtual) msgsVirtual.refresh();
    }
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
  const modal = document.getElementById('settings-modal');
  currentView = 'settings';
  modal.style.display = 'flex';
  setTimeout(() => modal.removeAttribute('aria-hidden'), 10);
}

function closeSettingsPanel() {
  const modal = document.getElementById('settings-modal');
  modal.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    modal.style.display = 'none';
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
  document.getElementById('typing-indicator-toggle').checked = appSettings.typingIndicator;
  document.getElementById('allow-screenshots-toggle').checked = appSettings.allowScreenshots;
  document.getElementById('echo-cancel-toggle').checked = appSettings.echoCancel;
  document.getElementById('noise-suppression-toggle').checked = appSettings.noiseSuppression;
  document.getElementById('auto-gain-toggle').checked = appSettings.autoGain;
  document.getElementById('auto-quality-toggle').checked = appSettings.autoQuality;
  document.getElementById('video-quality-select').value = appSettings.videoQuality;
  document.getElementById('duress-password-input').value = appSettings.duressPassword || '';
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
  syncThemePresetActive();
}

function readSettingsFormToState() {
  const dn = document.getElementById('settings-display-name');
  if (dn) {
    orbitProfile.displayName = dn.value.trim().slice(0, 32);
    persistOrbitProfile();
  }
  appSettings.typingIndicator = document.getElementById('typing-indicator-toggle').checked;
  const ds = document.getElementById('data-saver-toggle');
  if (ds) appSettings.dataSaver = ds.checked;
  const bs = document.getElementById('battery-saver-toggle');
  if (bs) appSettings.batterySaver = bs.checked;
  const ans = document.getElementById('auto-network-saver-toggle');
  if (ans) appSettings.autoNetworkSaver = ans.checked;
  appSettings.allowScreenshots = document.getElementById('allow-screenshots-toggle').checked;
  appSettings.echoCancel = document.getElementById('echo-cancel-toggle').checked;
  appSettings.noiseSuppression = document.getElementById('noise-suppression-toggle').checked;
  appSettings.autoGain = document.getElementById('auto-gain-toggle').checked;
  appSettings.autoQuality = document.getElementById('auto-quality-toggle').checked;
  appSettings.videoQuality = document.getElementById('video-quality-select').value;
  appSettings.duressPassword = document.getElementById('duress-password-input').value;
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
      colorScheme: appSettings.colorScheme
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
  const modal = document.getElementById('settings-modal');
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  currentView = 'radar';
  document.getElementById('radar-view').style.display = 'flex';
  document.getElementById('radar-view').removeAttribute('aria-hidden');
  radarController.activate();
}

function hideRadarIfActive() {
  document.getElementById('radar-view').style.display = 'none';
  document.getElementById('radar-view').setAttribute('aria-hidden', 'true');
  radarController.deactivate();
  if (currentView === 'radar') currentView = currentChatFriend ? 'chat' : null;
}

let mediaRecorderInstance = null;
let voiceChunks = [];
document.getElementById('send-voice-btn').addEventListener('pointerdown', async () => {
  const chatInputEl = document.getElementById('chat-input');
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
document.getElementById('send-voice-btn').addEventListener('pointerup', () => {
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
document.getElementById('send-voice-btn').addEventListener('pointermove', (e) => {
  // swipe cancel mock
});

const chatInput = document.getElementById('chat-input');
function handleChatInput() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';

  const hasText = chatInput.value.trim().length > 0;
  const micIcon = document.getElementById('mic-icon');
  const sendIcon = document.getElementById('send-icon');
  if (micIcon) micIcon.style.display = hasText ? 'none' : '';
  if (sendIcon) sendIcon.style.display = hasText ? '' : 'none';
  document.getElementById('send-voice-btn').classList.toggle('voice-mode', !hasText);

  if (optimizer.typingAllowed() && currentChatFriend && activeConnections[currentChatFriend]) {
    if (typingStatusRaf) cancelAnimationFrame(typingStatusRaf);
    const conn = activeConnections[currentChatFriend];
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

document.getElementById('chat-input-area').addEventListener('click', async (e) => {
  if (!e.target.closest('.tg-send-btn')) return;
  const text = chatInput.value.trim();
  if (!text || !currentChatFriend) return;
  await sendTextMessage(text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  handleChatInput();
});
chatInput.addEventListener('keydown', (e) => {
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
  for (const msg of pendingOutgoing) {
    const conn = activeConnections[msg.to];
    if (conn?.open) {
      try {
        const cipher = await encryptWirePayload(chatKey(msg.to), msg);
        conn.send({ type: 'orbit_wire', cipher });
        await dbUpdateStatus(chatKey(msg.to), msg.ts, 'sent');
        registerPendingAck(chatKey(msg.to), msg.ts);
      } catch (err) {
        console.error('Failed to flush outgoing', err);
      }
    }
  }
  await dbSetPendingOut([]);
  pendingOutgoing = [];
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
