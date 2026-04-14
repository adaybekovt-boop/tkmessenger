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

export async function createVoiceRecorder() {
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

  const startedAt = Date.now();
  recorder.start(100);

  return {
    getSamples: () => samples.slice(),
    elapsed: () => Date.now() - startedAt,
    async stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
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
      // Компрессируем waveform до 48 точек
      const compact = compressSamples(samples, 48);
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
      return { blob, duration, waveform: compact, mime: blob.type };
    },
    async cancel() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
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
