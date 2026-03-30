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
const backBtn = document.getElementById('back-btn');

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

const saveMsgToDB = (chatId, msgObj) => {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        const request = store.add({ chatId, ...msgObj });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
};

const getHistoryFromDB = (chatId) => {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('chatId');
        const request = index.getAll(chatId);
        request.onsuccess = () => {
            const results = request.result.sort((a,b) => a.ts - b.ts);
            resolve(results);
        };
        request.onerror = (e) => reject(e);
    });
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

// State
let peer = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {}; 
let activeCall = null;
let localStream = null;
let currentChatFriend = null; 
let incomingCallTmp = null;

// Initialization
await initDB();
const savedNick = localStorage.getItem('orbit_nickname');
if (savedNick) startOrbit(savedNick);
else loginPanel.style.display = 'block';

loginBtn.onclick = () => {
    const nick = nicknameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (nick.length < 3) return alert('Ник должен быть минимум 3 символа (буквы, цифры, _)');
    localStorage.setItem('orbit_nickname', nick);
    startOrbit(nick);
};

function startOrbit(nick) {
    myNickname = nick;
    loginPanel.style.display = 'none';
    appContainer.style.display = 'flex';
    
    myIdDisplay.textContent = myNickname;
    myAvatarLetter.textContent = myNickname.substring(0, 2).toUpperCase();

    // Создаем ключ
    peer = new Peer(myNickname);
    
    peer.on('open', (id) => {
        document.getElementById('my-status').style.color = 'var(--success)';
        document.getElementById('my-status').textContent = 'В сети';
        renderFriends();
        connectToAllFriends();
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
       if (activeCall) activeCall.close();
       Object.values(activeConnections).forEach(c => c.close());
    });
}

let lastHeartbeat = {};

