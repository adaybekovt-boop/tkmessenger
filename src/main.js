import Peer from 'peerjs';
import {
    dbInit,
    dbGetPage,
    dbGetLast,
    dbAdd,
    dbUpdateStatus,
    dbDelete,
    dbClearAll,
    dbGetPendingOut,
    dbSetPendingOut
} from './core/db.js';
import {
    cryptoDerive,
    cryptoLock,
    cryptoEncrypt,
    cryptoDecrypt,
    cryptoDecryptBatch,
    cryptoSha256Hex,
    cryptoSha256Buffer
} from './core/crypto.js';
import { fileSha256Buffer } from './core/file.js';
import { mark, measure, initLongTaskObserver, startFpsOverlay, startDevPerfOverlay } from './utils/perf.js';
import { VirtualScroller } from './ui/virtualScroll.js';
import { createCallManager } from './core/callManager.js';
import { getThemeManager, THEMES } from './ui/themeManager.js';
import { Radar } from './ui/radar.js';
import { showToast } from './ui/toast.js';

const themeManager = getThemeManager();

// i18n Localization
const userLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
const i18n = {
    en: { accept: "Accept", decline: "Decline", incoming: "Incoming call", caller: "is calling...", camError: "No access to camera or mic. Starting audio call.", camFallback: "Unable to access camera. Audio call started.", mediaError: "Access denied. Ensure mic/camera permissions are granted.", endCall: "End Call", callingError: "User must be 'Online' to call!" },
    ru: { accept: "Принять", decline: "Отклонить", incoming: "Входящий вызов", caller: "вызывает...", camError: "Нет доступа к камере или микрофону. Включен аудио-звонок.", camFallback: "Не удалось получить доступ к камере. Включен голосовой вызов.", mediaError: "Действие отклонено. Убедитесь, что выдали права на микрофон и камеру.", endCall: "Завершить звонок", callingError: "Пользователь должен быть 'В сети' для звонка!" }
};
const t = i18n[userLang];
// System Notification Setup
if (window.Notification && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission().catch(console.warn);
}

// DOM Elements
const loginPanel = document.getElementById('login-panel');
const loginBtn = document.getElementById('login-btn');
const nicknameInput = document.getElementById('nickname-input');
const passwordInput = document.getElementById('password-input');
const privacyConsent = document.getElementById('privacy-consent');
const openPolicyBtn = document.getElementById('open-policy-btn');
const policyModal = document.getElementById('policy-modal');
const closePolicyBtn = document.getElementById('close-policy-btn');
const acceptPolicyBtn = document.getElementById('accept-policy-btn');
const policyScrollbox = document.getElementById('policy-scrollbox');
const appContainer = document.getElementById('app-container');

const myIdDisplay = document.getElementById('my-id-display');
const myAvatarLetter = document.getElementById('my-avatar-letter');
const friendsListContainer = document.getElementById('friends-list');
const addFriendInput = document.getElementById('add-friend-input');
const addFriendBtn = document.getElementById('add-friend-btn');

const chatAreaEmpty = document.getElementById('empty-state');
const chatAreaActive = document.getElementById('active-chat');
const chatFriendName = document.getElementById('chat-friend-name');
const currentChatAvatarText = document.getElementById('current-chat-avatar');

const messagesList = document.getElementById('messages-list');
const chatInput = document.getElementById('chat-input');
const sendVoiceBtn = document.getElementById('send-voice-btn');
const micIcon = document.getElementById('mic-icon');
const sendIcon = document.getElementById('send-icon');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const ttlSelect = document.getElementById('ttl-select');
const backBtn = document.getElementById('back-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsDisplayName = document.getElementById('settings-display-name');
const micDeviceSelect = document.getElementById('mic-device-select');
const echoCancelToggle = document.getElementById('echo-cancel-toggle');
const noiseSuppressionToggle = document.getElementById('noise-suppression-toggle');
const autoGainToggle = document.getElementById('auto-gain-toggle');
const autoQualityToggle = document.getElementById('auto-quality-toggle');
const videoQualitySelect = document.getElementById('video-quality-select');
const typingIndicatorToggle = document.getElementById('typing-indicator-toggle');
const runNetworkTestBtn = document.getElementById('run-network-test-btn');
const networkTestResult = document.getElementById('network-test-result');
const testMicBtn = document.getElementById('test-mic-btn');
const stopMicTestBtn = document.getElementById('stop-mic-test-btn');
const micLevelBar = document.getElementById('mic-level-bar');
const duressPasswordInput = document.getElementById('duress-password-input');
const allowScreenshotsToggle = document.getElementById('allow-screenshots-toggle');
const panicWipeBtn = document.getElementById('panic-wipe-btn');
const trustBadge = document.getElementById('trust-badge');
const reportPeerBtn = document.getElementById('report-peer-btn');
const reportModal = document.getElementById('report-modal');
const closeReportBtn = document.getElementById('close-report-btn');
const submitReportBtn = document.getElementById('submit-report-btn');
const chatWarningBanner = document.getElementById('chat-warning-banner');
const vaultLockModal = document.getElementById('vault-lock-modal');
const unlockPasswordInput = document.getElementById('unlock-password-input');
const unlockVaultBtn = document.getElementById('unlock-vault-btn');

const bottomChatsBtn = document.getElementById('bottom-chats-btn');
const bottomContactsBtn = document.getElementById('bottom-contacts-btn');
const bottomRadarBtn = document.getElementById('bottom-radar-btn');
const bottomSettingsBtn = document.getElementById('bottom-settings-btn');
const radarView = document.getElementById('radar-view');
/** @type {{ activate: () => void; deactivate: () => void; dispose: () => void } | null} */
let radarController = null;
const chatsTitleEl = document.querySelector('.chats-title');
const addFriendBoxEl = document.querySelector('.add-friend-box');
const contactsEmptyState = document.getElementById('contacts-empty-state');

// Video Calls
const callBtn = document.getElementById('call-btn');
const audioCallBtn = document.getElementById('audio-call-btn');
const screenBtn = document.getElementById('screen-btn');
const callScreen = document.getElementById('call-screen');
const callUserName = document.getElementById('call-user-name');
const callStatus = document.getElementById('call-status');
const callToggleAudio = document.getElementById('call-toggle-audio');
const callToggleVideo = document.getElementById('call-toggle-video');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const endCallBtn = document.getElementById('end-call-btn');

const incomingCallModal = document.getElementById('incoming-call-modal');
const callerNameDisplay = document.getElementById('caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

// Apply localization
if (callerNameDisplay) callerNameDisplay.textContent = t.incoming;
if (acceptCallBtn) acceptCallBtn.textContent = t.accept;
if (rejectCallBtn) rejectCallBtn.textContent = t.decline;
if (endCallBtn) endCallBtn.textContent = t.endCall;

// --- IndexedDB + crypto run in Web Workers (orbit-workers.js) — UI thread stays responsive. ---

async function saveMsgToDB(chatId, msgObj) {
    const encrypted = await cryptoEncrypt(msgObj);
    await dbAdd({
        chatId,
        ts: msgObj.ts,
        status: msgObj.status || '',
        from: msgObj.from || '',
        type: msgObj.type || '',
        name: msgObj.name || '',
        enc: encrypted,
        legacyContent: ''
    });
}

/** Decode rows from DB worker (batch decrypt in crypto worker). */
async function decodeMessageRows(rows) {
    const legacy = [];
    const encPairs = [];
    for (const row of rows) {
        if (row.enc) encPairs.push(row);
        else {
            legacy.push({
                from: row.from,
                type: row.type,
                content: row.legacyContent,
                name: row.name,
                ts: row.ts,
                status: row.status
            });
        }
    }
    let decs = [];
    if (encPairs.length) {
        decs = await cryptoDecryptBatch(encPairs.map((r) => r.enc));
    }
    const out = [...legacy];
    for (let i = 0; i < encPairs.length; i++) {
        const row = encPairs[i];
        const dec = decs[i];
        if (dec) out.push({ ...dec, ts: row.ts, status: row.status || dec.status });
    }
    return out.sort((a, b) => a.ts - b.ts);
}

async function getLastMessagePreview(chatId) {
    const row = await dbGetLast(chatId);
    if (!row) return null;
    if (row.enc) {
        const dec = await cryptoDecrypt(row.enc);
        if (!dec) return null;
        return { ...dec, ts: row.ts, status: row.status || dec.status };
    }
    return {
        from: row.from,
        type: row.type,
        content: row.legacyContent,
        name: row.name,
        ts: row.ts,
        status: row.status
    };
}

const updateMsgStatusInDB = (chatId, ts, status) => dbUpdateStatus(chatId, ts, status);
const deleteMsgInDB = (chatId, ts) => dbDelete(chatId, ts);
const clearAllMessagesDB = () => dbClearAll();

// State
let peer = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {};
let callManager = null;
let currentChatFriend = null;
let isOffline = !navigator.onLine;
let pendingOutgoing = [];

async function persistPendingOutgoing() {
    try {
        localStorage.setItem('orbit_pending_out', JSON.stringify(pendingOutgoing));
        await dbSetPendingOut(pendingOutgoing);
    } catch (_) {}
}
let peerRtt = {};
let micTestStream = null;
let micTestAudioCtx = null;
let micTestAnalyser = null;
let micTestAnimation = null;
let vaultLocked = false;
let lockTimer = null;
let hiddenAt = null;
let outgoingChunkCache = new Map();
const incomingTransfers = new Map();

/** In-memory window for active chat (paginated from DB worker). */
let messageWindow = [];
let hasMoreOlderMessages = true;
let messagesLoadingOlder = false;
const MESSAGE_PAGE = 50;
const IS_IOS =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MESSAGE_WINDOW_MAX = IS_IOS ? 1200 : 4000;
/** @type {VirtualScroller | null} */
let msgsVirtual = null;

function chatKey() {
    return `chat_${myNickname}_${currentChatFriend}`;
}

const defaultSettings = {
    displayName: '',
    micDeviceId: '',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    autoQuality: true,
    videoQuality: 'medium',
    typingIndicator: true,
    duressPasswordHash: '',
    allowScreenshots: false
};

let appSettings = {
    ...defaultSettings,
    ...(JSON.parse(localStorage.getItem('orbit_settings') || '{}'))
};

let trustState = JSON.parse(localStorage.getItem('orbit_trust') || '{}');
let blockedPeers = JSON.parse(localStorage.getItem('orbit_blocked_peers') || '[]');
let reportLog = JSON.parse(localStorage.getItem('orbit_report_log') || '[]');

// Initialization
const policyAccepted = localStorage.getItem('orbits_policy_accepted') === 'true';
if (privacyConsent) {
    privacyConsent.checked = policyAccepted;
}
if (loginBtn) {
    loginBtn.disabled = !policyAccepted;
}

if (openPolicyBtn) {
    openPolicyBtn.onclick = () => {
        policyModal.style.display = 'flex';
        policyModal.setAttribute('aria-hidden', 'false');
        policyScrollbox.scrollTop = 0;
    };
}
if (closePolicyBtn) {
    closePolicyBtn.onclick = () => {
        policyModal.style.display = 'none';
        policyModal.setAttribute('aria-hidden', 'true');
    };
}
if (acceptPolicyBtn) {
    acceptPolicyBtn.onclick = () => {
        localStorage.setItem('orbits_policy_accepted', 'true');
        privacyConsent.checked = true;
        loginBtn.disabled = false;
        policyModal.style.display = 'none';
        policyModal.setAttribute('aria-hidden', 'true');
    };
}
if (privacyConsent) {
    privacyConsent.onchange = () => {
        loginBtn.disabled = !privacyConsent.checked;
    };
}

function closeSettingsPanel() {
    if (!settingsModal) return;
    settingsModal.style.display = 'none';
    settingsModal.setAttribute('aria-hidden', 'true');
    stopMicTest();
}

function syncPremiumThemeButtons() {
    const cur = themeManager.getCurrentTheme();
    document.querySelectorAll('.theme-preset-btn[data-theme]').forEach((btn) => {
        const on = btn.dataset.theme === cur;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

function wirePremiumThemeButtons() {
    document.querySelectorAll('.theme-preset-btn[data-theme]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const t = btn.dataset.theme;
            if (Object.values(THEMES).includes(t)) {
                themeManager.setTheme(t);
                syncPremiumThemeButtons();
            }
        });
    });
    syncPremiumThemeButtons();
}

/** One DOMContentLoaded: avoids duplicate init and guarantees DOM before nav/theme wiring. */
function initAppChrome() {
    wireBottomNavigation();
    wirePremiumThemeButtons();
    setupRadarIntegration();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppChrome, { once: true });
} else {
    initAppChrome();
}

async function openSettingsPanel() {
    if (!settingsModal) return;
    if (bottomRadarBtn?.classList.contains('active')) {
        hideRadarIfActive();
        bottomChatsBtn?.classList.add('active');
        bottomRadarBtn?.classList.remove('active');
        bottomContactsBtn?.classList.remove('active');
    }
    settingsModal.style.display = 'flex';
    settingsModal.setAttribute('aria-hidden', 'false');
    syncSettingsFormFromState();
    syncPremiumThemeButtons();
    await populateMicDevices();
}

if (openSettingsBtn) {
    openSettingsBtn.addEventListener(
        'click',
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            void openSettingsPanel();
        },
        { passive: false }
    );
}

