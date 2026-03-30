import Peer from 'peerjs';

// i18n Localization
const userLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
const i18n = {
    en: { accept: "Accept", decline: "Decline", incoming: "Incoming call", caller: "is calling...", camError: "No access to camera or mic. Starting audio call.", camFallback: "Unable to access camera. Audio call started.", mediaError: "Access denied. Ensure mic/camera permissions are granted.", endCall: "End Call", callingError: "User must be 'Online' to call!" },
    ru: { accept: "Принять", decline: "Отклонить", incoming: "Входящий вызов", caller: "вызывает...", camError: "Нет доступа к камере или микрофону. Включен аудио-звонок.", camFallback: "Не удалось получить доступ к камере. Включен голосовой вызов.", mediaError: "Действие отклонено. Убедитесь, что выдали права на микрофон и камеру.", endCall: "Завершить звонок", callingError: "Пользователь должен быть 'В сети' для звонка!" }
};
const t = i18n[userLang];
// System Notification Setup
if (window.Notification && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
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
const openSettingsFab = document.getElementById('open-settings-fab');
const bottomSettingsBtn = document.getElementById('bottom-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsDisplayName = document.getElementById('settings-display-name');
const settingsAvatarInput = document.getElementById('settings-avatar-input');
const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
const micDeviceSelect = document.getElementById('mic-device-select');
const echoCancelToggle = document.getElementById('echo-cancel-toggle');
const noiseSuppressionToggle = document.getElementById('noise-suppression-toggle');
const autoGainToggle = document.getElementById('auto-gain-toggle');
const ringtoneToggle = document.getElementById('ringtone-toggle');
const autoQualityToggle = document.getElementById('auto-quality-toggle');
const videoQualitySelect = document.getElementById('video-quality-select');
const typingIndicatorToggle = document.getElementById('typing-indicator-toggle');
const themeSelect = document.getElementById('theme-select');
const bubbleStyleSelect = document.getElementById('bubble-style-select');
const runNetworkTestBtn = document.getElementById('run-network-test-btn');
const networkTestResult = document.getElementById('network-test-result');
const mailboxUrlInput = document.getElementById('mailbox-url-input');
const mailboxKeyInput = document.getElementById('mailbox-key-input');
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
const myAvatarImage = document.getElementById('my-avatar-image');

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
document.querySelector('#incoming-call-modal h2').textContent = t.incoming;
acceptCallBtn.textContent = t.accept;
rejectCallBtn.textContent = t.decline;
endCallBtn.textContent = t.endCall;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function sha256Hex(str) {
    const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(str));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256HexBuffer(buffer) {
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveVaultKey(password, nickname) {
    const base = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: textEncoder.encode(`orbits:${nickname}`),
            iterations: 120000,
            hash: 'SHA-256'
        },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptForVault(obj) {
    if (!vaultKey) throw new Error('Vault key unavailable');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = textEncoder.encode(JSON.stringify(obj));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, plain);
    return { iv: toBase64(iv), payload: toBase64(new Uint8Array(encrypted)) };
}

async function decryptFromVault(enc) {
    if (!enc) return null;
    if (!vaultKey) throw new Error('Vault is locked');
    const iv = fromBase64(enc.iv);
    const payload = fromBase64(enc.payload);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, payload);
    return JSON.parse(textDecoder.decode(plain));
}

// --- IndexedDB Setup ---
const dbName = 'OrbitsDB';
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('messages')) {
                const msgs = database.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                msgs.createIndex('chatId', 'chatId', { unique: false });
                msgs.createIndex('ts', 'ts', { unique: false });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
};

const saveMsgToDB = async (chatId, msgObj) => {
    const encrypted = await encryptForVault(msgObj);
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const request = store.add({
            chatId,
            ts: msgObj.ts,
            status: msgObj.status || '',
            from: msgObj.from || '',
            type: msgObj.type || '',
            name: msgObj.name || '',
            enc: encrypted,
            legacyContent: ''
        });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
};

const getHistoryFromDB = async (chatId) => {
    const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('chatId');
        const request = index.getAll(chatId);
        request.onsuccess = () => resolve(request.result.sort((a, b) => a.ts - b.ts));
        request.onerror = (e) => reject(e);
    });
    const result = [];
    for (const row of rows) {
        try {
            if (row.enc) {
                const dec = await decryptFromVault(row.enc);
                result.push({ ...dec, ts: row.ts, status: row.status || dec.status });
            } else {
                result.push({
                    from: row.from,
                    type: row.type,
                    content: row.legacyContent,
                    name: row.name,
                    ts: row.ts,
                    status: row.status
                });
            }
        } catch (_) {
            // Skip undecryptable messages while locked.
        }
    }
    return result;
};

