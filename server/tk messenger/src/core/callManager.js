export function createCallManager(options) {
  let localStream = null;
  let activeCall = null;

  async function startCall(friendId, videoEnabled) {
    try {
      const constraints = {
        audio: options.getAudioConstraints ? options.getAudioConstraints() : true,
        video: videoEnabled ? (options.getVideoConstraints ? options.getVideoConstraints() : true) : false
      };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (options.el && options.el.localVideo) {
        options.el.localVideo.srcObject = localStream;
      }
      
      const call = options.peer.call(friendId, localStream);
      setupCallEvents(call);
      
      if (options.el && options.el.callScreen) {
        options.el.callScreen.style.display = 'flex';
      }
      return call;
    } catch (err) {
      console.error('Failed to start call', err);
    }
  }

  function handleIncomingCall(call) {
    if (options.el && options.el.incomingCallModal) {
      options.el.incomingCallModal.style.display = 'flex';
      
      const acceptBtn = options.el.incomingCallModal.querySelector('#accept-call-btn');
      const rejectBtn = options.el.incomingCallModal.querySelector('#reject-call-btn');
      
      const acceptHandler = async () => {
        options.el.incomingCallModal.style.display = 'none';
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          if (options.el.localVideo) options.el.localVideo.srcObject = localStream;
          call.answer(localStream);
          setupCallEvents(call);
          if (options.el.callScreen) options.el.callScreen.style.display = 'flex';
        } catch (err) {
          console.error('Failed to answer call', err);
        }
        cleanup();
      };
      
      const rejectHandler = () => {
        options.el.incomingCallModal.style.display = 'none';
        call.close();
        cleanup();
      };
      
      const cleanup = () => {
        acceptBtn?.removeEventListener('click', acceptHandler);
        rejectBtn?.removeEventListener('click', rejectHandler);
      };
      
      acceptBtn?.addEventListener('click', acceptHandler);
      rejectBtn?.addEventListener('click', rejectHandler);
    }
  }

  function setupCallEvents(call) {
    activeCall = call;
    call.on('stream', (remoteStream) => {
      if (options.el && options.el.remoteVideo) {
        options.el.remoteVideo.srcObject = remoteStream;
      }
    });
    call.on('close', () => {
      endCall();
    });
  }

  function endCall() {
    if (activeCall) {
      activeCall.close();
      activeCall = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (options.el && options.el.callScreen) {
      options.el.callScreen.style.display = 'none';
    }
  }

  function toggleAudio() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  }

  async function startScreenShare() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      screenTrack.onended = () => {
        if (options.onScreenTrackEnded) options.onScreenTrackEnded();
      };
      
      if (activeCall && activeCall.peerConnection) {
        const sender = activeCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      }
      return screenStream;
    } catch (err) {
      console.error('Screen share failed', err);
    }
  }

  return {
    startCall,
    handleIncomingCall,
    endCall,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    get localStream() { return localStream; },
    get activeCall() { return activeCall; }
  };
}