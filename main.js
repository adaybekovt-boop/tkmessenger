import Peer from 'peerjs';

const uiPanel = document.getElementById('ui-panel');
const loginPanel = document.getElementById('login-panel');
const chatPanel = document.getElementById('chat-panel');

const loginBtn = document.getElementById('login-btn');
const nicknameInput = document.getElementById('nickname-input');

const myIdEl = document.getElementById('my-id');
const connectIdInput = document.getElementById('connect-id');
const connectBtn = document.getElementById('connect-btn');
const orbitSpace = document.getElementById('orbit-space');
const statusText = document.getElementById('status-text');
const videoBtn = document.getElementById('video-btn');
const screenBtn = document.getElementById('screen-btn');

// Chat DOM
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');

let peer = null;
let myNickname = '';
let localStream = null;
let connections = {}; // connected peers
let currentCall = null;
let isVideoOn = false;
let isScreenOn = false;

// Registration & Login
function checkLogin() {
  const saved = localStorage.getItem('orbit_nickname');
  if (saved) {
    myNickname = saved;
    loginPanel.style.display = 'none';
    uiPanel.style.display = 'block';
    chatPanel.style.display = 'flex';
    init(myNickname);
  } else {
    loginPanel.style.display = 'flex';
    uiPanel.style.display = 'none';
    chatPanel.style.display = 'none';
  }
}

loginBtn.addEventListener('click', () => {
  const nick = nicknameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '');
  if (nick.length < 3) {
    alert('Ник должен быть минимум 3 символа (только латиница, цифры и _)');
    return;
  }
  localStorage.setItem('orbit_nickname', nick);
  myNickname = nick;
  loginPanel.style.display = 'none';
  uiPanel.style.display = 'block';
  chatPanel.style.display = 'flex';
  init(myNickname);
});

// Initialize Peer
function init(nickname) {
  peer = new Peer(nickname);

  peer.on('open', (id) => {
    myIdEl.textContent = id;
    statusText.textContent = 'Орбита активирована. Ожидание сигналов...';
    statusText.style.color = '#00f0ff';
  });

  peer.on('connection', (conn) => {
    handleConnection(conn);
  });

  peer.on('call', (call) => {
    const streamPromise = localStream 
      ? Promise.resolve(localStream) 
      : navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);

    streamPromise.then(stream => {
      if(stream) localStream = stream;
      currentCall = call;
      call.answer(stream);
      handleCall(call);
      showAudioWaveform('my-avatar', !!stream);
    });
  });

  peer.on('error', (err) => {
    console.error(err);
    if(err.type === 'unavailable-id') {
      alert('Этот никнейм уже занят кем-то другим в сети!');
      localStorage.removeItem('orbit_nickname');
      location.reload();
    }
    statusText.textContent = 'Ошибка: ' + err.type;
    statusText.style.color = '#ff4545';
  });
}

connectBtn.addEventListener('click', () => {
  const friendId = connectIdInput.value.trim();
  if (!friendId) return;

  statusText.textContent = 'Установка связи...';
  statusText.style.color = '#8ba1b5';
  
  const conn = peer.connect(friendId);
  handleConnection(conn);

  const streamPromise = localStream 
      ? Promise.resolve(localStream) 
      : navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);

  streamPromise.then(stream => {
    if(stream) localStream = stream;
    currentCall = peer.connect(friendId) ? peer.call(friendId, stream) : null;
    if(currentCall) handleCall(currentCall);
    showAudioWaveform('my-avatar', !!stream);
  });
});