function restoreMainChatPanels() {
    if (!chatAreaEmpty || !chatAreaActive) return;
    if (appContainer.classList.contains('chat-open') && currentChatFriend) {
        chatAreaActive.style.display = 'flex';
        chatAreaEmpty.style.display = 'none';
    } else {
        chatAreaActive.style.display = 'none';
        chatAreaEmpty.style.display = 'flex';
    }
}

function hideRadarIfActive() {
    if (!radarView || radarView.style.display === 'none') return;
    radarView.style.display = 'none';
    radarView.setAttribute('aria-hidden', 'true');
    radarController?.deactivate();
    restoreMainChatPanels();
}

function switchToChats(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    hideRadarIfActive();
    bottomChatsBtn?.classList.add('active');
    bottomContactsBtn?.classList.remove('active');
    bottomRadarBtn?.classList.remove('active');
    bottomSettingsBtn?.classList.remove('active');
    if (chatsTitleEl) chatsTitleEl.textContent = 'Chats';
    if (addFriendBoxEl) addFriendBoxEl.style.display = '';
    if (contactsEmptyState) {
        contactsEmptyState.style.display = 'none';
        contactsEmptyState.setAttribute('aria-hidden', 'true');
    }
}

function switchToContacts(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    hideRadarIfActive();
    bottomContactsBtn?.classList.add('active');
    bottomChatsBtn?.classList.remove('active');
    bottomRadarBtn?.classList.remove('active');
    bottomSettingsBtn?.classList.remove('active');
    if (chatsTitleEl) chatsTitleEl.textContent = 'Contacts';
    if (addFriendBoxEl) addFriendBoxEl.style.display = 'none';
    if (contactsEmptyState) {
        const empty = !friends.length;
        contactsEmptyState.style.display = empty ? 'block' : 'none';
        contactsEmptyState.setAttribute('aria-hidden', empty ? 'false' : 'true');
    }
}

function switchToRadar(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    bottomRadarBtn?.classList.add('active');
    bottomChatsBtn?.classList.remove('active');
    bottomContactsBtn?.classList.remove('active');
    bottomSettingsBtn?.classList.remove('active');
    if (chatsTitleEl) chatsTitleEl.textContent = 'Radar';
    if (addFriendBoxEl) addFriendBoxEl.style.display = 'none';
    if (contactsEmptyState) {
        contactsEmptyState.style.display = 'none';
        contactsEmptyState.setAttribute('aria-hidden', 'true');
    }
    if (chatAreaEmpty) chatAreaEmpty.style.display = 'none';
    if (chatAreaActive) chatAreaActive.style.display = 'none';
    if (radarView) {
        radarView.style.display = 'flex';
        radarView.setAttribute('aria-hidden', 'false');
    }
    radarController?.activate();
}

function onBottomSettingsClick(e) {
    e.preventDefault();
    e.stopPropagation();
    void openSettingsPanel();
}

/** Bottom nav — single listeners per button (wired once via initAppChrome). */
function wireBottomNavigation() {
    if (bottomSettingsBtn) {
        bottomSettingsBtn.addEventListener('click', onBottomSettingsClick, { passive: false });
    }
    if (bottomChatsBtn) {
        bottomChatsBtn.addEventListener('click', switchToChats, { passive: false });
    }
    if (bottomContactsBtn) {
        bottomContactsBtn.addEventListener('click', switchToContacts, { passive: false });
    }
    if (bottomRadarBtn) {
        bottomRadarBtn.addEventListener('click', switchToRadar, { passive: false });
    }
}

function setupRadarIntegration() {
    radarController = new Radar({
        onSendMessage: (peerId) => {
            switchToChats();
            void openChat(peerId);
        },
        onAddContact: (peerId) => {
            switchToChats();
            addFriend(peerId);
        },
        getFriends: () => friends,
        getBlockedPeers: () => blockedPeers
    });
}

if (settingsModal) {
    settingsModal.addEventListener(
        'click',
        (e) => {
            if (e.target === settingsModal) {
                closeSettingsPanel();
            }
        },
        { passive: true }
    );
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener(
        'click',
        (e) => {
            e.preventDefault();
            closeSettingsPanel();
        },
        { passive: false }
    );
}
if (autoQualityToggle) {
    autoQualityToggle.onchange = () => {
        videoQualitySelect.disabled = autoQualityToggle.checked;
    };
}
if (runNetworkTestBtn) {
    runNetworkTestBtn.onclick = async () => {
        readSettingsFormToState();
        saveSettings();
        await runNetworkTest();
    };
}
if (testMicBtn) {
    testMicBtn.onclick = async () => {
        readSettingsFormToState();
        await startMicTest();
    };
}
if (stopMicTestBtn) {
    stopMicTestBtn.onclick = () => stopMicTest();
}
if (saveSettingsBtn) {
    saveSettingsBtn.onclick = async () => {
        readSettingsFormToState();
        const duressRaw = duressPasswordInput.value.trim();
        if (duressRaw.length > 0) {
            if (duressRaw.length < 6) {
                showToast('Лже-пароль минимум 6 символов.');
                return;
            }
            appSettings.duressPasswordHash = await cryptoSha256Hex(`${myNickname}:${duressRaw}:orbits`);
        }
        saveSettings();
        applyProfileToUI();
        await applyVideoQualityToLiveCall(appSettings.videoQuality);
        closeSettingsPanel();
    };
}