const updateMsgStatusInDB = (chatId, ts, status) => {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const index = store.index('chatId');
        const req = index.getAll(chatId);
        req.onsuccess = () => {
            const msg = req.result.find(m => m.ts === ts);
            if (msg) {
                msg.status = status;
                store.put(msg);
            }
            resolve();
        };
        req.onerror = (e) => reject(e);
    });
};

const deleteMsgInDB = (chatId, ts) => {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const index = store.index('chatId');
        const req = index.getAll(chatId);
        req.onsuccess = () => {
            const msg = req.result.find(m => m.ts === ts);
            if (!msg) return resolve();
            const delReq = store.delete(msg.id);
            delReq.onsuccess = () => resolve();
            delReq.onerror = (e) => reject(e);
        };
        req.onerror = (e) => reject(e);
    });
};

const clearAllMessagesDB = () => {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
    });
};

// State
let peer = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {}; 
let activeCall = null;
let localStream = null;
let currentChatFriend = null; 
let incomingCallTmp = null;
let isOffline = !navigator.onLine;
let pendingOutgoing = [];
let peerRtt = {};
let micTestStream = null;
let micTestAudioCtx = null;
let micTestAnalyser = null;
let micTestAnimation = null;
let vaultKey = null;
let vaultLocked = false;
let lockTimer = null;
let hiddenAt = null;
let outgoingChunkCache = new Map();
const incomingTransfers = new Map();
let outgoingRingToneHandle = null;
let incomingRingToneHandle = null;
let mailboxPollTimer = null;

const defaultSettings = {
    displayName: '',
    avatarData: '',
    micDeviceId: '',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    callRingtone: true,
    autoQuality: true,
    videoQuality: 'medium',
    mailboxUrl: '',
    mailboxAnonKey: '',
    typingIndicator: true,
    theme: 'space',
    bubbleStyle: 'glass',
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
let peerProfiles = JSON.parse(localStorage.getItem('orbit_peer_profiles') || '{}');

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

if (openSettingsBtn) {
    openSettingsBtn.onclick = async () => {
        settingsModal.style.display = 'flex';
        settingsModal.setAttribute('aria-hidden', 'false');
        syncSettingsFormFromState();
        await populateMicDevices();
    };
}
if (openSettingsFab) {
    openSettingsFab.onclick = async () => {
        settingsModal.style.display = 'flex';
        settingsModal.setAttribute('aria-hidden', 'false');
        syncSettingsFormFromState();
        await populateMicDevices();
    };
}
if (bottomSettingsBtn) {
    bottomSettingsBtn.onclick = async () => {
        settingsModal.style.display = 'flex';
        settingsModal.setAttribute('aria-hidden', 'false');
        syncSettingsFormFromState();
        await populateMicDevices();
    };
}
if (closeSettingsBtn) {
    closeSettingsBtn.onclick = () => {
        settingsModal.style.display = 'none';
        settingsModal.setAttribute('aria-hidden', 'true');
        stopMicTest();
    };
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
                alert('Лже-пароль минимум 6 символов.');
                return;
            }
            appSettings.duressPasswordHash = await sha256Hex(`${myNickname}:${duressRaw}:orbits`);
        }
        saveSettings();
        applyProfileToUI();
        applyThemeSettings();
        broadcastMyProfile();
        pollMailboxAndDeliver();
        startMailboxPolling();
        await applyVideoQualityToLiveCall(appSettings.videoQuality);
        settingsModal.style.display = 'none';
        settingsModal.setAttribute('aria-hidden', 'true');
        stopMicTest();
    };
}
if (settingsAvatarInput) {
    settingsAvatarInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            appSettings.avatarData = ev.target?.result || '';
            settingsAvatarPreview.src = appSettings.avatarData;
        };
        reader.readAsDataURL(file);
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
            alert('Лимит жалоб: не более 3 в час.');
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
        alert('Жалоба отправлена. Пользователь заблокирован локально.');
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
applyThemeSettings();

await initDB();
const savedNick = localStorage.getItem('orbit_nickname');
if (savedNick) nicknameInput.value = savedNick;
if (!policyAccepted) localStorage.removeItem('orbit_nickname');
loginPanel.style.display = 'block';
applyNetworkState();

