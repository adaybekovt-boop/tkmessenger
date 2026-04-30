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

    'nav.chats':               'Чаты',
    'nav.drop':                'Drop',
    'nav.games':               'Игры',
    'nav.more':                'Ещё',
    'nav.aria':                'Навигация',

    'chats.title':             'Чаты',
    'chats.placeholder.id':    'Введите ID друга',
    'chats.add.aria':          'Добавить контакт',
    'chats.your.id':           'Твой ID',
    'chats.copy.id':           'Копировать ID',
    'chats.contacts':          'Контакты',
    'chats.contact.prefix':    'Контакт',
    'chats.empty':             'Контактов нет.',
    'chats.empty.hint':        'Введи ID друга выше, чтобы начать чат!',
    'chats.empty.placeholder': 'Выберите чат, чтобы начать переписку',
    'chats.refreshing':        'Обновляем…',
    'chats.release':           'Отпустить',
    'chats.connect.fail':      'Не удалось подключиться',

    'games.title':             'Игры',
    'games.subtitle':          'Мини-игры прямо в мессенджере',
    'games.players.1':         '1 игрок',
    'games.players.1_2':       '1–2 игрока',
    'games.players.2':         '2 игрока',
    'games.soon':              'Скоро',
    'games.how.title':         'Как это работает?',
    'games.how.body':          'Одиночные игры доступны сразу. Для игр на двоих нужно пригласить собеседника — ходы передаются напрямую между вашими устройствами.',
    'games.blockblast.subtitle': 'Фигуры на поле 8×8 · соло',
    'games.blackjack.title':   '21 очко',
    'games.blackjack.subtitle':'Blackjack · соло или с другом',
    'games.chess.title':       'Шахматы',
    'games.chess.subtitle':    'Полные правила · с собеседником',

    'drop.title':              'Orbits Drop',
    'drop.searching':          'Поиск устройств с Orbits Drop...',
    'drop.no_devices':         'Устройства не найдены',
    'drop.hint':               'Попросите получателя тоже открыть вкладку Drop',
    'drop.retry':              'Попробовать снова',

    'chess.solo':              'Игра на одном устройстве',
    'chess.solo.sub':          'Передавайте устройство по очереди',
    'chess.vs_ai':             'Игра с компьютером',
    'chess.vs_ai.sub':         'Вы играете белыми',
    'chess.online':            'Играть с другом',
    'chess.online.sub':        'Пригласить контакт по сети',
    'chess.start':             'Начать партию',
    'chess.turn.white':        'Ход белых',
    'chess.turn.black':        'Ход чёрных',
    'chess.check':             'Шах!',
    'chess.checkmate':         'Мат',
    'chess.stalemate':         'Пат — ничья',
    'chess.draw50':            'Ничья по правилу 50 ходов',
    'chess.win.white':         'Победа белых',
    'chess.win.black':         'Победа чёрных',
    'chess.resign':            'Сдаться',
    'chess.resign.confirm':    'Сдаться в этой партии?',
    'chess.new_game':          'Новая партия',
    'chess.exit':              'Выйти',
    'chess.promotion':         'Превращение пешки',
    'chess.captured':          'Взято',
    'chess.invite':            'Приглашение в шахматы',
    'chess.invite.send':       'Отправить приглашение',
    'chess.waiting':           'Ждём ответа собеседника…',
    'chess.declined':          'Приглашение отклонено',
    'chess.opponent_left':     'Соперник покинул игру',
    'chess.opponent_resigned': 'Соперник сдался',
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

    'nav.chats':               'Chats',
    'nav.drop':                'Drop',
    'nav.games':               'Games',
    'nav.more':                'More',
    'nav.aria':                'Navigation',

    'chats.title':             'Chats',
    'chats.placeholder.id':    "Enter your friend's ID",
    'chats.add.aria':          'Add contact',
    'chats.your.id':           'Your ID',
    'chats.copy.id':           'Copy ID',
    'chats.contacts':          'Contacts',
    'chats.contact.prefix':    'Contact',
    'chats.empty':             'No contacts yet.',
    'chats.empty.hint':        "Enter a friend's ID above to start a chat!",
    'chats.empty.placeholder': 'Pick a chat to start messaging',
    'chats.refreshing':        'Refreshing…',
    'chats.release':           'Release',
    'chats.connect.fail':      'Could not connect',

    'games.title':             'Games',
    'games.subtitle':          'Mini-games right in the messenger',
    'games.players.1':         '1 player',
    'games.players.1_2':       '1–2 players',
    'games.players.2':         '2 players',
    'games.soon':              'Soon',
    'games.how.title':         'How does it work?',
    'games.how.body':          'Single-player games are available right away. For two-player games, invite a partner — moves are sent directly between your devices.',
    'games.blockblast.subtitle': 'Shapes on an 8×8 board · solo',
    'games.blackjack.title':   'Blackjack 21',
    'games.blackjack.subtitle':'Blackjack · solo or with a friend',
    'games.chess.title':       'Chess',
    'games.chess.subtitle':    'Full rules · with a partner',

    'drop.title':              'Orbits Drop',
    'drop.searching':          'Looking for Orbits Drop devices...',
    'drop.no_devices':         'No devices found',
    'drop.hint':               'Ask the recipient to open the Drop tab too',
    'drop.retry':              'Try again',

    'chess.solo':              'Pass-and-play',
    'chess.solo.sub':          'Two players on one device',
    'chess.vs_ai':             'Play vs computer',
    'chess.vs_ai.sub':         'You play as White',
    'chess.online':            'Play with a friend',
    'chess.online.sub':        'Invite a contact over the network',
    'chess.start':             'Start game',
    'chess.turn.white':        "White to move",
    'chess.turn.black':        "Black to move",
    'chess.check':             'Check!',
    'chess.checkmate':         'Checkmate',
    'chess.stalemate':         'Stalemate — draw',
    'chess.draw50':            '50-move rule — draw',
    'chess.win.white':         'White wins',
    'chess.win.black':         'Black wins',
    'chess.resign':            'Resign',
    'chess.resign.confirm':    'Resign this game?',
    'chess.new_game':          'New game',
    'chess.exit':              'Exit',
    'chess.promotion':         'Pawn promotion',
    'chess.captured':          'Captured',
    'chess.invite':            'Chess invitation',
    'chess.invite.send':       'Send invitation',
    'chess.waiting':           'Waiting for opponent…',
    'chess.declined':          'Invitation declined',
    'chess.opponent_left':     'Opponent left the game',
    'chess.opponent_resigned': 'Opponent resigned',
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

    'nav.chats':               'Чаттар',
    'nav.drop':                'Drop',
    'nav.games':               'Ойындар',
    'nav.more':                'Тағы',
    'nav.aria':                'Навигация',

    'chats.title':             'Чаттар',
    'chats.placeholder.id':    'Дос ID-сін енгізіңіз',
    'chats.add.aria':          'Контакт қосу',
    'chats.your.id':           'Сіздің ID',
    'chats.copy.id':           'ID-ні көшіру',
    'chats.contacts':          'Контактілер',
    'chats.contact.prefix':    'Контакт',
    'chats.empty':             'Контакттар жоқ.',
    'chats.empty.hint':        'Чат бастау үшін жоғарыда дос ID-сін енгізіңіз!',
    'chats.empty.placeholder': 'Жазысуды бастау үшін чат таңдаңыз',
    'chats.refreshing':        'Жаңартылуда…',
    'chats.release':           'Жіберіңіз',
    'chats.connect.fail':      'Қосылу мүмкін болмады',

    'games.title':             'Ойындар',
    'games.subtitle':          'Мессенджердегі мини-ойындар',
    'games.players.1':         '1 ойыншы',
    'games.players.1_2':       '1–2 ойыншы',
    'games.players.2':         '2 ойыншы',
    'games.soon':              'Жақында',
    'games.how.title':         'Бұл қалай жұмыс істейді?',
    'games.how.body':          'Жалғыз ойнайтын ойындар бірден қолжетімді. Екеу ойнау үшін серіктесті шақыру керек — қадамдар құрылғылар арасында тікелей жіберіледі.',
    'games.blockblast.subtitle': '8×8 алаңындағы фигуралар · жалғыз',
    'games.blackjack.title':   '21 ұпай',
    'games.blackjack.subtitle':'Blackjack · жалғыз немесе доспен',
    'games.chess.title':       'Шахмат',
    'games.chess.subtitle':    'Толық ережелер · серіктеспен',

    'drop.title':              'Orbits Drop',
    'drop.searching':          'Orbits Drop құрылғыларын іздеу...',
    'drop.no_devices':         'Құрылғы табылмады',
    'drop.hint':               'Қабылдаушыдан Drop қойындысын ашуын сұраңыз',
    'drop.retry':              'Қайта көру',

    'chess.solo':              'Бір құрылғыда ойнау',
    'chess.solo.sub':          'Құрылғыны кезекпен беріңіздер',
    'chess.vs_ai':             'Компьютермен ойнау',
    'chess.vs_ai.sub':         'Сіз ақпен ойнайсыз',
    'chess.online':            'Доспен ойнау',
    'chess.online.sub':        'Контактіні желі арқылы шақыру',
    'chess.start':             'Партияны бастау',
    'chess.turn.white':        'Ақтың жүрісі',
    'chess.turn.black':        'Қараның жүрісі',
    'chess.check':             'Шах!',
    'chess.checkmate':         'Мат',
    'chess.stalemate':         'Пат — тең ойын',
    'chess.draw50':            '50 жүріс ережесі — тең ойын',
    'chess.win.white':         'Ақтың жеңісі',
    'chess.win.black':         'Қараның жеңісі',
    'chess.resign':            'Берілу',
    'chess.resign.confirm':    'Бұл партияда берілесіз бе?',
    'chess.new_game':          'Жаңа партия',
    'chess.exit':              'Шығу',
    'chess.promotion':         'Пешканың түрленуі',
    'chess.captured':          'Алынды',
    'chess.invite':            'Шахматқа шақыру',
    'chess.invite.send':       'Шақыру жіберу',
    'chess.waiting':           'Қарсыластың жауабын күтудеміз…',
    'chess.declined':          'Шақыру қабылданбады',
    'chess.opponent_left':     'Қарсылас ойыннан шықты',
    'chess.opponent_resigned': 'Қарсылас берілді',
  },
};

function readInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && DICT[raw]) return raw;
  } catch (_) {}
  // Fall back to the browser's preferred language, clamped to something we
  // actually support. For unsupported languages we default to English so
  // an international audience gets a readable UI out of the box.
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  const head = String(nav).toLowerCase().split(/[-_]/)[0];
  if (DICT[head]) return head;
  return 'en';
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