if (reportPeerBtn) {
    reportPeerBtn.onclick = () => {
        if (!currentChatFriend) return;
        reportModal.style.display = 'flex';
        reportModal.setAttribute('aria-hidden', 'false');
    };
}
if (closeReportBtn) {
    closeReportBtn.onclick = () => {
        reportModal.style.display = 'none';
        reportModal.setAttribute('aria-hidden', 'true');
    };
}
if (submitReportBtn) {
    submitReportBtn.onclick = () => {
        if (!currentChatFriend) return;
        const now = Date.now();
        reportLog = reportLog.filter(ts => now - ts < 60 * 60 * 1000);
        if (reportLog.length >= 3) {
            showToast('Лимит жалоб: не более 3 в час.');
            return;
        }
        reportLog.push(now);
        localStorage.setItem('orbit_report_log', JSON.stringify(reportLog));

        const selectedReason = document.querySelector('input[name="report-reason"]:checked')?.value || 'spam';
        const entry = ensurePeerTrust(currentChatFriend);
        entry.reports[selectedReason] = (entry.reports[selectedReason] || 0) + 1;
        const profileCreated = Number(localStorage.getItem('orbit_profile_created_at') || Date.now());
        const ageDays = Math.max(1, (Date.now() - profileCreated) / (1000 * 60 * 60 * 24));
        const baseWeight = selectedReason === 'fraud' ? 30 : (selectedReason === 'abuse' ? 25 : 20);
        const ageWeight = Math.min(2.2, 1 + (ageDays / 30));
        entry.reportWeight = (entry.reportWeight || 0) + (baseWeight * ageWeight);
        persistTrustState();
        blockPeer(currentChatFriend);
        updateTrustBadge(currentChatFriend);
        reportModal.style.display = 'none';
        reportModal.setAttribute('aria-hidden', 'true');
        showToast('Жалоба отправлена. Пользователь заблокирован локально.');
    };
}
if (panicWipeBtn) {
    panicWipeBtn.onclick = async () => {
        const ok = confirm('Это удалит все локальные данные Orbits на этом устройстве. Продолжить?');
        if (!ok) return;
        await clearAllMessagesDB();
        localStorage.clear();
        location.reload();
    };
}

syncSettingsFormFromState();

async function initApp() {
    console.log('[Init] Starting app initialization...');
    try {
        await dbInit();
        console.log('[Init] dbInit successful.');
        
        try {
            await cryptoDerive('test', 'test');
            console.log('[Init] Crypto worker ping successful.');
        } catch (err) {
            console.error('[Init] Crypto worker not responding:', err);
        }

        try {
            const fromDb = await dbGetPendingOut();
            if (fromDb && fromDb.length) {
                pendingOutgoing = fromDb;
            } else {
                pendingOutgoing = JSON.parse(localStorage.getItem('orbit_pending_out') || '[]');
                if (pendingOutgoing.length) await dbSetPendingOut(pendingOutgoing);
            }
        } catch {
            pendingOutgoing = JSON.parse(localStorage.getItem('orbit_pending_out') || '[]');
        }
    } catch (err) {
        console.error("DB Init error", err);
        showToast("Ошибка инициализации базы данных. Возможно, вы используете приватный режим, или IndexedDB заблокирован: " + err.message);
    }
}

initApp();

initLongTaskObserver((e) => {
    if (import.meta.env?.DEV) console.warn('[longtask]', e.duration, e);
});
startDevPerfOverlay({
    getActiveConnections: () => Object.keys(activeConnections).filter((id) => activeConnections[id]?.open).length,
    getRenderedDomCount: () => messagesList.querySelectorAll('.orbit-vs-row').length,
    getMessageModelCount: () => messageWindow.length
});
const savedNick = localStorage.getItem('orbit_nickname');
if (savedNick) nicknameInput.value = savedNick;
if (!policyAccepted) localStorage.removeItem('orbit_nickname');
loginPanel.style.display = 'block';
applyNetworkState();

if (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4) {
    document.body.classList.add('low-perf');
}

async function verifyAndUnlockVault(nick, password) {
    try {
        const verifierKey = `orbit_vault_verifier_${nick}`;
        const passHash = await cryptoSha256Hex(`${nick}:${password}:orbits`);
        const existingVerifier = localStorage.getItem(verifierKey);
        
        const saltKey = `orbit_salt_${nick}`;
        let salt = localStorage.getItem(saltKey);
        if (!salt) {
            salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
            localStorage.setItem(saltKey, salt);
        }

        if (!existingVerifier) {
            localStorage.setItem(verifierKey, passHash);
        } else if (existingVerifier !== passHash) {
            if (appSettings.duressPasswordHash && appSettings.duressPasswordHash === passHash) {
                console.warn('[Vault] Duress password triggered');
                friends = [];
                localStorage.setItem('orbit_friends', '[]');
                Object.values(activeConnections).forEach(conn => conn.close());
                activeConnections = {};
                await cryptoDerive(password, nick, salt);
                vaultLocked = false;
                return true;
            }
            return false;
        }
        await cryptoDerive(password, nick, salt);
        vaultLocked = false;
        return true;
    } catch (err) {
        console.error('[Vault] Error verifying and unlocking vault:', err);
        throw err;
    }
}

async function lockVault() {
    await cryptoLock();
    vaultLocked = true;
    vaultLockModal.style.display = 'flex';
    vaultLockModal.setAttribute('aria-hidden', 'false');
    setSendAvailability();
}

function loginHandler() {
    if (!privacyConsent.checked) {
        showToast('Сначала примите Политику конфиденциальности.');
        return;
    }
    const nick = nicknameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    const pass = passwordInput.value.trim();
    if (nick.length < 3) return showToast('Ник должен быть минимум 3 символа (буквы, цифры, _)');
    if (pass.length < 6) return showToast('Мастер-пароль минимум 6 символов.');
    
    console.log('[Login] Privacy consent:', privacyConsent.checked);
    console.log('[Login] Raw nickname:', nicknameInput.value);
    console.log('[Login] Sanitized nickname:', nick);
    console.log('[Login] Password length:', pass.length);
    console.log('[Login] Starting vault verification...');
    
    const originalText = loginBtn.textContent;
    loginBtn.textContent = 'Connecting...';
    loginBtn.disabled = true;

    verifyAndUnlockVault(nick, pass).then(unlocked => {
        console.log('[Login] Vault unlocked:', unlocked);
        if (!unlocked) {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
            return showToast('Неверный мастер-пароль.');
        }
        localStorage.setItem('orbits_policy_accepted', 'true');
        localStorage.setItem('orbit_nickname', nick);
        console.log('[Login] Starting Orbit...');
        startOrbit(nick);
        console.log('[Login] Success!');
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    }).catch(err => {
        console.error("[Login] Fatal error:", err);
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
        showToast('Ошибка входа: ' + err.message + '\n\nВозможно, вы используете HTTP вместо HTTPS (Crypto API недоступен).');
    });
}

if (loginBtn) {
    loginBtn.onclick = loginHandler;
}

unlockVaultBtn.onclick = async () => {
    const pass = unlockPasswordInput.value.trim();
    if (!pass || !myNickname) return;
    try {
        const unlocked = await verifyAndUnlockVault(myNickname, pass);
        if (!unlocked) return showToast('Неверный мастер-пароль.');
        vaultLockModal.style.display = 'none';
        vaultLockModal.setAttribute('aria-hidden', 'true');
        unlockPasswordInput.value = '';
        vaultLocked = false;
        setSendAvailability();
        if (currentChatFriend) {
            void loadInitialMessagesForChat().then(() => {
                msgsVirtual?.refresh();
                msgsVirtual?.scrollToBottom();
            });
        }
    } catch (err) {
        showToast('Ошибка разблокировки: ' + err.message);
    }
};