// === CHAT & FILE SHARING ===
function appendMessage(sender, text, isMe = false) {
  const div = document.createElement('div');
  div.style.padding = '8px 12px';
  div.style.borderRadius = '12px';
  div.style.maxWidth = '85%';
  div.style.fontSize = '14px';
  div.style.wordBreak = 'break-word';
  
  if (isMe) {
    div.style.background = 'rgba(0, 240, 255, 0.1)';
    div.style.border = '1px solid var(--accent)';
    div.style.alignSelf = 'flex-end';
    div.innerHTML = `<span style="font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px;">Вы</span>${text}`;
  } else {
    div.style.background = 'rgba(255, 255, 255, 0.05)';
    div.style.border = '1px solid var(--glass-border)';
    div.style.alignSelf = 'flex-start';
    div.innerHTML = `<span style="font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px; color: #b545ff;">${sender}</span>${text}`;
  }
  
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMediaMessage(sender, fileBlob, fileType, isMe = false) {
  const div = document.createElement('div');
  div.style.padding = '8px';
  div.style.borderRadius = '12px';
  div.style.maxWidth = '85%';
  
  const url = URL.createObjectURL(fileBlob);
  let mediaHtml = '';
  
  if (fileType.startsWith('image/')) {
    mediaHtml = `<img src="${url}" style="max-width: 100%; border-radius: 8px;">`;
  } else if (fileType.startsWith('video/')) {
    mediaHtml = `<video src="${url}" controls style="max-width: 100%; border-radius: 8px;"></video>`;
  } else {
    mediaHtml = `<a href="${url}" download="file">📎 Скачать файл</a>`;
  }
  
  if (isMe) {
    div.style.alignSelf = 'flex-end';
    div.innerHTML = `<span style="font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px;">Вы (файл)</span>${mediaHtml}`;
  } else {
    div.style.alignSelf = 'flex-start';
    div.innerHTML = `<span style="font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px; color: #b545ff;">${sender} (файл)</span>${mediaHtml}`;
  }
  
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function broadcastData(data) {
  Object.values(connections).forEach(conn => {
    if (conn.open) conn.send(data);
  });
}

function sendMessage() {
  const text = chatInput.value.trim();
  if(!text) return;
  
  const payload = { type: 'text', sender: myNickname, content: text };
  broadcastData(payload);
  appendMessage(myNickname, text, true);
  chatInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  
  // Create blob and send
  const fileType = file.type;
  const reader = new FileReader();
  reader.onload = function(event) {
    const arrayBuffer = event.target.result;
    const blob = new Blob([arrayBuffer], { type: fileType });
    
    broadcastData({ type: 'file', sender: myNickname, fileType: fileType, fileData: blob });
    appendMediaMessage(myNickname, blob, fileType, true);
  };
  reader.readAsArrayBuffer(file);
});


// === MEDIA CONTROLS ===
videoBtn.addEventListener('click', async () => {
  if (!isVideoOn) {
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = vStream.getVideoTracks()[0];
      if(localStream) {
        localStream.addTrack(track);
      } else {
        localStream = vStream;
      }
      playVideoInAvatar('my-avatar', localStream);
      videoBtn.classList.add('active');
      isVideoOn = true;

      if (currentCall) updatePeerConnectionTrack(track);
    } catch(e) { 
        console.error('Video error:', e); 
        alert('Камера заблокирована браузером: возможно вы открыли файл напрямую (file://) или забыли выдать разрешение. Откройте через localhost (npm run dev) или соберите приложение.');
    }
  } else {
    if(localStream) {
      const track = localStream.getVideoTracks().find(t => t.kind === 'video');
      if (track) { track.stop(); localStream.removeTrack(track); }
    }
    removeVideoInAvatar('my-avatar');
    videoBtn.classList.remove('active');
    isVideoOn = false;
  }
});

screenBtn.addEventListener('click', async () => {
  if (!isScreenOn) {
    try {
      const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = sStream.getVideoTracks()[0];
      track.onended = () => { if(isScreenOn) screenBtn.click(); };

      if(localStream) {
        const oldTrack = localStream.getVideoTracks().find(t => t.kind === 'video');
        if (oldTrack) { oldTrack.stop(); localStream.removeTrack(oldTrack); }
        localStream.addTrack(track);
      } else {
        localStream = sStream;
      }
      playVideoInAvatar('my-avatar', localStream);
      screenBtn.classList.add('active');
      isScreenOn = true;

      if (currentCall) updatePeerConnectionTrack(track);
    } catch(e) { 
        console.error('Screen error:', e); 
        alert('Демонстрация экрана недоступна. Обычно браузеры блокируют эту функцию для локальных файлов (file://).');
    }
  } else {
    isScreenOn = false;
    screenBtn.classList.remove('active');
    if(localStream) {
       const track = localStream.getVideoTracks().find(t => t.label.includes('screen') || t.kind === 'video');
       if (track) { track.stop(); localStream.removeTrack(track); }
    }
    removeVideoInAvatar('my-avatar');
    if (isVideoOn) {
       isVideoOn = false;
       videoBtn.click();
    }
  }
});

