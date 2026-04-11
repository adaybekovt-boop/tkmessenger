export function createCallManager(options) {
  let localStream = null;
  let activeCall = null;
  let callStatus = 'idle'; // idle | calling | in-call
  let callingTarget = null;
  let savedCameraTrack = null;

  let ringtoneInterval = null;
  let audioCtx = null;

  function playRingtone() {
    if (ringtoneInterval) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      function beep() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
      
      beep();
      ringtoneInterval = setInterval(() => {
        beep();
        setTimeout(beep, 150);
      }, 2000);
    } catch (e) {
      console.warn('Ringtone play failed', e);
    }
  }

  function stopRingtone() {
    if (ringtoneInterval) clearInterval(ringtoneInterval);
    ringtoneInterval = null;
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }
  }

  function resolveVideoConstraints(videoEnabled) {
    if (!videoEnabled) return false;
    if (options.getBatterySaver?.()) {
      return {
        width: { ideal: 320, max: 426 },
        height: { ideal: 240, max: 240 },
        facingMode: 'user'
      };
    }
    return options.getVideoConstraints ? options.getVideoConstraints() : true;
  }

  async function startCall(friendId, videoEnabled) {
    try {
      callStatus = 'calling';
      callingTarget = friendId;

      const constraints = {
        audio: options.getAudioConstraints ? options.getAudioConstraints() : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: resolveVideoConstraints(videoEnabled)
      };
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC media devices are not available. Serve over HTTPS.');
      }
      
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (videoErr) {
        if (videoEnabled) {
          console.warn('Failed to get video, falling back to audio', videoErr);
          constraints.video = false;
          localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw videoErr;
        }
      }

      if (options.el?.localVideo) {
        options.el.localVideo.srcObject = localStream;
        options.el.localVideo.play().catch(e => console.warn('Local video play failed:', e));
      }

      const call = options.peer.call(friendId, localStream);
      setupCallEvents(call);

      if (options.el?.callScreen) {
        options.el.callScreen.style.display = 'flex';
      }
      return call;
    } catch (err) {
      callStatus = 'idle';
      callingTarget = null;
      console.error('Failed to start call', err);
      if (options.el?.callScreen) options.el.callScreen.style.display = 'none';
      if (window.alert) alert('Could not access camera/microphone: ' + err.message);
    }
  }

  function handleIncomingCall(call) {
    const callerId = call.peer;

    // --- Glare resolution: both sides calling each other simultaneously ---
    if (callStatus === 'calling' && callingTarget === callerId) {
      const myPeerId = String(options.peer?.id || '');
      const keepOutgoing = myPeerId && myPeerId < String(callerId);
      if (keepOutgoing) {
        // My outgoing call has priority — ignore/reject their incoming
        call.close();
        return;
      } else {
        // Their call has priority — cancel my outgoing, accept theirs
        if (activeCall) {
          activeCall.close();
          activeCall = null;
        }
        callStatus = 'idle';
        callingTarget = null;
        // Auto-answer below
        autoAnswer(call);
        return;
      }
    }

    if (options.el?.incomingCallModal) {
      options.el.incomingCallModal.style.display = 'flex';
      options.el.incomingCallModal.removeAttribute('aria-hidden');

      const callerNameEl = options.el.incomingCallModal.querySelector('#caller-name');
      if (callerNameEl) callerNameEl.textContent = callerId;

      const acceptBtn = options.el.incomingCallModal.querySelector('#accept-call-btn');
      const rejectBtn = options.el.incomingCallModal.querySelector('#reject-call-btn');
      acceptBtn?.replaceWith(acceptBtn.cloneNode(true));
      rejectBtn?.replaceWith(rejectBtn.cloneNode(true));
      const newAccept = options.el.incomingCallModal.querySelector('#accept-call-btn');
      const newReject = options.el.incomingCallModal.querySelector('#reject-call-btn');

      const acceptHandler = async () => {
        stopRingtone();
        newAccept?.removeEventListener('click', acceptHandler);
        newReject?.removeEventListener('click', rejectHandler);
        options.el.incomingCallModal.style.display = 'none';
        options.el.incomingCallModal.setAttribute('aria-hidden', 'true');
        await answerCall(call);
      };

      const rejectHandler = () => {
        stopRingtone();
        newAccept?.removeEventListener('click', acceptHandler);
        newReject?.removeEventListener('click', rejectHandler);
        options.el.incomingCallModal.style.display = 'none';
        options.el.incomingCallModal.setAttribute('aria-hidden', 'true');
        call.close();
      };

      newAccept?.addEventListener('click', acceptHandler);
      newReject?.addEventListener('click', rejectHandler);
      
      playRingtone();
    }
  }

  async function autoAnswer(call) {
    stopRingtone();
    await answerCall(call);
  }

  async function answerCall(call) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC media devices are not available. Serve over HTTPS.');
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: options.getAudioConstraints ? options.getAudioConstraints() : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: resolveVideoConstraints(true)
        });
      } catch (videoErr) {
        console.warn('Could not get video for answer, falling back to audio', videoErr);
        localStream = await navigator.mediaDevices.getUserMedia({ 
          audio: options.getAudioConstraints ? options.getAudioConstraints() : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
          video: false 
        });
      }
      if (options.el?.localVideo) {
        options.el.localVideo.srcObject = localStream;
        options.el.localVideo.play().catch(e => console.warn('Local video play failed:', e));
      }
      call.answer(localStream);
      setupCallEvents(call);
      callStatus = 'in-call';
      callingTarget = null;
      if (options.el?.callScreen) options.el.callScreen.style.display = 'flex';
    } catch (err) {
      console.error('Failed to answer call', err);
      if (window.alert) alert('Failed to answer call: ' + err.message);
    }
  }

  function setupCallEvents(call) {
    activeCall = call;
    call.on('stream', (remoteStream) => {
      callStatus = 'in-call';
      if (options.el?.remoteVideo) {
        options.el.remoteVideo.srcObject = remoteStream;
        options.el.remoteVideo.play().catch(e => console.warn('Remote video play failed:', e));
      }
    });
    call.on('close', () => {
      endCall();
    });
  }

  function endCall() {
    stopRingtone();
    if (activeCall) {
      activeCall.close();
      activeCall = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    // Clear srcObject on video elements to prevent memory leaks
    if (options.el?.localVideo) {
      options.el.localVideo.srcObject = null;
    }
    if (options.el?.remoteVideo) {
      options.el.remoteVideo.srcObject = null;
    }
    savedCameraTrack = null;
    callStatus = 'idle';
    callingTarget = null;
    if (options.el?.callScreen) {
      options.el.callScreen.style.display = 'none';
    }
  }

  function toggleAudio() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }

  async function startScreenShare() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen sharing is not supported on this device/browser.');
      }
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Save current camera track for restoration
      if (localStream) {
        savedCameraTrack = localStream.getVideoTracks()[0] || null;
      }

      screenTrack.onended = () => {
        // When user stops sharing via browser UI, revert to camera
        stopScreenShare();
        if (options.onScreenTrackEnded) options.onScreenTrackEnded();
      };

      const pc = activeCall?.peerConnection;
      if (pc && typeof pc.getSenders === 'function') {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        } else {
          try {
            if (typeof pc.addTrack === 'function') pc.addTrack(screenTrack, screenStream);
          } catch (e) {
            console.warn('Could not add screen track:', e);
          }
        }
      }

      if (options.el?.localVideo) {
        options.el.localVideo.srcObject = screenStream;
        options.el.localVideo.play().catch(e => console.warn('Screen video play failed:', e));
      }

      return screenStream;
    } catch (err) {
      console.error('Screen share failed', err);
      if (window.alert) alert('Screen sharing not supported or denied: ' + err.message);
    }
  }

  function stopScreenShare() {
    const pc = activeCall?.peerConnection;
    if (savedCameraTrack && pc && typeof pc.getSenders === 'function') {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(savedCameraTrack);
      }
      if (options.el?.localVideo && localStream) {
        options.el.localVideo.srcObject = localStream;
      }
    }
    savedCameraTrack = null;
  }

  return {
    startCall,
    handleIncomingCall,
    endCall,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    get localStream() { return localStream; },
    get activeCall() { return activeCall; },
    get callStatus() { return callStatus; }
  };
}