function startOrbit(nick) {
    myNickname = nick;
    if (!localStorage.getItem('orbit_profile_created_at')) {
        localStorage.setItem('orbit_profile_created_at', String(Date.now()));
    }
    friends.forEach(f => ensurePeerTrust(f.id));
    persistTrustState();
    loginPanel.style.display = 'none';
    appContainer.style.display = 'flex';
    vaultLockModal.style.display = 'none';
    vaultLockModal.setAttribute('aria-hidden', 'true');
    
    applyProfileToUI();

    peer = new Peer(myNickname);

    callManager = createCallManager({
        peer,
        getCurrentChatFriend: () => currentChatFriend,
        getActiveConnections: () => activeConnections,
        openChat,
        getVideoConstraints,
        getAudioConstraints,
        getAppSettings: () => appSettings,
        getIsOffline: () => isOffline,
        t,
        onScreenTrackEnded: () => {
            if (callManager) callManager.endCall();
        },
        el: {
            localVideo,
            remoteVideo,
            callScreen,
            callUserName,
            callStatus,
            callToggleAudio,
            callToggleVideo,
            incomingCallModal,
            callerNameDisplay,
            acceptCallBtn,
            rejectCallBtn,
            endCallBtn,
            screenBtn,
            callBtn,
            audioCallBtn
        }
    });

    let connectionTimeout = setTimeout(() => {
        if (!peer || !peer.open) {
            console.error('[PeerJS] Connection timeout');
            showToast('Connection timeout. Please check your internet and try again.');
            loginPanel.style.display = 'block';
            appContainer.style.display = 'none';
        }
    }, 10000);

    peer.on('open', (id) => {
        clearTimeout(connectionTimeout);
        console.log('[PeerJS] Connected with ID:', id);
        document.getElementById('my-status').style.color = 'var(--success)';
        document.getElementById('my-status').textContent = 'В сети';
        renderFriends();
        connectToAllFriends();
        applyNetworkState();
    });

    peer.on('connection', (conn) => {
        handleIncomingConnection(conn);
    });

    peer.on('call', (call) => {
        if (callManager) callManager.handleIncomingCall(call);
    });

    peer.on('disconnected', () => {
        console.warn('[PeerJS] Disconnected from signaling server. Reconnecting...');
        const statusEl = document.getElementById('my-status');
        if (statusEl) {
            statusEl.style.color = 'var(--text-muted)';
            statusEl.textContent = 'Переподключение...';
        }
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        }, 3000);
    });

    peer.on('error', (err) => {
        console.error('[PeerJS] Error:', err);
        let message = 'Connection error: ';
        
        switch (err.type) {
            case 'unavailable-id':
                message = 'Этот позывной уже используется в данный момент! Выбери другой.';
                localStorage.removeItem('orbit_nickname');
                setTimeout(() => location.reload(), 2000);
                break;
            case 'network':
                message = 'Cannot connect to network. Check your internet connection.';
                break;
            case 'peer-unavailable':
                message = 'Cannot connect to the signaling server (peer unavailable).';
                if (pendingFriendAdd) {
                    showToast(`Пользователь "${pendingFriendAdd}" не найден или не в сети!`);
                    addFriendBtn.disabled = false;
                    addFriendBtn.textContent = '+';
                    pendingFriendAdd = null;
                    return;
                }
                break;
            default:
                message = err.message || 'Unknown error';
        }
        
        showToast(message);
        
        // Reset UI if we are failing to connect initially
        if (!peer.open && !pendingFriendAdd) {
            loginPanel.style.display = 'block';
            appContainer.style.display = 'none';
        }
    });

    window.addEventListener('beforeunload', () => {
        stopMicTest();
        try {
            localStorage.setItem('orbit_pending_out', JSON.stringify(pendingOutgoing));
        } catch (_) {}
        void dbSetPendingOut(pendingOutgoing);
        if (callManager) callManager.endCall();
        Object.values(activeConnections).forEach((c) => {
            try {
                c.close();
            } catch (_) {}
        });
    });
}

function setSendAvailability() {
    const blocked = isOffline || vaultLocked;
    chatInput.disabled = blocked;
    fileBtn.disabled = blocked;
    sendVoiceBtn.disabled = blocked;
    if (isOffline) {
        chatInput.placeholder = 'Ожидание сети... отправка временно недоступна';
        sendVoiceBtn.style.opacity = '0.5';
        fileBtn.style.opacity = '0.5';
    } else if (vaultLocked) {
        chatInput.placeholder = 'Сессия заблокирована. Разблокируйте кабинет';
        sendVoiceBtn.style.opacity = '0.5';
        fileBtn.style.opacity = '0.5';
    } else {
        chatInput.placeholder = 'Написать сообщение...';
        sendVoiceBtn.style.opacity = '1';
        fileBtn.style.opacity = '1';
    }
}

function applyNetworkState() {
    setSendAvailability();
    if (currentChatFriend) {
        const statusEl = document.getElementById('chat-friend-status');
        if (isOffline) {
            statusEl.textContent = 'ожидание сети...';
            statusEl.style.color = 'var(--text-muted)';
        } else {
            const conn = activeConnections[currentChatFriend];
            statusEl.textContent = (conn && conn.open) ? 'в сети' : 'не в сети';
            statusEl.style.color = (conn && conn.open) ? 'var(--success)' : 'var(--text-muted)';
        }
    }
}

async function flushOutgoingQueue() {
    if (isOffline || pendingOutgoing.length === 0) return;
    const rest = [];
    for (const item of pendingOutgoing) {
        const conn = activeConnections[item.to];
        if (conn && conn.open) {
            if (item.type === 'chunked-file') {
                const prevFriend = currentChatFriend;
                currentChatFriend = item.to;
                await sendChunkedFile(item.file, item.fileType, item.name);
                currentChatFriend = prevFriend;
                // Note: we might want to patch the DOM status here if it was pending
                patchMessageStatusInWindow(item.ts, 'delivered');
                patchMessageStatusDOM(item.ts);
                await updateMsgStatusInDB(`chat_${myNickname}_${item.to}`, item.ts, 'delivered');
            } else {
                conn.send(item.payload);
                if (item.payload?.ts) {
                    await updateMsgStatusInDB(`chat_${myNickname}_${item.to}`, item.payload.ts, 'delivered');
                    if (currentChatFriend === item.to) {
                        patchMessageStatusInWindow(item.payload.ts, 'delivered');
                        patchMessageStatusDOM(item.payload.ts);
                    }
                }
            }
        } else {
            rest.push(item);
        }
    }
    pendingOutgoing = rest;
    await persistPendingOutgoing();
}

function persistTrustState() {
    localStorage.setItem('orbit_trust', JSON.stringify(trustState));
}

function persistBlockedPeers() {
    localStorage.setItem('orbit_blocked_peers', JSON.stringify(blockedPeers));
}

function ensurePeerTrust(peerId) {
    if (!trustState[peerId]) {
        trustState[peerId] = {
            firstSeenAt: Date.now(),
            reports: { spam: 0, fraud: 0, abuse: 0 },
            reportWeight: 0,
            blocked: false
        };
    }
    return trustState[peerId];
}

function calculateTrustScore(peerId) {
    const entry = ensurePeerTrust(peerId);
    let score = 100;
    
    // Age factor: new accounts have lower trust
    const ageDays = (Date.now() - entry.firstSeenAt) / (1000 * 3600 * 24);
    score -= Math.max(0, 30 - ageDays * 2);
    
    // Reports penalty
    const reportPenalty = Math.round(entry.reportWeight || 0);
    score -= reportPenalty;
    
    return Math.max(0, Math.min(100, score));
}

function getTrustBadgeData(peerId) {
    const score = calculateTrustScore(peerId);
    if (score >= 70) return { text: 'Щит: зелёный', className: 'trust-safe' };
    if (score >= 40) return { text: 'Щит: жёлтый', className: 'trust-warn' };
    return { text: 'Щит: красный', className: 'trust-risk' };
}

function updateTrustBadge(peerId) {
    if (!trustBadge || !peerId) return;
    const data = getTrustBadgeData(peerId);
    trustBadge.className = `trust-badge ${data.className}`;
    trustBadge.textContent = data.text;
}

function maybeShowNewUserWarning(peerId) {
    const entry = ensurePeerTrust(peerId);
    const isNew = Date.now() - entry.firstSeenAt < 24 * 60 * 60 * 1000;
    if (isNew) {
        chatWarningBanner.style.display = 'block';
        chatWarningBanner.textContent = 'Внимание: новый пользователь. Будьте осторожны при передаче файлов.';
    } else {
        chatWarningBanner.style.display = 'none';
    }
}

function blockPeer(peerId) {
    if (!blockedPeers.includes(peerId)) blockedPeers.push(peerId);
    persistBlockedPeers();
    const entry = ensurePeerTrust(peerId);
    entry.blocked = true;
    persistTrustState();
    if (activeConnections[peerId]) {
        activeConnections[peerId].close();
        delete activeConnections[peerId];
    }
    if (currentChatFriend === peerId) {
        closeCurrentChat();
    }
    renderFriends();
}

function saveSettings() {
    localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
}

function getActiveDisplayName() {
    return appSettings.displayName?.trim() || myNickname;
}

function applyProfileToUI() {
    myIdDisplay.textContent = getActiveDisplayName() || 'Пользователь';
    myAvatarLetter.textContent = (getActiveDisplayName() || 'U').substring(0, 2).toUpperCase();
}

function getVideoConstraints(quality = appSettings.videoQuality) {
    if (quality === 'low') {
        return { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 12, max: 15 } };
    }
    if (quality === 'high') {
        return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
    }
    return { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } };
}

function getAudioConstraints() {
    const audio = {
        echoCancellation: !!appSettings.echoCancellation,
        noiseSuppression: !!appSettings.noiseSuppression,
        autoGainControl: !!appSettings.autoGainControl
    };
    if (appSettings.micDeviceId) {
        audio.deviceId = { exact: appSettings.micDeviceId };
    }
    return audio;
}

async function applyVideoQualityToLiveCall(quality) {
    const ls = callManager?.localStream;
    if (!ls) return;
    const track = ls.getVideoTracks()[0];
    if (!track) return;
    try {
        await track.applyConstraints(getVideoConstraints(quality));
    } catch (e) {
        console.warn('Cannot apply video constraints', e);
    }
}

function syncSettingsFormFromState() {
    settingsDisplayName.value = appSettings.displayName || '';
    micDeviceSelect.value = appSettings.micDeviceId || '';
    echoCancelToggle.checked = !!appSettings.echoCancellation;
    noiseSuppressionToggle.checked = !!appSettings.noiseSuppression;
    autoGainToggle.checked = !!appSettings.autoGainControl;
    autoQualityToggle.checked = !!appSettings.autoQuality;
    videoQualitySelect.value = appSettings.videoQuality || 'medium';
    typingIndicatorToggle.checked = !!appSettings.typingIndicator;
    duressPasswordInput.value = '';
    allowScreenshotsToggle.checked = !!appSettings.allowScreenshots;
    videoQualitySelect.disabled = !!appSettings.autoQuality;
}

