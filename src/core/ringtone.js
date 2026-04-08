export function createRingtonePlayer() {
  let intervalId = null;
  let audioCtx = null;

  function beep() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.11);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.28, audioCtx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.32);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.33);
  }

  return {
    start() {
      if (intervalId) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        beep();
        intervalId = setInterval(() => {
          beep();
          setTimeout(beep, 150);
        }, 2000);
      } catch (_) {
      }
    },
    stop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      if (audioCtx) {
        try { audioCtx.close(); } catch (_) {}
        audioCtx = null;
      }
    }
  };
}