function connectToAllFriends() {
    friends.forEach(f => tryConnect(f.id));
    setInterval(() => {
        const now = Date.now();
        friends.forEach(f => {
            const conn = activeConnections[f.id];
            if (conn && conn.open) {
                conn.send({ type: 'ping', from: myNickname });
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
        activeConnections[conn.peer] = conn;
        lastHeartbeat[conn.peer] = Date.now();
        // Автоматически добавляем в друзья если кто-то написал/подключился
        if (!friends.find(f => f.id === conn.peer)) {
            friends.push({ id: conn.peer, name: conn.peer });
            localStorage.setItem('orbit_friends', JSON.stringify(friends));
        }
        renderFriends();

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
        renderFriends();
    };
}
async function renderFriends() {
    friendsListContainer.innerHTML = '';
    for (const f of friends) {
        const isOnline = !!(activeConnections[f.id] && activeConnections[f.id].open);
        
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
        fName.textContent = f.name;

        const fPreview = document.createElement('span');
        fPreview.className = 'friend-preview-text';
        fPreview.textContent = preview;

        div.innerHTML = `
            <div class="friend-avatar">
                <span class="avatar-letter"></span>
                <div class="friend-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="friend-info-col">
                <div class="friend-name-container"></div>
                <div class="friend-preview-row">
                    <span class="preview-container"></span>
                    <span class="friend-time">${timeStr}</span>
                </div>
            </div>
        `;
        div.querySelector('.avatar-letter').textContent = f.name.substring(0, 2).toUpperCase();
        div.querySelector('.friend-name-container').replaceWith(fName);
        div.querySelector('.preview-container').replaceWith(fPreview);

        div.onclick = () => openChat(f.id);
        friendsListContainer.appendChild(div);
    }
}

function openChat(friendId) {
    currentChatFriend = friendId;
    renderFriends(); // updates active selection
    
    appContainer.classList.add('chat-open');
    chatAreaEmpty.style.display = 'none';
    chatAreaActive.style.display = 'flex';
    chatFriendName.textContent = friendId;
    document.getElementById('chat-friend-status').textContent = (activeConnections[friendId] && activeConnections[friendId].open) ? 'в сети' : 'не в сети';
    document.getElementById('chat-friend-status').style.color = (activeConnections[friendId] && activeConnections[friendId].open) ? 'var(--success)' : 'var(--text-muted)';
    currentChatAvatarText.textContent = friendId.substring(0,2).toUpperCase();
    
    if (!activeConnections[friendId] || !activeConnections[friendId].open) {
        tryConnect(friendId);
    }
    
    renderMessages();
}

// Chat DB
async function saveHistory(friendId, msgObj) {
    const key = `chat_${myNickname}_${friendId}`;
    await saveMsgToDB(key, msgObj);
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
        
        let statusStr = '';
        if (msg.from === myNickname) {
            if (msg.status === 'read') statusStr = '<span style="color:var(--success);">✓✓</span> ';
            else if (msg.status === 'delivered') statusStr = '<span style="color:var(--text-muted);">✓✓</span> ';
            else statusStr = '<span style="color:var(--text-muted);">✓</span> '; // sent
        }

        const timeDiv = document.createElement('div');
        timeDiv.className = 'msg-time';
        
        if (statusStr) {
            const wrapper = document.createElement('span');
            wrapper.innerHTML = statusStr; // safe, as statusStr contains static HTML ✓✓
            timeDiv.appendChild(wrapper.firstChild);
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
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
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
    sendVoiceBtn.releasePointerCapture(e.pointerId);
    
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
        await saveHistory(currentChatFriend, { from: myNickname, type: 'text', content: text, ts: payload.ts, status: 'sent' });
        renderMessages();

        const conn = activeConnections[currentChatFriend];
        if (conn && conn.open) conn.send({ ...payload, from: myNickname });
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
        if (conn && conn.open) conn.send({ type: 'typing', from: myNickname });
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
    lastHeartbeat[senderId] = Date.now();
    
    if (data.type === 'ping') {
        const conn = activeConnections[senderId];
        if (conn && conn.open) conn.send({ type: 'pong', from: myNickname });
        return;
    }
    if (data.type === 'pong') return;
    
    if (data.type === 'typing') {
        if (currentChatFriend === senderId) {
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

    if (data.type === 'text') {
        await saveHistory(senderId, { from: senderId, type: 'text', content: data.content, ts: data.ts });
        sendAck(senderId, data.ts);
        if (currentChatFriend === senderId) renderMessages();
    } else if (['image', 'video', 'file', 'audio'].includes(data.type)) {
        const blob = new Blob([data.fileData], { type: data.mime || 'application/octet-stream' });
        const reader = new FileReader();
        reader.onload = async function(e) {
             await saveHistory(senderId, { from: senderId, type: data.type, content: e.target.result, name: data.name, ts: data.ts });
             sendAck(senderId, data.ts);
             if (currentChatFriend === senderId) renderMessages();
        };
        reader.readAsDataURL(blob);
    }
}

function sendMediaBlob(file, type, name) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        const arrayBuffer = ev.target.result;
        const payload = { type: type, fileData: arrayBuffer, mime: file.type, name: name, ts: Date.now() };
        
        const conn = activeConnections[currentChatFriend];
        if (conn && conn.open) conn.send({ ...payload, from: myNickname });
        
        const b64Reader = new FileReader();
        b64Reader.onload = async (bEv) => {
            await saveHistory(currentChatFriend, { from: myNickname, type: type, content: bEv.target.result, name: name, ts: payload.ts, status: 'sent' });
            renderMessages();
        }
        b64Reader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
}

fileBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    if(!currentChatFriend) return;
    const file = e.target.files[0];
    if(!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert("Ограничение файла - 10MB");
        return;
    }
    
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const type = isImage ? 'image' : (isVideo ? 'video' : 'file');

    sendMediaBlob(file, type, file.name);
};

// === Calls ===
function handleIncomingCall(call) {
    incomingCallTmp = call;
    callerNameDisplay.textContent = `${call.peer} ${t.caller}`;
    incomingCallModal.style.display = 'flex';
    if (window.Notification && Notification.permission === 'granted') {
        new Notification(t.incoming, { body: `${call.peer} ${t.caller}`, icon: '/favicon.ico' });
    }
}

acceptCallBtn.onclick = () => {
    incomingCallModal.style.display = 'none';
    if (!incomingCallTmp) return;

    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(err => {
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
        callStatus.textContent = 'Звонок идет';
        callScreen.style.display = 'flex';
        
        activeCall.on('stream', (remoteStream) => remoteVideo.srcObject = remoteStream);
        activeCall.on('close', closeCallUI);
    });
};

rejectCallBtn.onclick = () => {
    incomingCallModal.style.display = 'none';
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
    const conn = activeConnections[currentChatFriend];
    if (!conn || !conn.open) return alert(t.callingError);

    try {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        
        if (screenStream) {
            localStream = screenStream;
        } else {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: audioOn, video: videoOn });
        }
    } catch(err) {
        console.warn('Media get failure:', err);
        // Если просили видео, попробуем скинуться только на аудио
        if (videoOn) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
    callUserName.textContent = currentChatFriend;
    callStatus.textContent = 'Набор...';
    callScreen.style.display = 'flex';

    activeCall.on('stream', (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
        callStatus.textContent = 'В звонке';
    });
    activeCall.on('error', (err) => { alert('Связь прервалась.'); closeCallUI(); });
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
    callScreen.style.display = 'none';
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    activeCall = null;
    callToggleAudio.style.opacity = '1';
    callToggleVideo.style.opacity = '1';
}