function readSettingsFormToState() {
    appSettings.displayName = settingsDisplayName.value.trim();
    appSettings.micDeviceId = micDeviceSelect.value || '';
    appSettings.echoCancellation = echoCancelToggle.checked;
    appSettings.noiseSuppression = noiseSuppressionToggle.checked;
    appSettings.autoGainControl = autoGainToggle.checked;
    appSettings.autoQuality = autoQualityToggle.checked;
    appSettings.videoQuality = videoQualitySelect.value;
    appSettings.typingIndicator = typingIndicatorToggle.checked;
    appSettings.allowScreenshots = allowScreenshotsToggle.checked;
}

function evaluateQualityByMetrics(metrics) {
    if (metrics.downlink > 0 && metrics.downlink < 1) return 'low';
    if (metrics.rtt > 700) return 'low';
    if (metrics.downlink > 0 && metrics.downlink < 3) return 'medium';
    if (metrics.rtt > 250) return 'medium';
    return 'high';
}

async function runNetworkTest() {
    const start = performance.now();
    try {
        await fetch('https://www.gstatic.com/generate_204', { cache: 'no-store', mode: 'no-cors' });
    } catch (_) {
        // no-cors or blocked fetch can still fail in some environments
    }
    const latency = Math.round(performance.now() - start);
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const metrics = {
        latency,
        rtt: conn?.rtt ?? latency,
        downlink: conn?.downlink ?? 0,
        effectiveType: conn?.effectiveType ?? 'unknown'
    };
    const recommended = evaluateQualityByMetrics(metrics);
    if (appSettings.autoQuality) {
        appSettings.videoQuality = recommended;
        videoQualitySelect.value = recommended;
        saveSettings();
    }
    networkTestResult.textContent = `Тест: RTT ~ ${metrics.rtt}ms, downlink ~ ${metrics.downlink || 'n/a'}Mbps, type ${metrics.effectiveType}. Рекомендовано: ${recommended.toUpperCase()}.`;
    await applyVideoQualityToLiveCall(appSettings.videoQuality);
}

function updateCallStatusByRtt(peerId, rtt) {
    if (!callManager?.activeCall || callManager.activeCall.peer !== peerId) return;
    if (rtt > 800) {
        callStatus.textContent = 'Слабый сигнал сети';
        if (appSettings.autoQuality) {
            appSettings.videoQuality = 'low';
            videoQualitySelect.value = 'low';
            saveSettings();
            applyVideoQualityToLiveCall('low');
        }
    } else if (rtt > 500) {
        callStatus.textContent = 'Слабый сигнал сети';
        if (appSettings.autoQuality) {
            appSettings.videoQuality = 'medium';
            videoQualitySelect.value = 'medium';
            saveSettings();
            applyVideoQualityToLiveCall('medium');
        }
    } else {
        callStatus.textContent = 'В звонке';
    }
}

async function populateMicDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const current = appSettings.micDeviceId || '';
        micDeviceSelect.replaceChildren();
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = 'По умолчанию';
        micDeviceSelect.appendChild(defOpt);
        devices
            .filter(d => d.kind === 'audioinput')
            .forEach((d, idx) => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || `Микрофон ${idx + 1}`;
                micDeviceSelect.appendChild(opt);
            });
        micDeviceSelect.value = current;
    } catch (e) {
        console.warn('Cannot enumerate devices', e);
    }
}

function stopMicTest() {
    if (micTestAnimation) cancelAnimationFrame(micTestAnimation);
    micTestAnimation = null;
    if (micTestStream) micTestStream.getTracks().forEach(t => t.stop());
    micTestStream = null;
    if (micTestAudioCtx) micTestAudioCtx.close();
    micTestAudioCtx = null;
    micTestAnalyser = null;
    micLevelBar.style.width = '0%';
}

async function startMicTest() {
    stopMicTest();
    try {
        micTestStream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints(), video: false });
        micTestAudioCtx = new AudioContext();
        const src = micTestAudioCtx.createMediaStreamSource(micTestStream);
        micTestAnalyser = micTestAudioCtx.createAnalyser();
        micTestAnalyser.fftSize = 256;
        src.connect(micTestAnalyser);
        const dataArray = new Uint8Array(micTestAnalyser.frequencyBinCount);

        const draw = () => {
            if (!micTestAnalyser) return;
            micTestAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const percent = Math.min(100, Math.round((avg / 128) * 100));
            micLevelBar.style.width = `${percent}%`;
            micTestAnimation = requestAnimationFrame(draw);
        };
        draw();
    } catch (e) {
        showToast('Не удалось запустить тест микрофона. Проверьте разрешения.');
    }
}

let lastHeartbeat = {};
let heartbeatInterval = null;

window.addEventListener('offline', () => {
    isOffline = true;
    applyNetworkState();
});

window.addEventListener('online', () => {
    isOffline = false;
    applyNetworkState();
    connectToAllFriends();
    flushOutgoingQueue();
});

const HEARTBEAT_MS_FOREGROUND = 10000;
const HEARTBEAT_MS_BACKGROUND = 60000;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        hiddenAt = Date.now();
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
            if (document.hidden && myNickname) void lockVault();
        }, 5 * 60 * 1000);
        
        // Battery Optimization
        themeManager.stopAnimation();
        radarController?.deactivate();
        Object.values(activeConnections).forEach(c => {
            // Close idle connections to save battery
            if (c.open && !c._activeTransfer) c.close();
        });
    } else {
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = null;
        if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && myNickname) {
            void lockVault();
        }
        
        // Resume animations
        themeManager.resumeAnimation();
        if (bottomRadarBtn?.classList.contains('active')) {
            radarController?.activate();
        }
        // Reconnect
        if (myNickname) connectToAllFriends();
    }
    if (myNickname) scheduleHeartbeat();
});

function scheduleHeartbeat() {
    if (!myNickname) return;
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    const period = document.hidden ? HEARTBEAT_MS_BACKGROUND : HEARTBEAT_MS_FOREGROUND;
    heartbeatInterval = setInterval(() => {
        const now = Date.now();
        friends.forEach(f => {
            const conn = activeConnections[f.id];
            if (conn && conn.open) {
                conn.send({ type: 'ping', from: myNickname, ts: now });
                if (lastHeartbeat[f.id] && (now - lastHeartbeat[f.id] > 30000)) {
                    conn.close();
                    delete activeConnections[f.id];
                    if (currentChatFriend === f.id) {
                        document.getElementById('chat-friend-status').textContent = 'не в сети';
                        document.getElementById('chat-friend-status').style.color = 'var(--text-muted)';
                    }
                    renderFriends();
                }
            } else {
                tryConnect(f.id);
            }
        });
    }, period);
}

function connectToAllFriends() {
    friends.forEach(f => tryConnect(f.id));
    scheduleHeartbeat();
}

const _reconnectNotBefore = {};
const _reconnectFailCount = {};

function tryConnect(friendId) {
    if (activeConnections[friendId] && activeConnections[friendId].open) return;
    const now = Date.now();
    if (_reconnectNotBefore[friendId] && now < _reconnectNotBefore[friendId]) return;
    const conn = peer.connect(friendId, { reliable: true });
    conn.on('error', () => {
        const n = (_reconnectFailCount[friendId] = (_reconnectFailCount[friendId] || 0) + 1);
        _reconnectNotBefore[friendId] = Date.now() + Math.min(60000, 1000 * Math.pow(2, Math.min(n, 8)));
    });
    handleIncomingConnection(conn);
}

let pendingFriendAdd = null;

function addFriend(id) {
    id = id.trim();
    if (!id || id === myNickname) return;
    if (blockedPeers.includes(id)) return showToast('Этот пользователь у вас в блоке.');
    if (friends.find(f => f.id === id)) return showToast('Уже в друзьях!');
    
    addFriendBtn.disabled = true;
    addFriendBtn.textContent = '...';
    pendingFriendAdd = id;
    
    const conn = peer.connect(id, { reliable: true });
    
    let isHandled = false;
    conn.on('open', () => {
        if (isHandled) return;
        isHandled = true;
        
        friends.push({ id, name: id });
        ensurePeerTrust(id);
        persistTrustState();
        localStorage.setItem('orbit_friends', JSON.stringify(friends));
        activeConnections[id] = conn;
        renderFriends();
        
        conn.on('data', (data) => receiveMessage(conn.peer, data));
        
        addFriendBtn.disabled = false;
        addFriendBtn.textContent = '+';
        pendingFriendAdd = null;
        showToast('Успешно добавлен!');
    });
}

addFriendBtn.onclick = () => { addFriend(addFriendInput.value); addFriendInput.value = ''; };

function handleIncomingConnection(conn) {
    conn.on('open', () => {
        if (blockedPeers.includes(conn.peer)) {
            conn.close();
            return;
        }
        activeConnections[conn.peer] = conn;
        delete _reconnectNotBefore[conn.peer];
        _reconnectFailCount[conn.peer] = 0;
        lastHeartbeat[conn.peer] = Date.now();
        // Автоматически добавляем в друзья если кто-то написал/подключился
        if (!friends.find(f => f.id === conn.peer)) {
            friends.push({ id: conn.peer, name: conn.peer });
            localStorage.setItem('orbit_friends', JSON.stringify(friends));
        }
        ensurePeerTrust(conn.peer);
        persistTrustState();
        renderFriends();
        flushOutgoingQueue();

        conn.on('data', (data) => {
            receiveMessage(conn.peer, data);
        });
    });

    conn.on('close', () => {
        delete activeConnections[conn.peer];
        renderFriends();
    });

    conn.on('error', () => {
        delete activeConnections[conn.peer];
        renderFriends();
    });
}

