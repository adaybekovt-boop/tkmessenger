import Peer from 'peerjs';
import {
    dbInit,
    dbGetPage,
    dbGetLast,
    dbAdd,
    dbUpdateStatus,
    dbDelete,
    dbClearAll,
    cryptoDerive,
    cryptoLock,
    cryptoEncrypt,
    cryptoDecrypt,
    cryptoDecryptBatch,
    cryptoSha256Hex,
    cryptoSha256Buffer,
    fileSha256Buffer,
    dbGetPendingOut,
    dbSetPendingOut
} from './orbit-workers.js';
import { mark, measure, initLongTaskObserver, startFpsOverlay, startDevPerfOverlay } from './perf-observability.js';
import { VirtualScroller } from './virtual-scroll.js';
import { createCallManager } from './call-manager.js';
import { getThemeManager, THEMES } from './themeManager.js';
import { mountRadar } from './radar.js';

const themeManager = getThemeManager();

// --- BUSINESS LOGIC: UTILITIES & ABSTRACTIONS ---
const utils = {
    /** Cached DOM elements accessor */
    elements: {},
    el: (id) => {
        if (!utils.elements[id]) utils.elements[id] = document.getElementById(id);
        return utils.elements[id];
    },

    /** Efficient ArrayBuffer to DataURL conversion without duplicate FileReader */
    arrayBufferToDataUrl: (buffer, mimeType) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return `data:${mimeType};base64,${btoa(binary)}`;
    },

    /** ArrayBuffer to Base64 (sync) */
    arrayBufferToBase64: (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    },

    /** Simple toast implementation */
    showToast: (message, durationMs = 3000) => {
        let toast = utils.el('orbit-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'orbit-toast';
            toast.className = 'orbit-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), durationMs);
    },

    /** Escape HTML for safe rendering */
    escapeHtml: (s) => {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    /** Connected check */
    isConnected: (pid) => activeConnections[pid]?.open === true
};

/** i18n Localization */
const userLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
const i18n = {
    en: { accept: "Accept", decline: "Decline", incoming: "Incoming call", caller: "is calling...", camError: "No access to camera or mic. Starting audio call.", camFallback: "Unable to access camera. Audio call started.", mediaError: "Access denied. Ensure mic/camera permissions are granted.", endCall: "End Call", callingError: "User must be 'Online' to call!" },
    ru: { accept: "Принять", decline: "Отклонить", incoming: "Входящий вызов", caller: "вызывает...", camError: "Нет доступа к камере или микрофону. Включен аудио-звонок.", camFallback: "Не удалось получить доступ к камере. Включен голосовой вызов.", mediaError: "Действие отклонено. Убедитесь, что выдали права на микрофон и камеру.", endCall: "Завершить звонок", callingError: "Пользователь должен быть 'В сети' для звонка!" }
};
const t = i18n[userLang];

/** Avatar identity colors */
const avatarColor = (id) => (id?.charCodeAt(0) ?? 0) % 8;

/** Group bubbles from same sender to remove redundancy */
function applyBubbleGrouping() {
    for (let i = 0; i < messageWindow.length - 1; i++) {
        messageWindow[i]._grouped = messageWindow[i].from === messageWindow[i+1].from;
    }
    if (messageWindow.length) messageWindow.at(-1)._grouped = false;
}

// --- STATE MANAGEMENT ---
let peer = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {};
let callManager = null;
let currentChatFriend = null;
let isOffline = !navigator.onLine;
let pendingOutgoing = [];
let peerRtt = {};
let vaultLocked = false;
let lockTimer = null;
let hiddenAt = null;

// Workers State
let messageWindow = [];
let messageIndexMap = new Map(); // ts -> index
let hasMoreOlderMessages = true;
let messagesLoadingOlder = false;
const MESSAGE_PAGE = 50;
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MESSAGE_WINDOW_MAX = IS_IOS ? 1200 : 4000;
/** @type {VirtualScroller | null} */
let msgsVirtual = null;

// File Transfer State
let outgoingChunkCache = new Map();
let outgoingChunkCleanupTimers = new Map();
const incomingTransfers = new Map();
const activeObjectUrls = new Set();
const typingTimers = new Map();

// App Settings
const defaultSettings = {
    displayName: '', micDeviceId: '', echoCancellation: true, noiseSuppression: true,
    autoGainControl: true, autoQuality: true, videoQuality: 'medium', typingIndicator: true,
    duressPasswordHash: '', allowScreenshots: false
};
let appSettings = { ...defaultSettings, ...(JSON.parse(localStorage.getItem('orbit_settings') || '{}')) };

let trustState = JSON.parse(localStorage.getItem('orbit_trust') || '{}');
let blockedPeers = JSON.parse(localStorage.getItem('orbit_blocked_peers') || '[]');
let reportLog = JSON.parse(localStorage.getItem('orbit_report_log') || '[]');

// --- CORE UTILS ---
const persistPendingOutgoing = async () => {
    try {
        localStorage.setItem('orbit_pending_out', JSON.stringify(pendingOutgoing));
        await dbSetPendingOut(pendingOutgoing);
    } catch (_) {}
};

function buildMessageIndex() {
    messageIndexMap.clear();
    messageWindow.forEach((msg, idx) => messageIndexMap.set(msg.ts, idx));
}

function ensurePeerTrust(peerId) {
    if (!trustState[peerId]) {
        trustState[peerId] = { firstSeenAt: Date.now(), reports: { spam: 0, fraud: 0, abuse: 0 }, reportWeight: 0, blocked: false };
    }
    return trustState[peerId];
}

function calculateTrustScore(peerId) {
    const entry = ensurePeerTrust(peerId);
    return Math.max(0, Math.min(100, 100 - Math.round(entry.reportWeight || 0)));
}

function updateTrustBadge(peerId) {
    const badge = utils.el('trust-badge');
    if (!badge || !peerId) return;
    const score = calculateTrustScore(peerId);
    let cls = 'trust-risk', txt = 'Shield: RED';
    if (score >= 70) { cls = 'trust-safe'; txt = 'Shield: GREEN'; }
    else if (score >= 40) { cls = 'trust-warn'; txt = 'Shield: YELLOW'; }
    badge.className = `trust-badge ${cls}`;
    badge.textContent = txt;
}

// --- DB & CRYPTO INTERFACE (WORKER-WRAPPERS) ---
async function saveMsgToDB(chatId, msgObj) {
    const encrypted = await cryptoEncrypt(msgObj);
    await dbAdd({
        chatId, ts: msgObj.ts, status: msgObj.status || '', from: msgObj.from || '',
        type: msgObj.type || '', name: msgObj.name || '', enc: encrypted, legacyContent: ''
    });
}

async function decodeMessageRows(rows) {
    const legacy = [], encPairs = [];
    for (const row of rows) {
        if (row.enc) encPairs.push(row);
        else legacy.push({ from: row.from, type: row.type, content: row.legacyContent, name: row.name, ts: row.ts, status: row.status });
    }
    let decs = [];
    if (encPairs.length) decs = await cryptoDecryptBatch(encPairs.map(r => r.enc));
    const out = [...legacy];
    for (let i = 0; i < encPairs.length; i++) {
        const row = encPairs[i], dec = decs[i];
        if (dec) out.push({ ...dec, ts: row.ts, status: row.status || dec.status });
    }
    return out.sort((a, b) => a.ts - b.ts);
}

async function getLastMessagePreview(chatId) {
    const row = await dbGetLast(chatId);
    if (!row) return null;
    if (row.enc) {
        const dec = await cryptoDecrypt(row.enc);
        return dec ? { ...dec, ts: row.ts, status: row.status || dec.status } : null;
    }
    return { from: row.from, type: row.type, content: row.legacyContent, name: row.name, ts: row.ts, status: row.status };
}

// --- UI REPEATERS ---
async function renderFriends() {
    const visibleFriends = friends.filter(f => !blockedPeers.includes(f.id));
    const previews = await Promise.all(visibleFriends.map(f => getLastMessagePreview(`chat_${myNickname}_${f.id}`).catch(() => null)));
    const frag = document.createDocumentFragment();

    visibleFriends.forEach((f, idx) => {
        const lastMsg = previews[idx];
        const isOnline = utils.isConnected(f.id);
        const score = calculateTrustScore(f.id);
        const trustCls = score >= 70 ? 'trust-safe' : (score >= 40 ? 'trust-warn' : 'trust-risk');

        let preview = 'No messages', timeStr = '';
        if (lastMsg) {
            preview = lastMsg.type === 'text' ? lastMsg.content : (lastMsg.type === 'image' ? 'Photo' : 'File');
            const d = new Date(lastMsg.ts);
            timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }

        const div = document.createElement('div');
        div.className = 'friend-item' + (currentChatFriend === f.id ? ' active' : '');
        div.onclick = () => openChat(f.id);

        div.innerHTML = `
            <div class="friend-avatar" data-color="${avatarColor(f.id)}">
                <span class="avatar-letter">${f.name.substring(0, 2).toUpperCase()}</span>
                <div class="friend-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="friend-info-col">
                <div class="friend-name-row">
                    <span class="friend-name">${f.name}</span>
                    <span class="friend-time">${timeStr}</span>
                </div>
                <div class="friend-preview-row">
                    <span class="friend-preview-text">${utils.escapeHtml(preview)}</span>
                    <span class="${trustCls}">Shield: ${score}</span>
                </div>
            </div>
        `;
        frag.appendChild(div);
    });
    utils.el('friends-list').replaceChildren(frag);
    
    // Update Contacts tab empty state
    const contactsEmpty = utils.el('contacts-empty-state');
    if (contactsEmpty) {
        const empty = !visibleFriends.length;
        contactsEmpty.style.display = empty ? 'block' : 'none';
    }
}

// --- MESSAGING LOGIC ---
async function openChat(friendId) {
    if (blockedPeers.includes(friendId)) return alert('User is blocked.');
    hideRadarIfActive();
    currentChatFriend = friendId;
    messageWindow = [];
    hasMoreOlderMessages = true;
    
    await loadInitialMessagesForChat();
    buildMessageIndex();
    void renderFriends();

    if (msgsVirtual) msgsVirtual.destroy();
    msgsVirtual = new VirtualScroller(utils.el('messages-list'), {
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
        onNearTop: () => { if (currentChatFriend) void loadOlderMessages(); }
    });
    msgsVirtual.refresh();
    msgsVirtual.scrollToBottom();

    utils.el('app-container').classList.add('chat-open');
    utils.el('empty-state').style.display = 'none';
    utils.el('active-chat').style.display = 'flex';
    utils.el('chat-friend-name').textContent = friendId;
    
    const avatar = utils.el('current-chat-avatar');
    avatar.dataset.color = avatarColor(friendId);
    avatar.textContent = friendId.substring(0, 2).toUpperCase();
    
    updateTrustBadge(friendId);
    applyNetworkState();
    if (!utils.isConnected(friendId)) tryConnect(friendId);
    setSendAvailability();
}

function closeCurrentChat() {
    utils.el('app-container').classList.remove('chat-open');
    currentChatFriend = null;
    messageWindow = [];
    messageIndexMap.clear();
    if (msgsVirtual) msgsVirtual.destroy();
    msgsVirtual = null;
    utils.el('messages-list').replaceChildren();
    incomingTransfers.clear();
    activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    activeObjectUrls.clear();
    utils.el('chat-warning-banner').style.display = 'none';
}

async function loadInitialMessagesForChat() {
    const key = `chat_${myNickname}_${currentChatFriend}`;
    const rows = await dbGetPage(key, 0, MESSAGE_PAGE);
    messageWindow = await decodeMessageRows(rows);
    hasMoreOlderMessages = rows.length === MESSAGE_PAGE;
    applyBubbleGrouping();
}

async function loadOlderMessages() {
    if (!currentChatFriend || messagesLoadingOlder || !hasMoreOlderMessages) return;
    const oldest = messageWindow[0]?.ts;
    if (oldest === undefined) return;
    messagesLoadingOlder = true;
    const key = `chat_${myNickname}_${currentChatFriend}`;
    const rows = await dbGetPage(key, MESSAGE_PAGE, oldest);
    if (rows.length === 0) { hasMoreOlderMessages = false; messagesLoadingOlder = false; return; }
    const decoded = await decodeMessageRows(rows);
    if (decoded.length < MESSAGE_PAGE) hasMoreOlderMessages = false;
    messageWindow = [...decoded, ...messageWindow];
    while (messageWindow.length > MESSAGE_WINDOW_MAX) messageWindow.shift();
    buildMessageIndex();
    if (msgsVirtual) msgsVirtual.insertRowsAtStart(decoded.length);
    msgsVirtual?.refresh();
    messagesLoadingOlder = false;
}

function buildMessageElement(msg) {
    const div = document.createElement('div');
    const side = msg.from === myNickname ? 'me' : 'them';
    div.className = `message ${side}`;
    if (msg._grouped) div.classList.add('grouped');
    div.dataset.ts = String(msg.ts);

    const bubble = document.createElement('div');
    bubble.className = 'bubble-inner';
    
    if (msg.type === 'text') {
        const s = document.createElement('span'); s.textContent = msg.content; bubble.appendChild(s);
    } else if (msg.type === 'image') {
        const i = document.createElement('img'); i.src = msg.content; i.loading = 'lazy'; bubble.appendChild(i);
    } else if (msg.type === 'video') {
        const v = document.createElement('video'); v.src = msg.content; v.controls = true; bubble.appendChild(v);
    } else if (msg.type === 'file') {
        const a = document.createElement('a'); a.href = msg.content; a.download = msg.name || 'file'; a.textContent = `📎 ${msg.name || 'File'}`; bubble.appendChild(a);
    } else if (msg.type === 'audio') {
        const a = document.createElement('audio'); a.src = msg.content; a.controls = true; bubble.appendChild(a);
    }

    const footer = document.createElement('div');
    footer.className = 'msg-time';
    const d = new Date(msg.ts);
    footer.innerHTML = `<span class="msg-time-text">${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}</span>`;
    
    if (msg.from === myNickname) {
        const s = document.createElement('span');
        s.className = 'msg-status' + (msg.status === 'read' ? ' msg-status-read' : '');
        s.textContent = msg.status === 'read' ? ' ✓✓' : ' ✓';
        footer.appendChild(s);
    }
    bubble.appendChild(footer);
    div.appendChild(bubble);
    return div;
}

async function mergeMessageIntoView(msg) {
    if (!currentChatFriend || !msgsVirtual) return;
    const ix = messageIndexMap.get(msg.ts);
    if (ix !== undefined && messageWindow[ix]) {
        messageWindow[ix] = { ...messageWindow[ix], ...msg };
    } else {
        messageWindow.push(msg);
        messageWindow.sort((a, b) => a.ts - b.ts);
        buildMessageIndex();
    }
    while (messageWindow.length > MESSAGE_WINDOW_MAX) {
        messageWindow.shift();
        buildMessageIndex();
    }
    applyBubbleGrouping();
    msgsVirtual.refresh();
    msgsVirtual.scrollToBottom();
}

function patchMessageStatusDOM(ts) {
    const idx = messageIndexMap.get(ts);
    if (idx === undefined) return;
    const item = messageWindow[idx];
    if (item.from !== myNickname) return;
    msgsVirtual?.patchByTs(ts, (el, it) => {
        const fresh = buildMessageElement(it);
        el.className = fresh.className;
        el.replaceChildren(...fresh.childNodes);
    });
}

// --- PEERJS HOOKS & NETWORKING ---
function _initPeerAndManagers(nick) {
    peer = new Peer(nick);
    
    callManager = createCallManager({
        peer, getCurrentChatFriend: () => currentChatFriend, getActiveConnections: () => activeConnections,
        openChat, getVideoConstraints: q => q, getAudioConstraints: () => ({}), getAppSettings: () => appSettings,
        getIsOffline: () => isOffline, t, el: {
            localVideo: utils.el('local-video'), remoteVideo: utils.el('remote-video'),
            callScreen: utils.el('call-screen'), callUserName: utils.el('call-user-name'),
            callStatus: utils.el('call-status'), callToggleAudio: utils.el('call-toggle-audio'),
            callToggleVideo: utils.el('call-toggle-video'), incomingCallModal: utils.el('incoming-call-modal'),
            callerNameDisplay: utils.el('caller-name'), acceptCallBtn: utils.el('accept-call-btn'),
            rejectCallBtn: utils.el('reject-call-btn'), endCallBtn: utils.el('end-call-btn'),
            callBtn: utils.el('call-btn'), audioCallBtn: utils.el('audio-call-btn'), screenBtn: utils.el('screen-btn')
        },
        onScreenTrackEnded: () => callManager?.endCall()
    });

    peer.on('open', (id) => {
        utils.el('my-status').style.color = 'var(--success)';
        utils.el('my-status').textContent = 'Online';
        connectToAllFriends();
    });

    peer.on('connection', c => handleIncomingConnection(c));
    peer.on('call', c => callManager?.handleIncomingCall(c));
    
    peer.on('disconnected', () => {
        utils.el('my-status').style.color = 'var(--text-muted)';
        utils.el('my-status').textContent = 'Reconnecting...';
        setTimeout(() => !peer.destroyed && peer.reconnect(), 3000);
    });

    window.addEventListener('beforeunload', () => {
        void persistPendingOutgoing();
        if (callManager) callManager.endCall();
        Object.values(activeConnections).forEach(c => c.close());
    });
}

function handleIncomingConnection(conn) {
    conn.on('open', () => {
        if (blockedPeers.includes(conn.peer)) return conn.close();
        activeConnections[conn.peer] = conn;
        if (!friends.find(f => f.id === conn.peer)) {
            friends.push({ id: conn.peer, name: conn.peer });
            localStorage.setItem('orbit_friends', JSON.stringify(friends));
        }
        ensurePeerTrust(conn.peer);
        renderFriends();
        flushOutgoingQueue();
        conn.on('data', data => receiveMessage(conn.peer, data));
    });
}

async function receiveMessage(senderId, data) {
    if (blockedPeers.includes(senderId)) return;
    
    if (data.type === 'typing') {
        if (currentChatFriend === senderId) {
            const el = utils.el('chat-friend-status');
            el.innerHTML = '<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
            if (typingTimers.has(senderId)) clearTimeout(typingTimers.get(senderId));
            typingTimers.set(senderId, setTimeout(() => {
                typingTimers.delete(senderId);
                const isOnline = utils.isConnected(senderId);
                el.textContent = isOnline ? 'online' : 'offline';
                el.style.color = isOnline ? 'var(--success)' : 'var(--text-muted)';
            }, 3000));
        }
        return;
    }

    if (data.type === 'ack') {
        const key = `chat_${myNickname}_${senderId}`;
        await dbUpdateStatus(key, data.id, data.status);
        if (currentChatFriend === senderId) {
            const idx = messageIndexMap.get(data.id);
            if (idx !== undefined && messageWindow[idx]) {
                messageWindow[idx].status = data.status;
                patchMessageStatusDOM(data.id);
            }
        }
        return;
    }

    // Handle incoming data messages (text, file, chunks)
    if (data.type === 'text' || ['image', 'video', 'file', 'audio'].includes(data.type)) {
        await saveHistory(senderId, { from: senderId, ...data });
        sendAck(senderId, data.ts);
        if (currentChatFriend === senderId) mergeMessageIntoView({ from: senderId, ...data });
        else void renderFriends(); // Update preview
    }
}

async function sendAck(senderId, ts) {
    const conn = activeConnections[senderId];
    if (conn && conn.open) {
        const status = (currentChatFriend === senderId) ? 'read' : 'delivered';
        conn.send({ type: 'ack', id: ts, status, from: myNickname });
    }
}

async function flushOutgoingQueue() {
    if (isOffline || !pendingOutgoing.length) return;
    const rest = [];
    for (const item of pendingOutgoing) {
        const conn = activeConnections[item.to];
        if (conn && conn.open) {
            conn.send(item.payload);
            const key = `chat_${myNickname}_${item.to}`;
            await dbUpdateStatus(key, item.payload.ts, 'delivered');
            if (currentChatFriend === item.to) {
                const idx = messageIndexMap.get(item.payload.ts);
                if (idx !== undefined) { messageWindow[idx].status = 'delivered'; patchMessageStatusDOM(item.payload.ts); }
            }
        } else rest.push(item);
    }
    pendingOutgoing = rest;
    await persistPendingOutgoing();
}

function connectToAllFriends() {
    friends.forEach((f, i) => setTimeout(() => tryConnect(f.id), i * 150));
}

function tryConnect(fid) {
    if (utils.isConnected(fid)) return;
    const conn = peer.connect(fid, { reliable: true });
    handleIncomingConnection(conn);
}

// --- FILE BLOB HANDLING ---
async function sendChunkedFile(file, type, name) {
    const conn = activeConnections[currentChatFriend];
    if (!conn || !conn.open || isOffline) return;
    
    const chunkSize = 1024 * 1024; // 1MB
    const totalChunks = Math.ceil(file.size / chunkSize);
    const transferId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const ts = Date.now();
    outgoingChunkCache.set(transferId, { chunks: {} });

    conn.send({ type: 'file-chunk-start', transferId, name, mime: file.type, totalChunks, ts, from: myNickname });
    
    for (let i = 0; i < totalChunks; i++) {
        const chunk = await file.slice(i * chunkSize, Math.min((i + 1) * chunkSize, file.size)).arrayBuffer();
        const checksum = await fileSha256Buffer(chunk.slice(0));
        outgoingChunkCache.get(transferId).chunks[i] = { buffer: chunk, checksum };
        conn.send({ type: 'file-chunk', transferId, index: i, checksum, fileData: chunk, from: myNickname });
        if (i % 3 === 2) await new Promise(r => setTimeout(r, 0)); // Yield to UI
    }
    conn.send({ type: 'file-chunk-end', transferId, from: myNickname });
    outgoingChunkCache.delete(transferId);

    const localObjectUrl = URL.createObjectURL(file);
    activeObjectUrls.add(localObjectUrl); 
    await saveHistory(currentChatFriend, { from: myNickname, type, content: localObjectUrl, name, ts, status: 'sent' });
    mergeMessageIntoView({ from: myNickname, type, content: localObjectUrl, name, ts, status: 'sent' });
}

function sendMediaBlob(file, type, name) {
    const reader = new FileReader();
    const timeout = setTimeout(() => reader.abort(), 30000);
    reader.onload = async (ev) => {
        clearTimeout(timeout);
        const arrayBuffer = ev.target.result;
        const payload = { type, fileData: arrayBuffer, mime: file.type, name, ts: Date.now() };
        
        const conn = activeConnections[currentChatFriend];
        const canSendNow = conn && conn.open && !isOffline;
        
        if (canSendNow) conn.send({ ...payload, from: myNickname });
        else { pendingOutgoing.push({ to: currentChatFriend, payload: { ...payload, from: myNickname } }); void persistPendingOutgoing(); }

        const dataUrl = utils.arrayBufferToDataUrl(arrayBuffer, file.type);
        await saveHistory(currentChatFriend, { from: myNickname, ...payload, content: dataUrl, status: canSendNow ? 'sent' : 'pending' });
        mergeMessageIntoView({ from: myNickname, ...payload, content: dataUrl, status: canSendNow ? 'sent' : 'pending' });
    };
    reader.readAsArrayBuffer(file);
}

async function saveHistory(fid, msg) {
    const key = `chat_${myNickname}_${fid}`;
    await saveMsgToDB(key, msg);
}

// --- NAVIGATION & DOM HOOKS ---
function wireEvents() {
    utils.el('back-btn').onclick = () => { closeCurrentChat(); void renderFriends(); };
    utils.el('login-btn').onclick = async () => {
        const nick = utils.el('nickname-input').value.trim();
        const pass = utils.el('password-input').value.trim();
        if (nick.length < 3 || pass.length < 6) return alert('Invalid input.');
        
        const verifierKey = `orbit_vault_verifier_${nick}`;
        const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
        const existing = localStorage.getItem(verifierKey);
        if (existing && existing !== passHash) return alert('Invalid password.');
        if (!existing) localStorage.setItem(verifierKey, passHash);
        
        await cryptoDerive(pass, nick);
        localStorage.setItem('orbit_nickname', nick);
        localStorage.setItem('orbits_policy_accepted', 'true');
        myNickname = nick;
        utils.el('login-panel').style.display = 'none';
        utils.el('app-container').style.display = 'flex';
        themeManager.start();
        _initPeerAndManagers(nick);
    };

    utils.el('send-voice-btn').onpointerup = async () => {
        if (!currentChatFriend) return;
        const text = utils.el('chat-input').value.trim();
        if (!text) return;
        utils.el('chat-input').value = '';
        utils.el('chat-input').style.height = 'auto';
        
        const payload = { type: 'text', content: text, ts: Date.now() };
        const conn = activeConnections[currentChatFriend];
        const canSend = conn && conn.open && !isOffline;
        
        await saveHistory(currentChatFriend, { from: myNickname, ...payload, status: canSend ? 'sent' : 'pending' });
        mergeMessageIntoView({ from: myNickname, ...payload, status: canSend ? 'sent' : 'pending' });
        
        if (canSend) conn.send({ ...payload, from: myNickname });
        else { pendingOutgoing.push({ to: currentChatFriend, payload: { ...payload, from: myNickname } }); void persistPendingOutgoing(); }
    };

    utils.el('file-btn').onclick = () => utils.el('file-input').click();
    utils.el('file-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file || !currentChatFriend) return;
        if (isOffline) return;

        const type = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');
        if (file.size > 10 * 1024 * 1024) {
            sendChunkedFile(file, type, file.name);
        } else {
            sendMediaBlob(file, type, file.name);
        }
    };

    utils.el('bottom-radar-btn').onclick = () => switchToRadar();
    utils.el('bottom-chats-btn').onclick = () => { hideRadarIfActive(); void renderFriends(); };
}

function switchToRadar() {
    hideRadarIfActive();
    utils.el('radar-view').style.display = 'flex';
    radarController?.activate();
}

function hideRadarIfActive() {
    utils.el('radar-view').style.display = 'none';
    radarController?.deactivate();
}

function applyNetworkState() {
    if (!currentChatFriend) return;
    const online = utils.isConnected(currentChatFriend);
    const el = utils.el('chat-friend-status');
    el.textContent = isOffline ? 'Waiting for network...' : (online ? 'online' : 'offline');
    el.style.color = isOffline ? 'var(--text-muted)' : (online ? 'var(--success)' : 'var(--text-muted)');
}

function setSendAvailability() {
    const blocked = isOffline || vaultLocked;
    const inp = utils.el('chat-input');
    inp.disabled = blocked;
    inp.placeholder = blocked ? (isOffline ? 'Waiting for network...' : 'Vault locked') : 'Write a message...';
}

// --- BOOTSTRAP ---
(async () => {
    await dbInit();
    const policyAccepted = localStorage.getItem('orbits_policy_accepted') === 'true';
    if (policyAccepted) {
        const nick = localStorage.getItem('orbit_nickname');
        if (nick) {
            myNickname = nick;
            utils.el('login-panel').style.display = 'none';
            utils.el('app-container').style.display = 'flex';
            themeManager.start();
            _initPeerAndManagers(nick);
            void renderFriends();
        }
    }
    wireEvents();
    startDevPerfOverlay({
        getActiveConnections: () => Object.keys(activeConnections).filter(id => activeConnections[id]?.open).length,
        getRenderedDomCount: () => utils.el('messages-list').querySelectorAll('.orbit-vs-row').length,
        getMessageModelCount: () => messageWindow.length
    });
})();

let radarController = null;
const canvas = utils.el('radar-canvas');
if (canvas) {
    radarController = mountRadar({
        canvas, peersListEl: utils.el('radar-peers-list'), scanBtn: utils.el('radar-scan-btn'),
        ghostBtn: utils.el('radar-ghost-mode'), hintEl: utils.el('radar-bluetooth-hint'),
        modal: utils.el('radar-peer-modal'), modalTitle: utils.el('radar-peer-modal-title'),
        modalMeta: utils.el('radar-peer-modal-meta'), modalSend: utils.el('radar-peer-send-btn'),
        modalAdd: utils.el('radar-peer-add-btn'), modalClose: utils.el('radar-peer-close-btn'),
        onSendMessage: (p) => openChat(p.peerId),
        onAddContact: (p) => { 
            if (!friends.find(f => f.id === p.peerId)) {
                friends.push({ id: p.peerId, name: p.name });
                localStorage.setItem('orbit_friends', JSON.stringify(friends));
                void renderFriends();
            }
        }
    });
}
