/**
 * Простая обертка вокруг MediaRecorder для голосовых сообщений.
 * Возвращает blob + длительность + простую waveform (амплитуды).
 */

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported?.(m)) return m;
    } catch (_) {
    }
  }
  return '';
}

function pickSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isTranscriptionSupported() {
  return !!pickSpeechRecognitionCtor();
}

// Kick off Web Speech API in parallel with MediaRecorder. The recognizer
// listens to the same mic the recorder is capturing, so the user sees the
// transcript build up live while they speak. No extra audio round-trip.
function startSpeechRecognition(lang) {
  const Ctor = pickSpeechRecognitionCtor();
  if (!Ctor) return null;
  let rec;
  try {
    rec = new Ctor();
  } catch (_) {
    return null;
  }
  try {
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang || navigator?.language || 'ru-RU';
  } catch (_) {}

  let finalText = '';
  let interimText = '';
  let stopped = false;

  rec.onresult = (evt) => {
    let interim = '';
    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      const r = evt.results[i];
      if (r.isFinal) finalText += (finalText ? ' ' : '') + String(r[0]?.transcript || '').trim();
      else interim += String(r[0]?.transcript || '');
    }
    interimText = interim.trim();
  };
  rec.onerror = () => {};
  rec.onend = () => {
    // Chrome often ends the session mid-utterance on silence. Restart unless
    // we asked it to stop, otherwise the tail of a message gets dropped.
    if (!stopped) {
      try { rec.start(); } catch (_) {}
    }
  };

  try { rec.start(); } catch (_) { return null; }

  return {
    getTranscript() {
      const combined = [finalText, interimText].filter(Boolean).join(' ').trim();
      return combined.slice(0, 2000);
    },
    stop() {
      stopped = true;
      try { rec.stop(); } catch (_) {}
    }
  };
}

export async function createVoiceRecorder(options = {}) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Микрофон недоступен');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder не поддерживается');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContextClass ? new AudioContextClass() : null;
  let analyser = null;
  let source = null;
  const samples = [];
  let rafId = 0;
  let stopped = false;

  if (ctx) {
    try {
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        samples.push(Math.min(1, rms * 2.2));
        if (samples.length > 120) samples.shift();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch (_) {
    }
  }

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Optional live transcription. Failure to start is non-fatal — the recorder
  // still works without it.
  const speech = options.transcribe === false ? null : startSpeechRecognition(options.lang);

  const startedAt = Date.now();
  recorder.start(100);

  return {
    getSamples: () => samples.slice(),
    elapsed: () => Date.now() - startedAt,
    getTranscript: () => (speech ? speech.getTranscript() : ''),
    transcriptionSupported: !!speech,
    async stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (speech) speech.stop();
      const finished = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });
      try {
        recorder.stop();
      } catch (_) {
      }
      await finished;
      try {
        for (const t of stream.getTracks()) t.stop();
      } catch (_) {
      }
      try {
        if (ctx) ctx.close?.();
      } catch (_) {
      }
      const duration = Math.round((Date.now() - startedAt) / 100) / 10;
      const compact = compressSamples(samples, 48);
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
      const transcript = speech ? speech.getTranscript() : '';
      return { blob, duration, waveform: compact, mime: blob.type, transcript };
    },
    async cancel() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (speech) speech.stop();
      try {
        recorder.stop();
      } catch (_) {
      }
      try {
        for (const t of stream.getTracks()) t.stop();
      } catch (_) {
      }
      try {
        if (ctx) ctx.close?.();
      } catch (_) {
      }
    }
  };
}

function compressSamples(arr, targetLen) {
  if (!arr.length) return [];
  if (arr.length <= targetLen) return arr.slice();
  const out = new Array(targetLen);
  const bucket = arr.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.floor((i + 1) * bucket);
    let max = 0;
    for (let j = start; j < end; j++) {
      if (arr[j] > max) max = arr[j];
    }
    out[i] = max;
  }
  return out;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') return reject(new Error('Не удалось прочитать blob'));
      const base64 = r.includes(',') ? r.split(',', 2)[1] : r;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Ошибка чтения blob'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64, mime = 'audio/webm') {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