// GUI Rendering
if (backBtn) {
    backBtn.onclick = () => {
        appContainer.classList.remove('chat-open');
        currentChatFriend = null;
        messageWindow = [];
        if (msgsVirtual) msgsVirtual.destroy();
        msgsVirtual = null;
        messagesList.replaceChildren();
        incomingTransfers.clear();
        outgoingChunkCache.clear();
        hasMoreOlderMessages = true;
        chatWarningBanner.style.display = 'none';
        trustBadge.className = 'trust-badge trust-neutral';
        trustBadge.textContent = 'Щит: ?';
        void renderFriends();
    };
}
async function renderFriends() {
    const frag = document.createDocumentFragment();
    for (const f of friends) {
        if (blockedPeers.includes(f.id)) continue;
        const isOnline = !!(activeConnections[f.id] && activeConnections[f.id].open);
        const trustData = getTrustBadgeData(f.id);

        const key = `chat_${myNickname}_${f.id}`;
        const lastMsg = await getLastMessagePreview(key);
        let preview = 'Нет сообщений';
        let timeStr = '';
        if (lastMsg) {
            preview = lastMsg.type === 'text' ? lastMsg.content : (lastMsg.type === 'image' ? 'Фото' : 'Файл');
            const d = new Date(lastMsg.ts);
            timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }

        const div = document.createElement('div');
        div.className = 'friend-item';
        if (currentChatFriend === f.id) div.classList.add('active');

        const avatar = document.createElement('div');
        avatar.className = 'friend-avatar';
        const letter = document.createElement('span');
        letter.className = 'avatar-letter';
        letter.textContent = f.name.substring(0, 2).toUpperCase();
        const statusDot = document.createElement('div');
        statusDot.className = 'friend-status' + (isOnline ? ' online' : '');
        avatar.appendChild(letter);
        avatar.appendChild(statusDot);

        const col = document.createElement('div');
        col.className = 'friend-info-col';
        const nameRow = document.createElement('div');
        nameRow.className = 'friend-name';
        nameRow.textContent = f.name;
        const previewRow = document.createElement('div');
        previewRow.className = 'friend-preview-row';
        const previewSpan = document.createElement('span');
        previewSpan.className = 'friend-preview-text';
        previewSpan.textContent = preview;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'friend-time';
        timeSpan.textContent = timeStr;
        previewRow.appendChild(previewSpan);
        previewRow.appendChild(timeSpan);
        const trustSpan = document.createElement('span');
        trustSpan.className = 'friend-preview-text ' + trustData.className;
        trustSpan.textContent = trustData.text;
        col.appendChild(nameRow);
        col.appendChild(previewRow);
        col.appendChild(trustSpan);

        div.appendChild(avatar);
        div.appendChild(col);
        div.setAttribute('role', 'button');
        div.tabIndex = 0;
        div.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                void openChat(f.id);
            },
            { passive: false }
        );
        div.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void openChat(f.id);
                }
            },
            { passive: false }
        );
        frag.appendChild(div);
    }
    friendsListContainer.replaceChildren(frag);
}

async function loadInitialMessagesForChat() {
    const key = chatKey();
    const rows = await dbGetPage(key, MESSAGE_PAGE, null);
    messageWindow = await decodeMessageRows(rows);
    hasMoreOlderMessages = rows.length === MESSAGE_PAGE;
}

async function loadOlderMessages() {
    if (!currentChatFriend || messagesLoadingOlder || !hasMoreOlderMessages) return;
    const oldest = messageWindow[0]?.ts;
    if (oldest === undefined) return;
    messagesLoadingOlder = true;
    const key = chatKey();
    const rows = await dbGetPage(key, MESSAGE_PAGE, oldest);
    if (rows.length === 0) {
        hasMoreOlderMessages = false;
        messagesLoadingOlder = false;
        return;
    }
    const decoded = await decodeMessageRows(rows);
    if (decoded.length < MESSAGE_PAGE) hasMoreOlderMessages = false;
    messageWindow = [...decoded, ...messageWindow];
    while (messageWindow.length > MESSAGE_WINDOW_MAX) {
        messageWindow.pop();
    }
    if (msgsVirtual) msgsVirtual.insertRowsAtStart(decoded.length);
    msgsVirtual?.refresh();
    messagesLoadingOlder = false;
}

function attachMessagesScroll() {
    /* scroll + near-top is handled by VirtualScroller.onNearTop */
}

function formatRichText(text) {
    const span = document.createElement('span');
    let html = String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*(.*?)\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/~(.*?)~/g, '<s>$1</s>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:4px;font-family:monospace;">$1</code>')
        .replace(/\n/g, '<br>');
    span.innerHTML = html;
    return span;
}

function buildMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.from === myNickname ? 'me' : 'them'}`;
    div.dataset.ts = String(msg.ts);

    if (msg.type === 'text') {
        div.appendChild(formatRichText(msg.content));
    } else if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.content;
        img.loading = 'lazy';
        img.style.cssText = 'max-width:100%; border-radius:8px;';
        div.appendChild(img);
    } else if (msg.type === 'video') {
        const vid = document.createElement('video');
        vid.src = msg.content;
        vid.controls = true;
        vid.style.cssText = 'max-width:100%; border-radius:8px;';
        div.appendChild(vid);
    } else if (msg.type === 'file') {
        const a = document.createElement('a');
        a.href = msg.content;
        a.download = msg.name || 'file';
        a.style.cssText = 'color:var(--accent); text-decoration:underline;';
        a.textContent = `📎 Скачать ${msg.name || 'файл'}`;
        div.appendChild(a);
    } else if (msg.type === 'audio') {
        const aud = document.createElement('audio');
        aud.src = msg.content;
        aud.controls = true;
        aud.style.cssText = 'max-width: 200px; height: 40px; border-radius: 20px; outline: none;';
        div.appendChild(aud);
    }

    const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusText = '';
    let statusRead = false;
    if (msg.from === myNickname) {
        if (msg.status === 'read') {
            statusText = '✓✓';
            statusRead = true;
        } else if (msg.status === 'delivered') {
            statusText = '✓✓';
        } else if (msg.status === 'pending') {
            if (msg.progress !== undefined) {
                statusText = `⌛ ${msg.progress}%`;
            } else {
                statusText = '⌛';
            }
        } else {
            statusText = '✓';
        }
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'msg-time';

    if (msg.ttlMs > 0) {
        const ttlIcon = document.createElement('span');
        ttlIcon.textContent = '⏱️ ';
        ttlIcon.style.fontSize = '10px';
        timeDiv.appendChild(ttlIcon);
    }

    if (statusText) {
        const statusSpan = document.createElement('span');
        statusSpan.textContent = statusText;
        statusSpan.className = 'msg-status' + (statusRead ? ' msg-status-read' : '');
        timeDiv.appendChild(statusSpan);
    }
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time-text';
    timeSpan.textContent = ' ' + time;
    timeDiv.appendChild(timeSpan);

    div.appendChild(timeDiv);
    return div;
}

async function openChat(friendId) {
    if (blockedPeers.includes(friendId)) {
        showToast('Пользователь заблокирован.');
        return;
    }
    hideRadarIfActive();
    bottomChatsBtn?.classList.add('active');
    bottomContactsBtn?.classList.remove('active');
    bottomRadarBtn?.classList.remove('active');
    bottomSettingsBtn?.classList.remove('active');
    currentChatFriend = friendId;
    messageWindow = [];
    hasMoreOlderMessages = true;
    await loadInitialMessagesForChat();
    attachMessagesScroll();
    void renderFriends();

    if (msgsVirtual) msgsVirtual.destroy();
    msgsVirtual = new VirtualScroller(messagesList, {
        getCount: () => messageWindow.length,
        getItem: (i) => messageWindow[i],
        renderItem: (el, msg) => {
            const fresh = buildMessageElement(msg);
            el.className = fresh.className;
            el.dataset.ts = fresh.dataset.ts;
            el.replaceChildren(...fresh.childNodes);
        },
        estimateRowHeight: document.body.classList.contains('low-perf') ? 72 : 88,
        bufferRows: IS_IOS ? 8 : 12,
        onNearTop: () => {
            if (currentChatFriend) void loadOlderMessages();
        }
    });
    msgsVirtual.refresh();
    msgsVirtual.scrollToBottom();

    appContainer.classList.add('chat-open');
    chatAreaEmpty.style.display = 'none';
    chatAreaActive.style.display = 'flex';
    chatFriendName.textContent = friendId;
    if (isOffline) {
        document.getElementById('chat-friend-status').textContent = 'ожидание сети...';
        document.getElementById('chat-friend-status').style.color = 'var(--text-muted)';
    } else {
        document.getElementById('chat-friend-status').textContent = (activeConnections[friendId] && activeConnections[friendId].open) ? 'в сети' : 'не в сети';
        document.getElementById('chat-friend-status').style.color = (activeConnections[friendId] && activeConnections[friendId].open) ? 'var(--success)' : 'var(--text-muted)';
    }
    currentChatAvatarText.textContent = friendId.substring(0, 2).toUpperCase();
    updateTrustBadge(friendId);
    maybeShowNewUserWarning(friendId);

    if (!activeConnections[friendId] || !activeConnections[friendId].open) {
        tryConnect(friendId);
    }

    setSendAvailability();
}

// Chat DB
async function saveHistory(friendId, msgObj) {
    if (vaultLocked) throw new Error('Vault locked');
    const key = `chat_${myNickname}_${friendId}`;
    await saveMsgToDB(key, msgObj);
}

function scheduleTtlCleanup(friendId, ts, ttlMs) {
    if (!ttlMs || ttlMs <= 0) return;
    setTimeout(async () => {
        await deleteMsgInDB(`chat_${myNickname}_${friendId}`, ts);
        const conn = activeConnections[friendId];
        if (conn && conn.open) {
            conn.send({ type: 'ttl-delete', targetTs: ts, from: myNickname });
        }
        if (currentChatFriend === friendId) {
            messageWindow = messageWindow.filter((m) => m.ts !== ts);
            msgsVirtual?.refresh();
        }
    }, ttlMs);
}

async function renderMessages() {
    if (!currentChatFriend || !msgsVirtual) return;
    performance.mark('orbits-render-msg-start');
    msgsVirtual.refresh();
    msgsVirtual.scrollToBottom();
    try {
        performance.mark('orbits-render-msg-end');
        performance.measure('orbits-render-messages', 'orbits-render-msg-start', 'orbits-render-msg-end');
    } catch (_) {}
}

function patchMessageStatusInWindow(ts, status) {
    const m = messageWindow.find((x) => x.ts === ts);
    if (m) m.status = status;
}

/** Updates only the ✓ row for a sent message — avoids full list re-render on ack/delivery. */
function patchMessageStatusDOM(ts, status, progress) {
    const msg = messageWindow.find((x) => x.ts === ts);
    if (!msg || msg.from !== myNickname) return;
    if (status) msg.status = status; // Ensure status is updated even if DOM element is not rendered
    if (progress !== undefined) msg.progress = progress;
    msgsVirtual?.patchByTs(ts, (el, item) => {
        const fresh = buildMessageElement(item);
        el.className = fresh.className;
        el.replaceChildren(...fresh.childNodes);
    });
}

async function mergeMessageIntoView(msg) {
    if (!currentChatFriend || !msgsVirtual) return;
    const ix = messageWindow.findIndex((m) => m.ts === msg.ts);
    if (ix >= 0) {
        messageWindow[ix] = { ...messageWindow[ix], ...msg };
        msgsVirtual.patchByTs(msg.ts, (el, item) => {
            const fresh = buildMessageElement(item);
            el.className = fresh.className;
            el.replaceChildren(...fresh.childNodes);
        });
        return;
    }
    messageWindow.push(msg);
    while (messageWindow.length > MESSAGE_WINDOW_MAX) {
        messageWindow.shift();
    }
    const prevLastTs = messageWindow.length >= 2 ? messageWindow[messageWindow.length - 2].ts : undefined;
    if (prevLastTs === undefined || msg.ts >= prevLastTs) {
        msgsVirtual.refresh();
        msgsVirtual.scrollToBottom();
    } else {
        messageWindow.sort((a, b) => a.ts - b.ts);
        await renderMessages();
    }
}

// Sending & Receiving
let mediaRecorder = null;
let audioChunks = [];
let recordingState = 'idle'; 
let recordStartTime = 0;
let recordTimerInterval = null;
let startX = 0;
let isSwipeCanceled = false;

function cancelRecording() {
    if (recordingState === 'recording' && mediaRecorder) {
        recordingState = 'canceled';
        mediaRecorder.stop();
        setTimeout(() => { chatInput.value = ''; }, 100);
    } else if (recordingState === 'starting') {
        recordingState = 'canceled';
    }
}

sendVoiceBtn.addEventListener('pointerdown', (e) => {
    if (!currentChatFriend) return;
    if (sendVoiceBtn.classList.contains('voice-mode')) {
        sendVoiceBtn.setPointerCapture(e.pointerId);
        startX = e.clientX;
        isSwipeCanceled = false;
        
        if (recordingState !== 'idle') return;
        recordingState = 'starting';
        navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() }).then(stream => {
            if (recordingState === 'canceled') {
                stream.getTracks().forEach(t => t.stop());
                recordingState = 'idle';
                return;
            }
            recordingState = 'recording';
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = ev => {
                if (ev.data.size > 0) audioChunks.push(ev.data);
            };
            
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (recordingState === 'recording' && audioChunks.length > 0) {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    sendMediaBlob(blob, 'audio', 'voice_msg.webm');
                }
                recordingState = 'idle';
                audioChunks = [];
                clearInterval(recordTimerInterval);
                chatInput.value = '';
                chatInput.dispatchEvent(new Event('input'));
            };
            
            mediaRecorder.start();
            recordStartTime = Date.now();
            recordTimerInterval = setInterval(() => {
                const secs = Math.floor((Date.now() - recordStartTime) / 1000);
                chatInput.value = `🎤 Запись... 00:${secs.toString().padStart(2, '0')} (Свайп влево для отмены)`;
            }, 1000);
            chatInput.value = `🎤 Запись... 00:00 (Свайп влево для отмены)`;
        }).catch(err => {
            showToast("Нет доступа к микрофону");
            recordingState = 'idle';
        });
    }
});

sendVoiceBtn.addEventListener('pointermove', (e) => {
    if (sendVoiceBtn.classList.contains('voice-mode') && recordingState === 'recording') {
        if (startX - e.clientX > 50) {
            isSwipeCanceled = true;
            cancelRecording();
        }
    }
});

sendVoiceBtn.addEventListener('pointerup', async (e) => {
    if (!currentChatFriend) return;
    if (typeof e.pointerId === 'number' && sendVoiceBtn.hasPointerCapture(e.pointerId)) {
        sendVoiceBtn.releasePointerCapture(e.pointerId);
    }
    
    if (sendVoiceBtn.classList.contains('voice-mode')) {
        if (!isSwipeCanceled && recordingState === 'recording' && mediaRecorder) {
            mediaRecorder.stop();
        } else if (recordingState === 'starting') {
            recordingState = 'canceled';
        }
    } else {
        // Send Text
        if (isOffline) return;
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input'));
        
        const payload = { type: 'text', content: text, ts: Date.now() };
        const conn = activeConnections[currentChatFriend];
        const canSendNow = !!(conn && conn.open && !isOffline);
        try {
            await saveHistory(currentChatFriend, {
                from: myNickname,
                type: 'text',
                content: text,
                ts: payload.ts,
                status: canSendNow ? 'sent' : 'pending',
                ttlMs: Number(ttlSelect.value || 0)
            });
        } catch (_) {
            showToast('Сессия заблокирована. Разблокируйте кабинет.');
            return;
        }
        void mergeMessageIntoView({
            from: myNickname,
            type: 'text',
            content: text,
            ts: payload.ts,
            status: canSendNow ? 'sent' : 'pending'
        });

        if (canSendNow) {
            conn.send({ ...payload, from: myNickname, ttlMs: Number(ttlSelect.value || 0) });
        } else {
            pendingOutgoing.push({ to: currentChatFriend, payload: { ...payload, from: myNickname, ttlMs: Number(ttlSelect.value || 0) } });
            void persistPendingOutgoing();
        }
        scheduleTtlCleanup(currentChatFriend, payload.ts, Number(ttlSelect.value || 0));
    }
});

let typingTimeout = null;
let typingDebounceTimer = null;
chatInput.addEventListener('input', () => {
    if (chatInput.value.trim().length > 0 && recordingState === 'idle') {
        sendVoiceBtn.classList.remove('voice-mode');
        micIcon.style.display = 'none';
        sendIcon.style.display = 'block';
    } else if (recordingState === 'idle') {
        sendVoiceBtn.classList.add('voice-mode');
        micIcon.style.display = 'block';
        sendIcon.style.display = 'none';
    }

    if (currentChatFriend && appSettings.typingIndicator && !isOffline) {
        clearTimeout(typingDebounceTimer);
        typingDebounceTimer = setTimeout(() => {
            const conn = activeConnections[currentChatFriend];
            if (conn && conn.open) {
                conn.send({ type: 'typing', from: myNickname });
            }
        }, 500);
    }
});

chatInput.onkeypress = (e) => { 
    if (e.key === 'Enter' && !sendVoiceBtn.classList.contains('voice-mode')) {
        // Mock pointerup to send text
        sendVoiceBtn.dispatchEvent(new PointerEvent('pointerup'));
    }
};

function sendAck(senderId, msgTs) {
    const conn = activeConnections[senderId];
    if (conn && conn.open) {
        const status = (currentChatFriend === senderId) ? 'read' : 'delivered';
        conn.send({ type: 'ack', id: msgTs, status: status, from: myNickname });
    }
}

async function receiveMessage(senderId, data) {
    if (blockedPeers.includes(senderId)) return;
    lastHeartbeat[senderId] = Date.now();
    
    if (data.type === 'ping') {
        const conn = activeConnections[senderId];
        if (conn && conn.open) conn.send({ type: 'pong', from: myNickname, ts: data.ts });
        return;
    }
    if (data.type === 'pong') {
        if (typeof data.ts === 'number') {
            const rtt = Date.now() - data.ts;
            peerRtt[senderId] = rtt;
            updateCallStatusByRtt(senderId, rtt);
        }
        return;
    }
    
    if (data.type === 'typing') {
        if (appSettings.typingIndicator && currentChatFriend === senderId) {
            document.getElementById('chat-friend-status').textContent = 'печатает...';
            document.getElementById('chat-friend-status').style.color = 'var(--success)';
            clearTimeout(window[`typing_${senderId}`]);
            window[`typing_${senderId}`] = setTimeout(() => {
                const conn = activeConnections[senderId];
                document.getElementById('chat-friend-status').textContent = (conn && conn.open) ? 'в сети' : 'не в сети';
                document.getElementById('chat-friend-status').style.color = (conn && conn.open) ? 'var(--success)' : 'var(--text-muted)';
            }, 3000);
        }
        return;
    }
    
    if (data.type === 'ack') {
        await updateMsgStatusInDB(`chat_${myNickname}_${senderId}`, data.id, data.status);
        if (currentChatFriend === senderId) {
            patchMessageStatusInWindow(data.id, data.status);
            patchMessageStatusDOM(data.id);
        }
        return;
    }
    if (data.type === 'ttl-delete') {
        await deleteMsgInDB(`chat_${myNickname}_${senderId}`, data.targetTs);
        if (currentChatFriend === senderId) {
            messageWindow = messageWindow.filter((m) => m.ts !== data.targetTs);
            msgsVirtual?.refresh();
        }
        return;
    }
    if (data.type === 'file-chunk-start') {
        incomingTransfers.set(data.transferId, {
            from: senderId,
            name: data.name,
            mime: data.mime || 'application/octet-stream',
            totalChunks: data.totalChunks,
            received: new Map(),
            ts: data.ts,
            ttlMs: data.ttlMs || 0
        });
        return;
    }
    if (data.type === 'file-chunk') {
        const transfer = incomingTransfers.get(data.transferId);
        if (!transfer) return;
        const fd = data.fileData;
        const ab = fd instanceof ArrayBuffer ? fd : fd.buffer.slice(fd.byteOffset, fd.byteOffset + fd.byteLength);
        const checksum = await fileSha256Buffer(ab.slice(0));
        if (checksum !== data.checksum) {
            const conn = activeConnections[senderId];
            if (conn && conn.open) {
                conn.send({ type: 'file-chunk-missing', transferId: data.transferId, index: data.index, from: myNickname });
            }
            return;
        }
        transfer.received.set(data.index, data.fileData);
        return;
    }
    if (data.type === 'file-chunk-missing') {
        const cache = outgoingChunkCache.get(data.transferId);
        const conn = activeConnections[senderId];
        if (!cache || !conn || !conn.open) return;
        const missed = cache.chunks[data.index];
        if (!missed) return;
        conn.send({
            type: 'file-chunk',
            transferId: data.transferId,
            index: data.index,
            checksum: missed.checksum,
            fileData: missed.buffer,
            from: myNickname
        });
        return;
    }
    if (data.type === 'file-chunk-end') {
        const transfer = incomingTransfers.get(data.transferId);
        if (!transfer) return;
        if (transfer.received.size !== transfer.totalChunks) return;
        const ordered = [];
        for (let i = 0; i < transfer.totalChunks; i++) ordered.push(transfer.received.get(i));
        const blob = new Blob(ordered, { type: transfer.mime });
        const objectUrl = URL.createObjectURL(blob);
        try {
            await saveHistory(senderId, {
                from: senderId,
                type: 'file',
                content: objectUrl,
                name: transfer.name,
                ts: transfer.ts,
                ttlMs: transfer.ttlMs
            });
        } catch (_) {
            return;
        }
        scheduleTtlCleanup(senderId, transfer.ts, transfer.ttlMs || 0);
        sendAck(senderId, transfer.ts);
        incomingTransfers.delete(data.transferId);
        if (currentChatFriend === senderId) {
            void mergeMessageIntoView({
                from: senderId,
                type: 'file',
                content: objectUrl,
                name: transfer.name,
                ts: transfer.ts,
                ttlMs: transfer.ttlMs
            });
        }
        return;
    }

    if (data.type === 'text') {
        try {
            await saveHistory(senderId, { from: senderId, type: 'text', content: data.content, ts: data.ts, ttlMs: data.ttlMs || 0 });
        } catch (_) {
            return;
        }
        sendAck(senderId, data.ts);
        scheduleTtlCleanup(senderId, data.ts, data.ttlMs || 0);
        if (currentChatFriend === senderId) {
            void mergeMessageIntoView({
                from: senderId,
                type: 'text',
                content: data.content,
                ts: data.ts,
                ttlMs: data.ttlMs || 0
            });
        }
    } else if (['image', 'video', 'file', 'audio'].includes(data.type)) {
        const blob = new Blob([data.fileData], { type: data.mime || 'application/octet-stream' });
        const reader = new FileReader();
        reader.onload = async function(e) {
             try {
                await saveHistory(senderId, { from: senderId, type: data.type, content: e.target.result, name: data.name, ts: data.ts, ttlMs: data.ttlMs || 0 });
             } catch (_) {
                return;
             }
             sendAck(senderId, data.ts);
             scheduleTtlCleanup(senderId, data.ts, data.ttlMs || 0);
             if (currentChatFriend === senderId) {
                 void mergeMessageIntoView({
                     from: senderId,
                     type: data.type,
                     content: e.target.result,
                     name: data.name,
                     ts: data.ts,
                     ttlMs: data.ttlMs || 0
                 });
             }
        };
        reader.readAsDataURL(blob);
    }
}

async function sendChunkedFile(file, type, name) {
    const conn = activeConnections[currentChatFriend];
    const canSendNow = !!(conn && conn.open && !isOffline);
    const ts = Date.now();
    const ttlMs = Number(ttlSelect.value || 0);
    const localObjectUrl = URL.createObjectURL(file);

    if (!canSendNow) {
        pendingOutgoing.push({
            to: currentChatFriend,
            type: 'chunked-file',
            file: file,
            fileType: type,
            name: name,
            ts: ts,
            ttlMs: ttlMs,
            from: myNickname
        });
        void persistPendingOutgoing();
        
        try {
            await saveHistory(currentChatFriend, {
                from: myNickname, type, content: localObjectUrl, name, ts, status: 'pending', ttlMs
            });
        } catch (_) {}
        scheduleTtlCleanup(currentChatFriend, ts, ttlMs);
        void mergeMessageIntoView({
            from: myNickname, type, content: localObjectUrl, name, ts, status: 'pending', ttlMs
        });
        return;
    }

    const chunkSize = 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const transferId = `${ts}_${Math.random().toString(36).slice(2, 9)}`;
    outgoingChunkCache.set(transferId, { chunks: {} });

    // Initial pending message in view
    void mergeMessageIntoView({
        from: myNickname, type, content: localObjectUrl, name, ts, status: 'pending', progress: 0, ttlMs
    });

    conn.send({ type: 'file-chunk-start', transferId, name, mime: file.type, totalChunks, ts, ttlMs, from: myNickname });
    for (let i = 0; i < totalChunks; i++) {
        const chunk = await file.slice(i * chunkSize, Math.min((i + 1) * chunkSize, file.size)).arrayBuffer();
        const checksum = await fileSha256Buffer(chunk.slice(0));
        outgoingChunkCache.get(transferId).chunks[i] = { buffer: chunk, checksum };
        conn.send({ type: 'file-chunk', transferId, index: i, checksum, fileData: chunk, from: myNickname });
        
        const percent = Math.round(((i + 1) / totalChunks) * 100);
        patchMessageStatusDOM(ts, 'pending', percent);

        if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    }
    conn.send({ type: 'file-chunk-end', transferId, from: myNickname });
    outgoingChunkCache.delete(transferId);

    try {
        await saveHistory(currentChatFriend, {
            from: myNickname, type, content: localObjectUrl, name, ts, status: 'sent', ttlMs
        });
    } catch (_) {
        return;
    }
    scheduleTtlCleanup(currentChatFriend, ts, ttlMs);
    patchMessageStatusDOM(ts, 'sent');
}

function sendMediaBlob(file, type, name) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        const arrayBuffer = ev.target.result;
        const ttlMs = Number(ttlSelect.value || 0);
        const payload = { type: type, fileData: arrayBuffer, mime: file.type, name: name, ts: Date.now(), ttlMs };
        
        const conn = activeConnections[currentChatFriend];
        const canSendNow = !!(conn && conn.open && !isOffline);
        if (canSendNow) {
            conn.send({ ...payload, from: myNickname });
        } else {
            pendingOutgoing.push({ to: currentChatFriend, payload: { ...payload, from: myNickname } });
            void persistPendingOutgoing();
        }
        
        const b64Reader = new FileReader();
        b64Reader.onload = async (bEv) => {
            try {
                await saveHistory(currentChatFriend, {
                    from: myNickname,
                    type: type,
                    content: bEv.target.result,
                    name: name,
                    ts: payload.ts,
                    status: canSendNow ? 'sent' : 'pending',
                    ttlMs
                });
            } catch (_) {
                return;
            }
            scheduleTtlCleanup(currentChatFriend, payload.ts, ttlMs);
            void mergeMessageIntoView({
                from: myNickname,
                type: type,
                content: bEv.target.result,
                name: name,
                ts: payload.ts,
                status: canSendNow ? 'sent' : 'pending',
                ttlMs
            });
        }
        b64Reader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
}

fileBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    if(!currentChatFriend) return;
    if (isOffline) return;
    const file = e.target.files[0];
    if(!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const type = isImage ? 'image' : (isVideo ? 'video' : 'file');
    if (file.size > 10 * 1024 * 1024) {
        sendChunkedFile(file, type, file.name);
    } else {
        sendMediaBlob(file, type, file.name);
    }
};
