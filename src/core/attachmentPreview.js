// Utilities for generating preview thumbnails for chat attachments.
//
// Images → small JPEG data-URL thumbnail (max 320px longest side) so a
//          bubble shows something useful while the full blob loads from
//          IDB / streams over the wire.
// Videos → data-URL of the first frame, captured via <video> + <canvas>.
//
// Kept tiny on purpose. We do not re-encode the full attachment — the
// original blob still gets shipped as-is (with size caps enforced upstream).

export const MAX_THUMB_SIDE = 320;
export const MAX_THUMB_BYTES = 24 * 1024; // ~24 KB JPEG; stays under 32 KB base64

export function classifyFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function formatBytes(n) {
  const num = Number(n) || 0;
  if (num < 1024) return `${num} Б`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} КБ`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function readImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ img, url });
    };
    img.onerror = (err) => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      reject(err);
    };
    img.src = url;
  });
}

function canvasToJpegDataUrl(canvas, quality = 0.72) {
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch (_) {
    return null;
  }
}

/**
 * Shrink an image blob into a small JPEG data URL suitable for message
 * preview. Returns `{ thumb, width, height }` of the ORIGINAL image, or
 * null on failure.
 */
export async function buildImageThumbnail(blob) {
  if (!blob || typeof document === 'undefined') return null;
  let loaded;
  try {
    loaded = await readImage(blob);
  } catch (_) {
    return null;
  }
  const { img, url } = loaded;
  try {
    const ow = img.naturalWidth || img.width || 0;
    const oh = img.naturalHeight || img.height || 0;
    if (!ow || !oh) return null;
    const ratio = Math.min(1, MAX_THUMB_SIDE / Math.max(ow, oh));
    const tw = Math.max(1, Math.round(ow * ratio));
    const th = Math.max(1, Math.round(oh * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, tw, th);
    let quality = 0.72;
    let thumb = canvasToJpegDataUrl(canvas, quality);
    // Iterate down in quality if the thumb still overshoots.
    while (thumb && thumb.length > MAX_THUMB_BYTES * 1.4 && quality > 0.35) {
      quality -= 0.12;
      thumb = canvasToJpegDataUrl(canvas, quality);
    }
    return { thumb, width: ow, height: oh };
  } finally {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }
}

/**
 * Capture the first frame of a video blob + its duration in seconds.
 * Returns `{ thumb, width, height, duration }` or null.
 */
export async function buildVideoThumbnail(blob) {
  if (!blob || typeof document === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      const onLoad = () => resolve();
      const onErr = () => reject(new Error('video load'));
      video.addEventListener('loadeddata', onLoad, { once: true });
      video.addEventListener('error', onErr, { once: true });
      // Safari sometimes needs an explicit seek to render a frame.
      setTimeout(() => {
        try { video.currentTime = Math.min(0.1, video.duration || 0.1); } catch (_) {}
      }, 30);
    });
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (!vw || !vh) return null;
    const ratio = Math.min(1, MAX_THUMB_SIDE / Math.max(vw, vh));
    const tw = Math.max(1, Math.round(vw * ratio));
    const th = Math.max(1, Math.round(vh * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, tw, th);
    let quality = 0.72;
    let thumb = canvasToJpegDataUrl(canvas, quality);
    while (thumb && thumb.length > MAX_THUMB_BYTES * 1.4 && quality > 0.35) {
      quality -= 0.12;
      thumb = canvasToJpegDataUrl(canvas, quality);
    }
    return {
      thumb,
      width: vw,
      height: vh,
      duration: Number(video.duration) || 0
    };
  } catch (_) {
    return null;
  } finally {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }
}

export async function buildAttachmentPreview(file) {
  const kind = classifyFile(file);
  if (kind === 'image') {
    const t = await buildImageThumbnail(file);
    return {
      kind,
      thumb: t?.thumb || null,
      width: t?.width || 0,
      height: t?.height || 0,
      duration: 0
    };
  }
  if (kind === 'video') {
    const t = await buildVideoThumbnail(file);
    return {
      kind,
      thumb: t?.thumb || null,
      width: t?.width || 0,
      height: t?.height || 0,
      duration: t?.duration || 0
    };
  }
  return { kind, thumb: null, width: 0, height: 0, duration: 0 };
}