async function verifyAndUnlockVault(nick, password) {
    const verifierKey = `orbit_vault_verifier_${nick}`;
    const passHash = await sha256Hex(`${nick}:${password}:orbits`);
    const existingVerifier = localStorage.getItem(verifierKey);
    if (!existingVerifier) {
        localStorage.setItem(verifierKey, passHash);
    } else if (existingVerifier !== passHash) {
        if (appSettings.duressPasswordHash && appSettings.duressPasswordHash === passHash) {
            friends = [];
            localStorage.setItem('orbit_friends', '[]');
            vaultKey = await deriveVaultKey(password, nick);
            vaultLocked = false;
            return true;
        }
        return false;
    }
    vaultKey = await deriveVaultKey(password, nick);
    vaultLocked = false;
    return true;
}

function lockVault() {
    // Do not lock the app in the middle of an active call.
    if (activeCall) return;
    vaultKey = null;
    vaultLocked = true;
    vaultLockModal.style.display = 'flex';
    vaultLockModal.setAttribute('aria-hidden', 'false');
    setSendAvailability();
}

loginBtn.onclick = async () => {
    if (!privacyConsent.checked) {
        alert('Сначала примите Политику конфиденциальности.');
        return;
    }
    const nick = nicknameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    const pass = passwordInput.value.trim();
    if (nick.length < 3) return alert('Ник должен быть минимум 3 символа (буквы, цифры, _)');
    if (pass.length < 6) return alert('Мастер-пароль минимум 6 символов.');
    const unlocked = await verifyAndUnlockVault(nick, pass);
    if (!unlocked) return alert('Неверный мастер-пароль.');
    localStorage.setItem('orbits_policy_accepted', 'true');
    localStorage.setItem('orbit_nickname', nick);
    startOrbit(nick);
};

unlockVaultBtn.onclick = async () => {
    const pass = unlockPasswordInput.value.trim();
    if (!pass || !myNickname) return;
    const unlocked = await verifyAndUnlockVault(myNickname, pass);
    if (!unlocked) return alert('Неверный мастер-пароль.');
    vaultLockModal.style.display = 'none';
    vaultLockModal.setAttribute('aria-hidden', 'true');
    unlockPasswordInput.value = '';
    vaultLocked = false;
    setSendAvailability();
    renderMessages();
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
    peerProfiles[myNickname] = { displayName: getActiveDisplayName(), avatarData: appSettings.avatarData || '' };
    persistPeerProfiles();

    // Создаем ключ
    peer = new Peer(myNickname);
    
    peer.on('open', (id) => {
        document.getElementById('my-status').style.color = 'var(--success)';
        document.getElementById('my-status').textContent = 'В сети';
        renderFriends();
        connectToAllFriends();
        applyNetworkState();
        broadcastMyProfile();
        pollMailboxAndDeliver();
        startMailboxPolling();
    });

    peer.on('connection', (conn) => {
        handleIncomingConnection(conn);
    });

    peer.on('call', (call) => {
        handleIncomingCall(call);
    });

    peer.on('error', (err) => {
        if(err.type === 'unavailable-id') {
            alert('Этот позывной уже используется в данный момент! Выбери другой.');
            localStorage.removeItem('orbit_nickname');
            location.reload();
        } else if (err.type === 'peer-unavailable') {
            if (pendingFriendAdd) {
                alert(`Пользователь "${pendingFriendAdd}" не найден или не в сети! (Сначала нужно войти в сеть)`);
                addFriendBtn.disabled = false;
                addFriendBtn.textContent = '+';
                pendingFriendAdd = null;
            }
        }
    });

    window.addEventListener('beforeunload', () => {
       if (mailboxPollTimer) clearInterval(mailboxPollTimer);
       stopMicTest();
       if (activeCall) activeCall.close();
       Object.values(activeConnections).forEach(c => c.close());
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
            conn.send(item.payload);
            if (item.payload?.ts) {
                await updateMsgStatusInDB(`chat_${myNickname}_${item.to}`, item.payload.ts, 'delivered');
            }
        } else {
            rest.push(item);
        }
    }
    pendingOutgoing = rest;
    if (currentChatFriend) renderMessages();
}

function getMailboxConfig() {
    return {
        url: (appSettings.mailboxUrl || '').trim(),
        key: (appSettings.mailboxAnonKey || '').trim()
    };
}

