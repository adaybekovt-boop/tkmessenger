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
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const backBtn = document.getElementById('back-btn');

// Video Calls
const callBtn = document.getElementById('call-btn');
const audioCallBtn = document.getElementById('audio-call-btn');
const screenBtn = document.getElementById('screen-btn');
const videoContainer = document.getElementById('video-container');
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
    myAvatarLetter.innerHTML = myNickname.substring(0, 2).toUpperCase();

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
        }
    });

    window.addEventListener('beforeunload', () => {
       if (activeCall) activeCall.close();
       Object.values(activeConnections).forEach(c => c.close());
    });
}

function connectToAllFriends() {
    friends.forEach(f => tryConnect(f.id));
    // Пингуем список каждые 10 секунд (переподключение)
    setInterval(() => {
        friends.forEach(f => tryConnect(f.id));
    }, 10000);
}

function tryConnect(friendId) {
    if (activeConnections[friendId] && activeConnections[friendId].open) return;
    const conn = peer.connect(friendId, { reliable: true });
    handleIncomingConnection(conn);
}

function addFriend(id) {
    id = id.trim();
    if (!id || id === myNickname) return;
    if (friends.find(f => f.id === id)) return alert('Уже в друзьях!');
    friends.push({ id, name: id });
    localStorage.setItem('orbit_friends', JSON.stringify(friends));
    renderFriends();
    tryConnect(id); // try connecting immediately
}

addFriendBtn.onclick = () => { addFriend(addFriendInput.value); addFriendInput.value = ''; };

function handleIncomingConnection(conn) {
    conn.on('open', () => {
        activeConnections[conn.peer] = conn;
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
function renderFriends() {
    friendsListContainer.innerHTML = '';
    friends.forEach(f => {
        const isOnline = !!(activeConnections[f.id] && activeConnections[f.id].open);
        
        const div = document.createElement('div');
        div.className = 'friend-item';
        if (currentChatFriend === f.id) div.classList.add('active');
        
        div.innerHTML = `
            <div class="friend-avatar">
                <span>${f.name.substring(0,2).toUpperCase()}</span>
                <div class="friend-status ${isOnline ? 'online' : ''}"></div>
            </div>
            <div class="friend-name">${f.name}</div>
        `;
        div.onclick = () => openChat(f.id);
        friendsListContainer.appendChild(div);
    });
}

function openChat(friendId) {
    currentChatFriend = friendId;
    renderFriends(); // updates active selection
    
    appContainer.classList.add('chat-open');
    chatAreaEmpty.style.display = 'none';
    chatAreaActive.style.display = 'flex';
    chatFriendName.textContent = friendId;
    currentChatAvatarText.innerHTML = friendId.substring(0,2).toUpperCase();
    
    if (!activeConnections[friendId] || !activeConnections[friendId].open) {
        tryConnect(friendId);
    }
    
    renderMessages();
}

// Chat DB
function saveHistory(friendId, msgObj) {
    const key = `chat_${myNickname}_${friendId}`;
    let history = JSON.parse(localStorage.getItem(key) || '[]');
    history.push(msgObj);
    localStorage.setItem(key, JSON.stringify(history));
}

function renderMessages() {
    if (!currentChatFriend) return;
    messagesList.innerHTML = '';
    const key = `chat_${myNickname}_${currentChatFriend}`;
    const history = JSON.parse(localStorage.getItem(key) || '[]');
    
    history.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.from === myNickname ? 'me' : 'them'}`;
        
        if (msg.type === 'text') {
            div.textContent = msg.content;
        } else if (msg.type === 'image') {
            div.innerHTML = `<img src="${msg.content}" style="max-width:100%; border-radius:8px;">`;
        } else if (msg.type === 'video') {
            div.innerHTML = `<video src="${msg.content}" controls style="max-width:100%; border-radius:8px;"></video>`;
        } else if (msg.type === 'file') {
             div.innerHTML = `<a href="${msg.content}" download="${msg.name || 'file'}" style="color:var(--accent); text-decoration:underline;">📎 Скачать ${msg.name || 'файл'}</a>`;
        }
        
        const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeDiv = document.createElement('div');
        timeDiv.className = 'msg-time';
        timeDiv.textContent = time;
        div.appendChild(timeDiv);

        messagesList.appendChild(div);
    });
    
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Sending & Receiving
sendBtn.onclick = () => {
    if (!currentChatFriend) return;
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    const payload = { type: 'text', content: text, ts: Date.now() };

    saveHistory(currentChatFriend, { from: myNickname, type: 'text', content: text, ts: Date.now() });
    renderMessages();

    const conn = activeConnections[currentChatFriend];
    if (conn && conn.open) conn.send({ ...payload, from: myNickname });
};

chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendBtn.click(); };

function receiveMessage(senderId, data) {
    if (data.type === 'text') {
        saveHistory(senderId, { from: senderId, type: 'text', content: data.content, ts: data.ts });
    } else if (['image', 'video', 'file'].includes(data.type)) {
        const blob = new Blob([data.fileData], { type: data.mime || 'application/octet-stream' });
        const reader = new FileReader();
        reader.onload = function(e) {
             saveHistory(senderId, { from: senderId, type: data.type, content: e.target.result, name: data.name, ts: data.ts });
             if (currentChatFriend === senderId) renderMessages();
        };
        reader.readAsDataURL(blob);
        return; 
    }
    
    if (currentChatFriend === senderId) renderMessages();
}

fileBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    if(!currentChatFriend) return;
    const file = e.target.files[0];
    if(!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("Для версии 2.0 размер файла ограничен 5MB (в целях кэширования истории)");
        return;
    }
    
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const type = isImage ? 'image' : (isVideo ? 'video' : 'file');

    const reader = new FileReader();
    reader.onload = function(ev) {
        const arrayBuffer = ev.target.result;
        const payload = { type: type, fileData: arrayBuffer, mime: file.type, name: file.name, ts: Date.now() };
        
        const conn = activeConnections[currentChatFriend];
        if (conn && conn.open) conn.send({ ...payload, from: myNickname });
        
        const b64Reader = new FileReader();
        b64Reader.onload = (bEv) => {
            saveHistory(currentChatFriend, { from: myNickname, type: type, content: bEv.target.result, name: file.name, ts: Date.now() });
            renderMessages();
        }
        b64Reader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
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
        videoContainer.style.display = 'flex';
        
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
    videoContainer.style.display = 'flex';

    activeCall.on('stream', (remoteStream) => remoteVideo.srcObject = remoteStream);
    activeCall.on('error', (err) => { alert('Связь прервалась.'); closeCallUI(); });
    activeCall.on('close', closeCallUI);
}

endCallBtn.onclick = () => {
    if (activeCall) activeCall.close();
    closeCallUI();
};

function closeCallUI() {
    videoContainer.style.display = 'none';
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    activeCall = null;
}
