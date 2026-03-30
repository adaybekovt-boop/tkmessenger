import { showToast } from '../ui/toast.js';
/**
 * Encapsulates PeerJS media calls, track lifecycle, and UI binding.
 * Ensures every track is stopped and video elements cleared (critical on iOS Safari).
 */

export function createCallManager(options) {
  const {
    peer,
    getCurrentChatFriend,
    getActiveConnections,
    openChat,
    getVideoConstraints,
    getAudioConstraints,
    getAppSettings,
    getIsOffline,
    t,
    el,
    onScreenTrackEnded,
  } = options;

  let activeCall = null;
  let incomingCallTmp = null;
  let localStream = null;

  function bindRemoteVideoStatus() {
    el.remoteVideo.onpause = () => {
      if (activeCall) el.callStatus.textContent = 'Видео на паузе';
    };
    el.remoteVideo.onplaying = () => {
      if (activeCall) el.callStatus.textContent = 'В звонке';
    };
  }

  function stopStreamFully(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
    } catch (_) {}
  }

  function clearVideoElements() {
    try {
      if (el.localVideo.srcObject) {
        stopStreamFully(el.localVideo.srcObject);
      }
      if (el.remoteVideo.srcObject) {
        stopStreamFully(el.remoteVideo.srcObject);
      }
    } catch (_) {}
    el.localVideo.srcObject = null;
    el.remoteVideo.srcObject = null;
    el.localVideo.removeAttribute('src');
    el.remoteVideo.removeAttribute('src');
  }

  function endCall() {
    const ac = activeCall;
    activeCall = null;
    if (ac) {
      try {
        ac.close();
      } catch (_) {}
    }
    stopStreamFully(localStream);
    localStream = null;
    clearVideoElements();
    el.callScreen.style.display = 'none';
    el.callToggleAudio.style.opacity = '1';
    el.callToggleVideo.style.opacity = '1';
  }

  async function startCall(videoOn, audioOn, screenStream = null) {
    const friend = getCurrentChatFriend();
    if (!friend) return;
    const conns = getActiveConnections();
    if (getIsOffline?.()) {
      showToast('Нет сети. Звонок недоступен.');
      return;
    }
    const conn = conns[friend];
    if (!conn || !conn.open) {
      showToast(t.callingError);
      return;
    }

    endCall();

    try {
      if (screenStream) {
        localStream = screenStream;
      } else {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioOn ? getAudioConstraints() : false,
          video: videoOn ? getVideoConstraints(getAppSettings().videoQuality) : false,
        });
      }
    } catch (err) {
      if (videoOn) {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: getAudioConstraints(),
            video: false,
          });
          showToast(t.camFallback);
        } catch (e2) {
          showToast(t.mediaError);
          return;
        }
      } else {
        showToast(t.mediaError);
        return;
      }
    }

    el.localVideo.srcObject = localStream;
    activeCall = peer.call(friend, localStream);
    el.callUserName.textContent = friend;
    el.callStatus.textContent = 'Соединение...';
    el.callScreen.style.display = 'flex';
    bindRemoteVideoStatus();

    activeCall.on('stream', (remoteStream) => {
      el.remoteVideo.srcObject = remoteStream;
      el.callStatus.textContent = 'В звонке';
    });
    activeCall.on('error', () => {
      showToast('Связь прервалась.');
      endCall();
    });
    activeCall.on('close', endCall);
  }

  function handleIncomingCall(call) {
    incomingCallTmp = call;
    el.callerNameDisplay.textContent = `${call.peer} ${t.caller}`;
    el.incomingCallModal.style.display = 'flex';
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(t.incoming, { body: `${call.peer} ${t.caller}`, icon: '/favicon.ico' });
    }
  }

  function acceptIncoming() {
    el.incomingCallModal.style.display = 'none';
    if (!incomingCallTmp) return;

    navigator.mediaDevices
      .getUserMedia({
        audio: getAudioConstraints(),
        video: getVideoConstraints(getAppSettings().videoQuality),
      })
      .catch(() => null)
      .then((stream) => {
        if (stream) {
          localStream = stream;
          el.localVideo.srcObject = localStream;
        } else {
          showToast(t.camError);
        }

        activeCall = incomingCallTmp;
        incomingCallTmp = null;

        if (activeCall.peer !== getCurrentChatFriend()) {
          void openChat(activeCall.peer);
        }

        activeCall.answer(stream);
        el.callUserName.textContent = activeCall.peer;
        el.callStatus.textContent = 'Соединение...';
        el.callScreen.style.display = 'flex';
        bindRemoteVideoStatus();

        activeCall.on('stream', (remoteStream) => {
          el.remoteVideo.srcObject = remoteStream;
          el.callStatus.textContent = 'В звонке';
        });
        activeCall.on('error', () => {
          showToast('Связь прервалась.');
          endCall();
        });
        activeCall.on('close', endCall);
      });
  }

  function rejectIncoming() {
    el.incomingCallModal.style.display = 'none';
    if (incomingCallTmp) {
      try {
        incomingCallTmp.close();
      } catch (_) {}
      incomingCallTmp = null;
    }
  }

  function toggleAudio() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        el.callToggleAudio.style.opacity = audioTrack.enabled ? '1' : '0.5';
      }
    }
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        el.callToggleVideo.style.opacity = videoTrack.enabled ? '1' : '0.5';
      }
    }
  }

  async function startScreenShare() {
    try {
      const sStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const vTrack = sStream.getVideoTracks()[0];
      if (vTrack && onScreenTrackEnded) {
        vTrack.addEventListener('ended', onScreenTrackEnded);
      }
      await startCall(true, true, sStream);
    } catch (err) {
      showToast('Демонстрация экрана недоступна (возможно вы локально).');
    }
  }

  el.acceptCallBtn.onclick = acceptIncoming;
  el.rejectCallBtn.onclick = rejectIncoming;
  el.endCallBtn.onclick = () => endCall();
  el.callBtn.onclick = () => startCall(true, true);
  if (el.audioCallBtn) el.audioCallBtn.onclick = () => startCall(false, true);
  el.screenBtn.onclick = () => void startScreenShare();
  el.callToggleAudio.onclick = toggleAudio;
  el.callToggleVideo.onclick = toggleVideo;

  return {
    get activeCall() {
      return activeCall;
    },
    set activeCall(v) {
      activeCall = v;
    },
    get localStream() {
      return localStream;
    },
    set localStream(v) {
      localStream = v;
    },
    get incomingCallTmp() {
      return incomingCallTmp;
    },
    set incomingCallTmp(v) {
      incomingCallTmp = v;
    },
    handleIncomingCall,
    startCall,
    endCall,
    clearVideoElements,
  };
}