async function pushToMailboxIfNeeded(to, payload) {
    if (payload?.type !== 'text') return false;
    const cfg = getMailboxConfig();
    if (!cfg.url || !cfg.key) return false;
    try {
        const endpoint = `${cfg.url}/rest/v1/mailbox_messages`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': cfg.key,
                'Authorization': `Bearer ${cfg.key}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify([{
                recipient: to,
                sender: myNickname,
                payload: payload,
                created_at: new Date().toISOString()
            }])
        });
        return res.ok;
    } catch (_) {
        return false;
    }
}

async function pollMailboxAndDeliver() {
    const cfg = getMailboxConfig();
    if (!cfg.url || !cfg.key || !myNickname || isOffline || vaultLocked) return;
    try {
        const endpoint = `${cfg.url}/rest/v1/mailbox_messages?recipient=eq.${encodeURIComponent(myNickname)}&order=created_at.asc&limit=30`;
        const res = await fetch(endpoint, {
            headers: {
                'apikey': cfg.key,
                'Authorization': `Bearer ${cfg.key}`
            }
        });
        if (!res.ok) return;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return;

        const deliveredIds = [];
        for (const row of rows) {
            const payload = row.payload || {};
            const sender = row.sender || payload.from;
            if (!sender || payload.type !== 'text') continue;
            await receiveMessage(sender, payload);
            deliveredIds.push(row.id);
        }

        if (deliveredIds.length > 0) {
            const inClause = deliveredIds.map((id) => `"${id}"`).join(',');
            await fetch(`${cfg.url}/rest/v1/mailbox_messages?id=in.(${inClause})`, {
                method: 'DELETE',
                headers: {
                    'apikey': cfg.key,
                    'Authorization': `Bearer ${cfg.key}`
                }
            });
        }
    } catch (_) {
        // silent mailbox polling errors
    }
}

function startMailboxPolling() {
    if (mailboxPollTimer) clearInterval(mailboxPollTimer);
    mailboxPollTimer = setInterval(() => {
        pollMailboxAndDeliver();
    }, 8000);
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
    const reportPenalty = Math.round(entry.reportWeight || 0);
    return Math.max(0, Math.min(100, 100 - reportPenalty));
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
    renderFriends();
}

function saveSettings() {
    localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
}

function getActiveDisplayName() {
    return appSettings.displayName?.trim() || myNickname;
}

function getDisplayNameByPeer(peerId) {
    if (peerId === myNickname) return getActiveDisplayName();
    return peerProfiles[peerId]?.displayName || peerId;
}

function persistPeerProfiles() {
    localStorage.setItem('orbit_peer_profiles', JSON.stringify(peerProfiles));
}

function applyProfileToUI() {
    myIdDisplay.textContent = getActiveDisplayName() || 'Пользователь';
    myAvatarLetter.textContent = (getActiveDisplayName() || 'U').substring(0, 2).toUpperCase();
    if (appSettings.avatarData) {
        myAvatarImage.src = appSettings.avatarData;
        myAvatarImage.parentElement.classList.add('has-photo');
    } else {
        myAvatarImage.removeAttribute('src');
        myAvatarImage.parentElement.classList.remove('has-photo');
    }
}

function applyThemeSettings() {
    document.body.classList.remove('theme-aurora', 'theme-deep', 'bubble-flat');
    if (appSettings.theme === 'aurora') document.body.classList.add('theme-aurora');
    if (appSettings.theme === 'deep') document.body.classList.add('theme-deep');
    if (appSettings.bubbleStyle === 'flat') document.body.classList.add('bubble-flat');
}

function broadcastMyProfile() {
    const payload = {
        type: 'profile-update',
        from: myNickname,
        displayName: getActiveDisplayName(),
        avatarData: appSettings.avatarData || ''
    };
    Object.values(activeConnections).forEach((conn) => {
        if (conn && conn.open) conn.send(payload);
    });
}

function startRingtone(kind) {
    if (!appSettings.callRingtone) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    gain.connect(ctx.destination);
    let osc = null;
    let timer = null;
    const pattern = kind === 'incoming'
        ? [700, 220, 700, 220, 1200]
        : [500, 200, 500, 900];
    let i = 0;
    const tick = () => {
        if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
        }
        if (i % 2 === 0) {
            osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = kind === 'incoming' ? 880 : 660;
            osc.connect(gain);
            osc.start();
        }
        timer = window.setTimeout(() => {
            i = (i + 1) % pattern.length;
            tick();
        }, pattern[i]);
    };
    tick();
    return {
        stop() {
            if (timer) clearTimeout(timer);
            if (osc) {
                osc.stop();
                osc.disconnect();
            }
            ctx.close();
        }
    };
}

function stopRingtone(handleRefName) {
    if (handleRefName === 'out' && outgoingRingToneHandle) {
        outgoingRingToneHandle.stop();
        outgoingRingToneHandle = null;
    }
    if (handleRefName === 'in' && incomingRingToneHandle) {
        incomingRingToneHandle.stop();
        incomingRingToneHandle = null;
    }
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
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (!track) return;
    try {
        await track.applyConstraints(getVideoConstraints(quality));
    } catch (e) {
        console.warn('Cannot apply video constraints', e);
    }
}

function syncSettingsFormFromState() {
    settingsDisplayName.value = appSettings.displayName || '';
    settingsAvatarPreview.src = appSettings.avatarData || '';
    micDeviceSelect.value = appSettings.micDeviceId || '';
    echoCancelToggle.checked = !!appSettings.echoCancellation;
    noiseSuppressionToggle.checked = !!appSettings.noiseSuppression;
    autoGainToggle.checked = !!appSettings.autoGainControl;
    ringtoneToggle.checked = !!appSettings.callRingtone;
    autoQualityToggle.checked = !!appSettings.autoQuality;
    videoQualitySelect.value = appSettings.videoQuality || 'medium';
    mailboxUrlInput.value = appSettings.mailboxUrl || '';
    mailboxKeyInput.value = appSettings.mailboxAnonKey || '';
    typingIndicatorToggle.checked = !!appSettings.typingIndicator;
    themeSelect.value = appSettings.theme || 'space';
    bubbleStyleSelect.value = appSettings.bubbleStyle || 'glass';
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
    appSettings.callRingtone = ringtoneToggle.checked;
    appSettings.autoQuality = autoQualityToggle.checked;
    appSettings.videoQuality = videoQualitySelect.value;
    appSettings.mailboxUrl = mailboxUrlInput.value.trim();
    appSettings.mailboxAnonKey = mailboxKeyInput.value.trim();
    appSettings.typingIndicator = typingIndicatorToggle.checked;
    appSettings.theme = themeSelect.value;
    appSettings.bubbleStyle = bubbleStyleSelect.value;
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
    if (!activeCall || activeCall.peer !== peerId) return;
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
        micDeviceSelect.innerHTML = '<option value="">По умолчанию</option>';
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
        alert('Не удалось запустить тест микрофона. Проверьте разрешения.');
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
    pollMailboxAndDeliver();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        hiddenAt = Date.now();
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
            if (document.hidden && myNickname && !activeCall) lockVault();
        }, 5 * 60 * 1000);
    } else {
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = null;
        if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && myNickname && !activeCall) {
            lockVault();
        }
    }
});

function connectToAllFriends() {
    friends.forEach(f => tryConnect(f.id));
    if (heartbeatInterval) return;
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
    }, 10000);
}

function tryConnect(friendId) {
    if (activeConnections[friendId] && activeConnections[friendId].open) return;
    const conn = peer.connect(friendId, { reliable: true });
    handleIncomingConnection(conn);
}

let pendingFriendAdd = null;

function addFriend(id) {
    id = id.trim();
    if (!id || id === myNickname) return;
    if (blockedPeers.includes(id)) return alert('Этот пользователь у вас в блоке.');
    if (friends.find(f => f.id === id)) return alert('Уже в друзьях!');
    
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
        alert('Успешно добавлен!');
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
        conn.send({
            type: 'profile-update',
            from: myNickname,
            displayName: getActiveDisplayName(),
            avatarData: appSettings.avatarData || ''
        });

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
        chatWarningBanner.style.display = 'none';
        trustBadge.className = 'trust-badge trust-neutral';
        trustBadge.textContent = 'Щит: ?';
        renderFriends();
    };
}
async function renderFriends() {
    friendsListContainer.innerHTML = '';
    for (const f of friends) {
        if (blockedPeers.includes(f.id)) continue;
        const isOnline = !!(activeConnections[f.id] && activeConnections[f.id].open);
        const trustData = getTrustBadgeData(f.id);
        const displayName = getDisplayNameByPeer(f.id);
        const avatarData = peerProfiles[f.id]?.avatarData || '';
        
        const key = `chat_${myNickname}_${f.id}`;
        const history = await getHistoryFromDB(key);
        const lastMsg = history.length > 0 ? history[history.length - 1] : null;
        let preview = 'Нет сообщений';
        let timeStr = '';
        if (lastMsg) {
            preview = lastMsg.type === 'text' ? lastMsg.content : (lastMsg.type === 'image' ? 'Фото' : 'Файл');
            const d = new Date(lastMsg.ts);
            timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }
        
        const div = document.createElement('div');
        div.className = 'friend-item';
        if (currentChatFriend === f.id) div.classList.add('active');
        
        const fName = document.createElement('div');
        fName.className = 'friend-name';
        fName.textContent = displayName;

        const fPreview = document.createElement('span');
        fPreview.className = 'friend-preview-text';
        fPreview.textContent = preview;

        div.innerHTML = `
            <div class="friend-avatar">
                <img class="avatar-photo" alt="avatar">
                <span class="avatar-letter"></span>
                <div class="friend-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="friend-info-col">
                <div class="friend-name-container"></div>
                <div class="friend-preview-row">
                    <span class="preview-container"></span>
                    <span class="friend-time">${timeStr}</span>
                </div>
                <span class="friend-preview-text ${trustData.className}">${trustData.text}</span>
            </div>
        `;
        div.querySelector('.avatar-letter').textContent = displayName.substring(0, 2).toUpperCase();
        if (avatarData) {
            const avatar = div.querySelector('.avatar-photo');
            avatar.src = avatarData;
            div.querySelector('.friend-avatar').classList.add('has-photo');
        }
        div.querySelector('.friend-name-container').replaceWith(fName);
        div.querySelector('.preview-container').replaceWith(fPreview);

        div.onclick = () => openChat(f.id);
        friendsListContainer.appendChild(div);
    }
}

function openChat(friendId) {
    if (blockedPeers.includes(friendId)) {
        alert('Пользователь заблокирован.');
        return;
    }
    currentChatFriend = friendId;
    renderFriends(); // updates active selection
    
    appContainer.classList.add('chat-open');
    chatAreaEmpty.style.display = 'none';
    chatAreaActive.style.display = 'flex';
    chatFriendName.textContent = getDisplayNameByPeer(friendId);
    if (isOffline) {
        document.getElementById('chat-friend-status').textContent = 'ожидание сети...';
        document.getElementById('chat-friend-status').style.color = 'var(--text-muted)';
    } else {
        document.getElementById('chat-friend-status').textContent = (activeConnections[friendId] && activeConnections[friendId].open) ? 'в сети' : 'не в сети';
        document.getElementById('chat-friend-status').style.color = (activeConnections[friendId] && activeConnections[friendId].open) ? 'var(--success)' : 'var(--text-muted)';
    }
    currentChatAvatarText.textContent = getDisplayNameByPeer(friendId).substring(0,2).toUpperCase();
    if (peerProfiles[friendId]?.avatarData) {
        currentChatAvatarText.style.backgroundImage = `url("${peerProfiles[friendId].avatarData}")`;
        currentChatAvatarText.style.backgroundSize = 'cover';
        currentChatAvatarText.style.backgroundPosition = 'center';
        currentChatAvatarText.textContent = '';
    } else {
        currentChatAvatarText.style.backgroundImage = '';
        currentChatAvatarText.textContent = getDisplayNameByPeer(friendId).substring(0,2).toUpperCase();
    }
    updateTrustBadge(friendId);
    maybeShowNewUserWarning(friendId);
    
    if (!activeConnections[friendId] || !activeConnections[friendId].open) {
        tryConnect(friendId);
    }
    
    setSendAvailability();
    renderMessages();
}

// Chat DB
async function saveHistory(friendId, msgObj) {
    if (vaultLocked || !vaultKey) throw new Error('Vault locked');
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
        if (currentChatFriend === friendId) renderMessages();
    }, ttlMs);
}

async function renderMessages() {
    if (!currentChatFriend) return;
    messagesList.innerHTML = '';
    const key = `chat_${myNickname}_${currentChatFriend}`;
    const history = await getHistoryFromDB(key);
    
    history.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.from === myNickname ? 'me' : 'them'}`;
        
        if (msg.type === 'text') {
            div.textContent = msg.content;
        } else if (msg.type === 'image') {
            const img = document.createElement('img');
            img.src = msg.content;
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
        let statusColor = 'var(--text-muted)';
        if (msg.from === myNickname) {
            if (msg.status === 'read') {
                statusText = '✓✓';
                statusColor = 'var(--success)';
            } else if (msg.status === 'delivered') {
                statusText = '✓✓';
            } else if (msg.status === 'pending') {
                statusText = '⌛';
            } else {
                statusText = '✓';
            }
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'msg-time';
        
        if (statusText) {
            const statusSpan = document.createElement('span');
            statusSpan.textContent = statusText;
            statusSpan.style.color = statusColor;
            timeDiv.appendChild(statusSpan);
        }
        const timeSpan = document.createElement('span');
        timeSpan.textContent = ' ' + time;
        timeDiv.appendChild(timeSpan);

        div.appendChild(timeDiv);

        messagesList.appendChild(div);
    });
    
    messagesList.scrollTop = messagesList.scrollHeight;
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
            alert("Нет доступа к микрофону");
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
            alert('Сессия заблокирована. Разблокируйте кабинет.');
            return;
        }
        renderMessages();

        if (canSendNow) {
            conn.send({ ...payload, from: myNickname, ttlMs: Number(ttlSelect.value || 0) });
        } else {
            const queuedPayload = { ...payload, from: myNickname, ttlMs: Number(ttlSelect.value || 0) };
            pendingOutgoing.push({ to: currentChatFriend, payload: queuedPayload });
            pushToMailboxIfNeeded(currentChatFriend, queuedPayload);
        }
        scheduleTtlCleanup(currentChatFriend, payload.ts, Number(ttlSelect.value || 0));
    }
});