function updatePeerConnectionTrack(newTrack) {
  if (!currentCall || !currentCall.peerConnection) return;
  const senders = currentCall.peerConnection.getSenders();
  const videoSender = senders.find(s => s.track && s.track.kind === 'video');
  if (videoSender) {
    videoSender.replaceTrack(newTrack);
  } else {
    currentCall.peerConnection.addTrack(newTrack, localStream);
  }
}

function playVideoInAvatar(avatarId, stream) {
  let av = document.getElementById(avatarId);
  if(!av) return;
  let vid = av.querySelector('.peer-video');
  if(!vid) {
    vid = document.createElement('video');
    vid.className = 'peer-video';
    vid.autoplay = true;
    vid.playsInline = true;
    if(avatarId === 'my-avatar') vid.muted = true;
    av.appendChild(vid);
  }
  vid.srcObject = stream;
}

function removeVideoInAvatar(avatarId) {
  let av = document.getElementById(avatarId);
  if(!av) return;
  let vid = av.querySelector('.peer-video');
  if(vid) vid.remove();
}

function handleConnection(conn) {
  conn.on('open', () => {
    statusText.textContent = 'Связь установлена!';
    statusText.style.color = '#00f0ff';
    connections[conn.peer] = conn;
    
    // Send a silent init message or just create avatar
    createPeerAvatar(conn.peer);

    conn.on('data', (data) => {
      if (data.type === 'text') {
        appendMessage(data.sender, data.content, false);
      } else if (data.type === 'file') {
        appendMediaMessage(data.sender, data.fileData, data.fileType, false);
      }
    });
  });

  conn.on('close', () => {
    removePeerAvatar(conn.peer);
    delete connections[conn.peer];
  });
}

function handleCall(call) {
  call.on('stream', (remoteStream) => {
    let audio = document.getElementById('audio-' + call.peer);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + call.peer;
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    audio.srcObject = remoteStream;
    
    createPeerAvatar(call.peer);
    showAudioWaveform('peer-' + call.peer, true);

    if (remoteStream.getVideoTracks().length > 0) {
       playVideoInAvatar('peer-' + call.peer, remoteStream);
    }
    remoteStream.onaddtrack = (e) => {
       if (e.track.kind === 'video') {
         playVideoInAvatar('peer-' + call.peer, remoteStream);
       }
    };
  });

  call.on('close', () => {
    let audio = document.getElementById('audio-' + call.peer);
    if(audio) audio.remove();
    showAudioWaveform('peer-' + call.peer, false);
  });
}

function createPeerAvatar(id) {
  if (document.getElementById('peer-' + id)) return;

  const avatar = document.createElement('div');
  avatar.className = 'avatar peer-avatar';
  avatar.id = 'peer-' + id;
  
  const angle = Math.random() * Math.PI * 2;
  const radius = 150 + Math.random() * 100;
  
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  
  avatar.innerHTML = `
    <span class="avatar-letter">${id.substring(0, 2).toUpperCase()}</span>
    <div class="aura"></div>
    <div class="audio-waveform" id="wave-${id}">
       <span></span><span></span><span></span><span></span>
    </div>
  `;

  makeDraggable(avatar);
  orbitSpace.appendChild(avatar);
}

function removePeerAvatar(id) {
  const av = document.getElementById('peer-' + id);
  if (av) av.remove();
}

function showAudioWaveform(avatarId, show) {
  const av = document.getElementById(avatarId);
  if (!av) return;
  
  let wave = av.querySelector('.audio-waveform');
  if(!wave && avatarId === 'my-avatar') {
    wave = document.createElement('div');
    wave.className = 'audio-waveform';
    wave.innerHTML = '<span></span><span></span><span></span><span></span>';
    av.appendChild(wave);
  }
  
  if (wave) {
    if (show) wave.classList.add('active');
    else wave.classList.remove('active');
  }
}

function makeDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  elmnt.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    if(elmnt.id === 'my-avatar') {
        elmnt.style.transform = 'none'; 
    }
    
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

makeDraggable(document.getElementById('my-avatar'));
checkLogin();
