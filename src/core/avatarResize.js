// Normalise an uploaded image into a 256×256 JPEG data URL suitable for use as
// an avatar. Centre-crops (cover-fit), strips EXIF, and re-encodes — the
// output is always jpeg regardless of input type. Used by onboarding and the
// profile editor (previously duplicated in two places).

const DEFAULT_MAX_BYTES = 3 * 1024 * 1024; // 3 MB source file cap
const DEFAULT_SIZE = 256;
const DEFAULT_QUALITY = 0.86;

/**
 * Validate + resize a File into a JPEG data URL.
 *
 * @throws {Error} if file missing, non-image, too large, or canvas/encode fails.
 */
export async function fileToAvatarDataUrl(file, {
  maxBytes = DEFAULT_MAX_BYTES,
  size = DEFAULT_SIZE,
  quality = DEFAULT_QUALITY,
} = {}) {
  if (!file) return null;
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`Аватар слишком большой (макс ${mb}MB)`);
  }
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Нужна картинка');
  }

  const src = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('Ошибка чтения файла'));
    r.readAsDataURL(file);
  });

  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(true);
    img.onerror = () => reject(new Error('Не удалось обработать изображение'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');

  // Cover-fit: scale so the shorter edge fills `size`, then centre-crop.
  const sc = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * sc;
  const h = img.naturalHeight * sc;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