let typingTimeout = null;
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
    
    if (currentChatFriend) {
        const conn = activeConnections[currentChatFriend];
        if (appSettings.typingIndicator && !isOffline && conn && conn.open) {
            conn.send({ type: 'typing', from: myNickname });
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {}, 2000);
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
    if (data.type === 'profile-update') {
        peerProfiles[senderId] = {
            displayName: data.displayName || senderId,
            avatarData: data.avatarData || ''
        };
        persistPeerProfiles();
        if (currentChatFriend === senderId) {
            chatFriendName.textContent = getDisplayNameByPeer(senderId);
        }
        renderFriends();
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
        if (currentChatFriend === senderId) renderMessages();
        return;
    }
    if (data.type === 'ttl-delete') {
        await deleteMsgInDB(`chat_${myNickname}_${senderId}`, data.targetTs);
        if (currentChatFriend === senderId) renderMessages();
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
        const checksum = await sha256HexBuffer(data.fileData);
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
        if (currentChatFriend === senderId) renderMessages();
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
        if (currentChatFriend === senderId) renderMessages();
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
             if (currentChatFriend === senderId) renderMessages();
        };
        reader.readAsDataURL(blob);
    }
}

async function sendChunkedFile(file, type, name) {
    const conn = activeConnections[currentChatFriend];
    if (!conn || !conn.open || isOffline) return;
    const chunkSize = 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const transferId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const ts = Date.now();
    const ttlMs = Number(ttlSelect.value || 0);
    outgoingChunkCache.set(transferId, { chunks: {} });

    conn.send({ type: 'file-chunk-start', transferId, name, mime: file.type, totalChunks, ts, ttlMs, from: myNickname });
    for (let i = 0; i < totalChunks; i++) {
        const chunk = await file.slice(i * chunkSize, Math.min((i + 1) * chunkSize, file.size)).arrayBuffer();
        const checksum = await sha256HexBuffer(chunk);
        outgoingChunkCache.get(transferId).chunks[i] = { buffer: chunk, checksum };
        conn.send({ type: 'file-chunk', transferId, index: i, checksum, fileData: chunk, from: myNickname });
    }
    conn.send({ type: 'file-chunk-end', transferId, from: myNickname });

    const localObjectUrl = URL.createObjectURL(file);
    try {
        await saveHistory(currentChatFriend, {
            from: myNickname,
            type,
            content: localObjectUrl,
            name,
            ts,
            status: 'sent',
            ttlMs
        });
    } catch (_) {
        return;
    }
    scheduleTtlCleanup(currentChatFriend, ts, ttlMs);
    renderMessages();
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
            renderMessages();
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

// === Calls ===
function bindRemoteVideoStatus() {
    remoteVideo.onpause = () => {
        if (activeCall) callStatus.textContent = 'Видео на паузе';
    };
    remoteVideo.onplaying = () => {
        if (activeCall) callStatus.textContent = 'В звонке';
    };
}

function handleIncomingCall(call) {
    incomingCallTmp = call;
    callerNameDisplay.textContent = `${call.peer} ${t.caller}`;
    incomingCallModal.style.display = 'flex';
    stopRingtone('in');
    incomingRingToneHandle = startRingtone('incoming');
    if (window.Notification && Notification.permission === 'granted') {
        new Notification(t.incoming, { body: `${call.peer} ${t.caller}`, icon: '/favicon.ico' });
    }
}

acceptCallBtn.onclick = () => {
    incomingCallModal.style.display = 'none';
    stopRingtone('in');
    if (!incomingCallTmp) return;

    navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints(), video: getVideoConstraints(appSettings.videoQuality) }).catch(err => {
        // Fallback for audio-only or blocked devices
        console.warn('Media error:', err);
        return null;
    }).then(stream => {
        if(stream) {
            localStream = stream;
            localVideo.srcObject = localStream;
        } else {
            alert(t.camError);
        }
        
        activeCall = incomingCallTmp;
        incomingCallTmp = null;
        
        if (activeCall.peer !== currentChatFriend) openChat(activeCall.peer);

        activeCall.answer(stream);
        callUserName.textContent = activeCall.peer;
        callStatus.textContent = 'Соединение...';
        callScreen.style.display = 'flex';
        bindRemoteVideoStatus();
        
        activeCall.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
            callStatus.textContent = 'В звонке';
        });
        activeCall.on('close', closeCallUI);
    });
};

