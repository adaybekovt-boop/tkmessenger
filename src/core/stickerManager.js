import {
  putStickerPack,
  getStickerPack,
  getAllStickerPacks,
  deleteStickerPack,
  pushRecentSticker,
  getRecentStickers
} from './db.js';

/**
 * Orbits Sticker Manager
 * -----------------------
 * Локальное хранилище стикерпаков в IndexedDB + дефолтные паки,
 * которые генерируются как inline SVG (без загрузки файлов).
 *
 * Стикер: { id, emoji, label }
 * Пак:    { id, name, author, thumbnail, stickers: Sticker[] }
 */

function svgDataUrl(emoji) {
  // Встроенный SVG с большим эмодзи — валиден как <img src>
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="96" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function buildDefaultPack(id, name, emojis) {
  return {
    id,
    name,
    author: 'Orbits',
    thumbnail: svgDataUrl(emojis[0]),
    stickers: emojis.map((e, i) => ({ id: `${id}_${i}`, emoji: e, url: svgDataUrl(e), label: e })),
    installedAt: 0 // установится при первом сохранении
  };
}

export const DEFAULT_PACKS = [
  buildDefaultPack('orbits_faces', 'Лица', [
    '😀','😁','😂','🤣','😊','😇','🙂','😉','😍','🥰',
    '😘','😜','🤪','🤔','🤨','😐','😴','🥱','😭','😤',
    '😡','🤯','🥳','😎','🤩','🙃','🫡','🥹'
  ]),
  buildDefaultPack('orbits_hearts', 'Сердца', [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖',
    '💘','💝','💓','💞','💕','💌','💟','❣️','💔','♥️'
  ]),
  buildDefaultPack('orbits_gestures', 'Жесты', [
    '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉',
    '👆','👇','✋','🤚','🖐️','👋','🤝','🙏','💪','🫶',
    '🫰','🫵','👏','🙌'
  ]),
  buildDefaultPack('orbits_animals', 'Животные', [
    '🐶','🐱','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷',
    '🐸','🐵','🐔','🐧','🐦','🐤','🦄','🐝','🦋','🐙',
    '🐳','🐬','🦈','🐊'
  ]),
  buildDefaultPack('orbits_party', 'Вечеринка', [
    '🎉','🎊','🎈','🎂','🍰','🎁','🎀','🪅','🎆','🎇',
    '✨','⭐','🌟','💫','🔥','💥','🏆','🥇','🎯','🎮'
  ])
];

let ensuredDefaults = false;

export async function ensureDefaultPacks() {
  if (ensuredDefaults) return;
  ensuredDefaults = true;
  try {
    const existing = await getAllStickerPacks();
    const existingIds = new Set(existing.map((p) => p.id));
    for (const pack of DEFAULT_PACKS) {
      if (existingIds.has(pack.id)) continue;
      await putStickerPack({ ...pack, installedAt: Date.now() });
    }
  } catch (_) {
  }
}

export async function getInstalledPacks() {
  try {
    await ensureDefaultPacks();
    const rows = await getAllStickerPacks();
    return rows
      .slice()
      .sort((a, b) => (a.installedAt || 0) - (b.installedAt || 0));
  } catch (_) {
    return DEFAULT_PACKS;
  }
}

export async function installPack(packData) {
  if (!packData || !packData.id) return false;
  await putStickerPack({ ...packData, installedAt: Date.now() });
  return true;
}

export async function uninstallPack(packId) {
  await deleteStickerPack(packId);
  return true;
}

export async function recordStickerUsage(packId, stickerId) {
  try {
    await pushRecentSticker(packId, stickerId);
  } catch (_) {
  }
}

export async function getRecents(limit = 24) {
  try {
    const rows = await getRecentStickers(limit);
    const packs = await getInstalledPacks();
    const byKey = new Map();
    for (const p of packs) {
      for (const s of p.stickers || []) {
        byKey.set(`${p.id}:${s.id}`, { pack: p, sticker: s });
      }
    }
    const results = [];
    for (const r of rows) {
      const hit = byKey.get(r.key);
      if (hit) results.push(hit);
    }
    return results;
  } catch (_) {
    return [];
  }
}

/**
 * Собирает "плоский" индекс всех стикеров — для поиска по id пришедшего стикера.
 */
export async function resolveSticker(packId, stickerId) {
  try {
    const pack = await getStickerPack(packId);
    if (!pack) return null;
    const sticker = (pack.stickers || []).find((s) => s.id === stickerId);
    if (!sticker) return null;
    return { pack, sticker };
  } catch (_) {
    return null;
  }
}
