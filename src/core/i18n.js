// i18n.js — minimal translation helper.
//
// This is intentionally hand-rolled instead of react-intl / i18next: the
// feature set we need is tiny (a flat key → string lookup, three languages,
// no ICU plurals) and those libraries would add 30-50KB to the bundle
// purely to serve the Settings screen. If the scope ever grows we can swap
// this out — every caller uses the same `t()` + `useLang()` surface.
//
// Locale preference is stored under `orbits_lang` and applied to
// `<html lang>` on boot / on change so the browser's default language-
// aware bits (hyphenation, date formatters, speech recognition, etc.)
// pick up the right rules.

import { useSyncExternalStore } from 'react';

export const LANGUAGES = [
  { id: 'ru', label: 'Русский',  native: 'Русский' },
  { id: 'en', label: 'English',  native: 'English' },
  { id: 'kz', label: 'Қазақша',  native: 'Қазақша' },
];

const STORAGE_KEY = 'orbits_lang';

// Only the Settings surface and a handful of global labels are translated
// for now — the full messenger UI stays RU until we do a proper i18n pass.
// Unknown keys fall through to RU (the source language) so we never show
// blank strings.
const DICT = {
  ru: {
    'settings.title':          'Настройки',
    'settings.sections':       'Разделы настроек',
    'settings.profile':        'Профиль',
    'settings.profile.sub':    'Имя, аватар и описание',
    'settings.security':       'Безопасность',
    'settings.security.sub':   'Wipe-on-Close, Duress-пароль, шифрование',
    'settings.chats':          'Чаты',
    'settings.chats.sub':      'Настройка чатов, синхронизация, очистка',
    'settings.notifications':  'Уведомления',
    'settings.appearance':     'Внешний вид',
    'settings.appearance.sub': 'Темы и цвет акцента',
    'settings.mic':            'Микрофон',
    'settings.mic.sub':        'Устройство, эффекты и тест',
    'settings.power':          'Энергосбережение',
    'settings.power.sub':      'Уменьшить blur и анимации',
    'settings.network':        'Сеть',
    'settings.network.sub':    'ID и сигналинг',
    'settings.diagnostics':    'Диагностика',
    'settings.diagnostics.sub':'PWA и Web Worker',
    'settings.language':       'Язык',
    'settings.language.sub':   'Язык интерфейса',
    'settings.sounds':         'Звуки',
    'settings.sounds.sub':     'Пресет сигналов уведомлений',
    'settings.online':         'онлайн',
    'settings.offline':        'оффлайн',
    'sounds.preset':           'Пресет',
    'sounds.preview':          'Прослушать',
    'common.back':             'Назад',
  },
  en: {
    'settings.title':          'Settings',
    'settings.sections':       'All sections',
    'settings.profile':        'Profile',
    'settings.profile.sub':    'Name, avatar and bio',
    'settings.security':       'Security',
    'settings.security.sub':   'Wipe-on-Close, Duress password, encryption',
    'settings.chats':          'Chats',
    'settings.chats.sub':      'Chat preferences, sync, cleanup',
    'settings.notifications':  'Notifications',
    'settings.appearance':     'Appearance',
    'settings.appearance.sub': 'Themes and accent colour',
    'settings.mic':            'Microphone',
    'settings.mic.sub':        'Device, effects and test',
    'settings.power':          'Power saving',
    'settings.power.sub':      'Reduce blur and animations',
    'settings.network':        'Network',
    'settings.network.sub':    'ID and signaling',
    'settings.diagnostics':    'Diagnostics',
    'settings.diagnostics.sub':'PWA and Web Worker',
    'settings.language':       'Language',
    'settings.language.sub':   'Interface language',
    'settings.sounds':         'Sounds',
    'settings.sounds.sub':     'Notification tone preset',
    'settings.online':         'online',
    'settings.offline':        'offline',
    'sounds.preset':           'Preset',
    'sounds.preview':          'Preview',
    'common.back':             'Back',
  },
  kz: {
    'settings.title':          'Баптаулар',
    'settings.sections':       'Барлық бөлімдер',
    'settings.profile':        'Профиль',
    'settings.profile.sub':    'Аты, аватар және био',
    'settings.security':       'Қауіпсіздік',
    'settings.security.sub':   'Wipe-on-Close, Duress құпия сөзі, шифрлау',
    'settings.chats':          'Чаттар',
    'settings.chats.sub':      'Чат баптаулары, синхрондау, тазалау',
    'settings.notifications':  'Хабарландырулар',
    'settings.appearance':     'Көрініс',
    'settings.appearance.sub': 'Тақырыптар және акцент түсі',
    'settings.mic':            'Микрофон',
    'settings.mic.sub':        'Құрылғы, эффектілер және тест',
    'settings.power':          'Қуатты үнемдеу',
    'settings.power.sub':      'Blur және анимацияларды азайту',
    'settings.network':        'Желі',
    'settings.network.sub':    'ID және сигналинг',
    'settings.diagnostics':    'Диагностика',
    'settings.diagnostics.sub':'PWA және Web Worker',
    'settings.language':       'Тіл',
    'settings.language.sub':   'Интерфейс тілі',
    'settings.sounds':         'Дыбыстар',
    'settings.sounds.sub':     'Хабарландыру сигналының пресеті',
    'settings.online':         'онлайн',
    'settings.offline':        'офлайн',
    'sounds.preset':           'Пресет',
    'sounds.preview':          'Тыңдау',
    'common.back':             'Артқа',
  },
};

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && DICT[raw]) return raw;
  } catch (_) {}
  // Fall back to the browser's preferred language, clamped to something we
  // actually support.
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'ru';
  const head = String(nav).toLowerCase().split(/[-_]/)[0];
  if (DICT[head]) return head;
  return 'ru';
}

let currentLang = readInitial();
const listeners = new Set();

function applyHtmlLang(lang) {
  try { document.documentElement.lang = lang; } catch (_) {}
}

applyHtmlLang(currentLang);

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!DICT[lang] || lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
  applyHtmlLang(lang);
  for (const l of listeners) {
    try { l(); } catch (_) {}
  }
}

function subscribe(cb) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Subscribe a React component to the active language. */
export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Translate a key; falls back to the RU dictionary and then the raw key. */
export function t(key, lang = currentLang) {
  return (DICT[lang] && DICT[lang][key])
    || DICT.ru[key]
    || key;
}