rejectCallBtn.onclick = () => {
    incomingCallModal.style.display = 'none';
    stopRingtone('in');
    if(incomingCallTmp) incomingCallTmp.close();
    incomingCallTmp = null;
};

callBtn.onclick = () => startCall(true, true);
if (audioCallBtn) audioCallBtn.onclick = () => startCall(false, true);

screenBtn.onclick = async () => {
    try {
        const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        startCall(true, true, sStream);
    } catch(err) {
        alert('Демонстрация экрана недоступна (возможно вы локально).');
    }
};

async function startCall(videoOn, audioOn, screenStream = null) {
    if (!currentChatFriend) return;
    if (isOffline) return alert('Нет сети. Звонок недоступен.');
    const conn = activeConnections[currentChatFriend];
    if (!conn || !conn.open) return alert(t.callingError);

    try {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        
        if (screenStream) {
            localStream = screenStream;
        } else {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: audioOn ? getAudioConstraints() : false,
                video: videoOn ? getVideoConstraints(appSettings.videoQuality) : false
            });
        }
    } catch(err) {
        console.warn('Media get failure:', err);
        // Если просили видео, попробуем скинуться только на аудио
        if (videoOn) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints(), video: false });
                alert(t.camFallback);
            } catch(e2) {
                return alert(t.mediaError);
            }
        } else {
            return alert(t.mediaError);
        }
    }

    localVideo.srcObject = localStream;
    activeCall = peer.call(currentChatFriend, localStream);
    stopRingtone('out');
    outgoingRingToneHandle = startRingtone('outgoing');
    callUserName.textContent = currentChatFriend;
    callStatus.textContent = 'Соединение...';
    callScreen.style.display = 'flex';
    bindRemoteVideoStatus();

    activeCall.on('stream', (remoteStream) => {
        stopRingtone('out');
        remoteVideo.srcObject = remoteStream;
        callStatus.textContent = 'В звонке';
    });
    activeCall.on('error', (err) => { stopRingtone('out'); alert('Связь прервалась.'); closeCallUI(); });
    activeCall.on('close', closeCallUI);
}

// Media Toggles
callToggleAudio.onclick = () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            // Can update UI opacity to show muted state
            callToggleAudio.style.opacity = audioTrack.enabled ? '1' : '0.5';
        }
    }
};

callToggleVideo.onclick = () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            callToggleVideo.style.opacity = videoTrack.enabled ? '1' : '0.5';
        }
    }
};

endCallBtn.onclick = () => {
    if (activeCall) activeCall.close();
    closeCallUI();
};

function closeCallUI() {
    stopRingtone('out');
    stopRingtone('in');
    callScreen.style.display = 'none';
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    activeCall = null;
    callToggleAudio.style.opacity = '1';
    callToggleVideo.style.opacity = '1';
}
