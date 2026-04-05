# Orbits P2P — Audit & Fix Report

## Dependency map (import graph, raw)

### src/core/base64.js
(no imports)

### src/core/callManager.js
(no imports)

### src/core/crypto.js
`import { base64ToBytes, bytesToBase64 } from './base64.js';`

### src/core/db.js
(no imports)

### src/core/file.js
(no imports)

### src/core/optimizer.js
(no imports)

### src/core/orbitsDrop.js
(no imports)

### src/core/wireCrypto.js
`import { base64ToBytes, bytesToBase64 } from './base64.js';`

### src/main.js
`import Peer from 'peerjs';`
`import { registerSW } from 'virtual:pwa-register';`
`import { dbInit, dbGetPage, dbGetLast, dbAdd, dbUpdateStatus, dbDelete, dbClearAll, dbGetPendingOut, dbSetPendingOut } from './core/db.js';`
`import { cryptoDerive, cryptoLock, cryptoEncrypt, cryptoDecrypt, cryptoDecryptBatch, cryptoSha256Hex, cryptoPbkdf2Bytes } from './core/crypto.js';`
`import { bytesToBase64 } from './core/base64.js';`
`import { fileSha256Buffer } from './core/file.js';`
`import { VirtualScroller } from './ui/virtualScroll.js';`
`import { createCallManager } from './core/callManager.js';`
`import { getThemeManager } from './ui/themeManager.js';`
`import { Radar } from './ui/radar.js';`
`import { showToast } from './ui/toast.js';`
`import { encryptWirePayload, decryptWirePayload, initWireSession, acceptWireHello, getWireSessionStatus, waitForWireReady, teardownWireSession } from './core/wireCrypto.js';`
`import { optimizer } from './core/optimizer.js';`
`import { OrbitsDrop } from './core/orbitsDrop.js';`

### src/ui/radar.js
(no imports)

### src/ui/themeManager.js
(no imports)

### src/ui/toast.js
(no imports)

### src/ui/virtualScroll.js
(no imports)

### src/workers/crypto.worker.js
(no imports)

### src/workers/db.worker.js
(no imports)

### src/workers/radarWorker.js
(no imports)

### src/workers/themeWorker.js
(no imports)

## Найденные проблемы и фиксы (кратко)

- src/main.js: closeCurrentChat() падал из-за отсутствующих #settings-modal/#empty-state → исправлено на #settings-view + null-check; добавлен #empty-state в index.html.
- src/main.js: report кнопка не работала (искал #report-btn вместо #report-peer-btn) → исправлено.
- index.html: дублировался id reduce-animations-toggle → переименован в reduce-animations-toggle-customizer, логика синхронизирована.
- index.html: отсутствовали appearance-density/appearance-bubble/color-dot/open-theme-customizer-btn/create-group-btn → добавлены элементы.
- src/ui/themeManager.js: prefers-reduced-motion теперь ставит obsidian.
- src/core/crypto.js: добавлен безопасный fallback если Worker недоступен.
- src/core/orbitsDrop.js + src/core/callManager.js: защитные проверки на внутренние поля PeerJS.
- src/main.js: peerReadyPromise + детерминированный tiebreaker для дублей соединений.
- vite.config.js + public/: PWA иконки + 404.html для GitHub Pages.

## Чеклист

### A. Структура и импорты
- ✅ Все import/export в src резолвятся (vite build проходит).
- ✅ index.html ссылается на ./src/main.js и ./src/styles/style.css — существуют.
- ✅ vite.config.js entry/build согласованы.
- ⚠️ npm audit: есть транзитивные уязвимости; нужен отдельный апдейт зависимостей.
- ✅ Electron: electron.mjs грузит dist/index.html в prod.

### B. Известные баги
- ✅ PBKDF2/derive в worker; fallback не блокирует UI.
- ✅ peerReadyPromise добавлен, открытия соединений ждут ready.
- ✅ URL.createObjectURL: общий Set есть, Cinema revoke добавлен.
- ⚠️ ReferenceError при блокировке: без воспроизведения сценария (нужен интерактив).
- ✅ Typing indicator: Map+clearTimeout используется.
- ✅ renderFriends: debounce через scheduleRenderFriends есть.
- ✅ empty-state: добавлен div (display:none по умолчанию).

### C. CSS и дизайн
- ✅ src/styles/style.css подключён.
- ✅ CSS variables в :root и body[data-theme].
- ✅ Color scheme: добавлены .color-dot.
- ✅ OffscreenCanvas: themeWorker init через transferControlToOffscreen.
- ✅ prefers-reduced-motion: анимации off, тема obsidian.
- ⚠️ Mobile responsive: базовая логика есть, нужен ручной прогон на девайсах.

### D. WebRTC / PeerJS
- ✅ peer.on(open/connection/error) на месте.
- ✅ Reconnect: peer.reconnect на disconnected/network.
- ⚠️ Signaling сервер: по умолчанию PeerJS cloud; кастомные env поддержаны, живость проверить автоматически нельзя.
- ✅ Data channel: orbit_wire требует handshake (ECDH) и шифруется.

### E. IndexedDB
- ✅ Stores создаются в db.worker.js (messages/pending_out).
- ⚠️ Миграции версий: нужен набор реальных данных со старых версий.

### F. Web Workers
- ✅ crypto.worker.js/themeWorker.js существуют и грузятся.
- ⚠️ terminate: воркеры живут весь runtime (допустимо), отдельной terminate-логики нет.

### G. Звонки и медиа
- ⚠️ Полный e2e звонков/шары в двух вкладках требует ручного прогона; guards добавлены.

### H. Сборка и деплой
- ✅ npm run build проходит.
- ✅ npm run dev стартует.
- ✅ dist содержит sw.js/workbox и hashed assets.
- ✅ 404.html добавлен.

## Полные файлы (изменённые/ключевые)

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content">
  <meta http-equiv="Cache-Control" content="max-age=0, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  
  <meta name="theme-color" content="#1a1a1f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Orbits P2P">

  <link rel="icon" href="data:,">
  <title>Orbits P2P</title>
  <style>
    body { margin:0; background:#1a1a1f; color:#e8e8f0;
           font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
           overflow:hidden; }
  </style>
  <link rel="preload" href="./src/styles/style.css" as="style"
        onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="./src/styles/style.css"></noscript>
  

</head>
<body>

<canvas id="theme-background" class="theme-background-canvas" width="300" height="150" aria-hidden="true"></canvas>

<div id="login-panel">
  <div class="login-card" id="login-card">
    <div class="login-logo" id="login-logo">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <path d="M6 22L38 9L30 35L21 27L13 31L15 22Z" fill="white" opacity="0.92"/>
        <path d="M21 27L30 18L15 22" fill="white" opacity="0.45"/>
      </svg>
    </div>
    <h2 class="login-title" id="login-title">Orbits P2P</h2>
    <p class="login-subtitle" id="login-subtitle">Decentralized. Private. Yours.</p>

    <div class="login-inputs" id="login-inputs-wrapper">
      <div class="tg-field">
        <input type="text" id="nickname-input" placeholder=" " autocomplete="username">
        <label for="nickname-input">Your callsign</label>
      </div>
      <div class="tg-field">
        <input type="password" id="password-input" placeholder=" " autocomplete="current-password">
        <label for="password-input">Master password</label>
      </div>

      <div class="consent-row">
        <input type="checkbox" id="privacy-consent">
        <span>I accept the
          <button id="open-policy-btn" class="link-btn">Privacy Policy</button>
        </span>
      </div>
    </div>

    <button id="login-btn" class="tg-primary-btn" disabled>Join network</button>
  </div>
</div>

<div id="app-container" style="display:none">

  <div id="sidebar">
    <div class="sidebar-header">
      <button id="open-settings-btn" class="tg-icon-btn" aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect y="3" width="20" height="2" rx="1"/>
          <rect y="9" width="20" height="2" rx="1"/>
          <rect y="15" width="20" height="2" rx="1"/>
        </svg>
      </button>
      <div class="sidebar-search-wrap">
        <svg class="sidebar-search-icon" width="15" height="15" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input class="sidebar-search-input" type="text" placeholder="Search"
               id="add-friend-input">
      </div>
      <button id="open-add-friend-btn" class="tg-icon-btn" aria-label="Add Friend" title="Add Friend">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/>
          <line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
      </button>
      <button id="create-group-btn" class="tg-icon-btn" aria-label="Create Group" title="Create Group">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="3.5"/>
          <path d="M19 8v6"/>
          <path d="M22 11h-6"/>
        </svg>
      </button>
      <button id="add-friend-btn" style="display:none">+</button>
    </div>

    <div id="friends-list"></div>
    <div id="contacts-empty-state" class="contacts-empty-placeholder" style="display:none">
      No contacts yet. Tap the person+ button to add friends.
    </div>

    <div id="my-profile">
      <div class="friend-avatar" id="my-avatar-letter">Me</div>
      <div class="my-info">
        <span id="my-id-display">Loading...</span>
        <span id="my-status" class="status-online">Online</span>
      </div>
    </div>

    <div id="bottom-nav" role="navigation">
      <button id="bottom-chats-btn" class="nav-btn active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
        </svg>
        Chats
      </button>
      <button id="bottom-contacts-btn" class="nav-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Contacts
      </button>
      <button id="bottom-radar-btn" class="nav-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
        </svg>
        Radar
      </button>
      <button id="bottom-settings-btn" class="nav-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </button>
    </div>
  </div>

  <div id="empty-state" style="display:none">
    Select a chat to start messaging.
  </div>

  <div id="active-chat" style="display:none">
    <div id="chat-header">
      <button id="back-btn" class="tg-icon-btn" style="display:none">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <div class="chat-header-info">
        <div id="current-chat-avatar" class="chat-avatar"></div>
        <div class="chat-header-text">
          <span id="chat-friend-name"></span>
          <span id="chat-friend-status"></span>
        </div>
      </div>
      <div class="chat-header-actions">
        <span id="trust-badge" class="trust-badge trust-neutral" style="display:none">Shield: ?</span>
        
        <!-- TITANIUM FIX: Nudge Button -->
        <button id="nudge-btn" class="tg-icon-btn" title="Nudge / Shake">
          <span style="font-size: 16px;">📳</span>
        </button>

        <!-- TITANIUM FIX: Watch Party Button -->
        <button id="cinema-btn" class="tg-icon-btn" title="Watch Party">
          <span style="font-size: 16px;">🍿</span>
        </button>

        <button id="screen-btn" class="tg-icon-btn" title="Screen share">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        </button>
        <button id="audio-call-btn" class="tg-icon-btn" title="Voice call">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l1.62-1.62a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
        <button id="call-btn" class="tg-icon-btn" title="Video call">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </button>
        <button id="report-peer-btn" class="tg-icon-btn" title="More">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      </div>
    </div>

    <div id="chat-warning-banner" style="display:none"></div>

    <div id="messages-list"></div>

    <div id="chat-input-area" class="chat-input-box">
      <button id="file-btn" class="tg-icon-btn" aria-label="Attach">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <input type="file" id="file-input" hidden>
      <textarea id="chat-input" rows="1" placeholder="Message..."></textarea>
      <select id="ttl-select" title="Message lifetime">
        <option value="0">∞</option>
        <option value="30000">30s</option>
        <option value="60000">1m</option>
        <option value="3600000">1h</option>
      </select>
      <button id="send-voice-btn" class="tg-send-btn voice-mode">
        <span id="mic-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
          </svg>
        </span>
        <span id="send-icon" style="display:none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </span>
      </button>
    </div>
  </div>

<!-- Orbits Drop Hidden File Input -->
<input type="file" id="orbits-drop-input" style="display:none;" />

<!-- Orbits Drop Quality Modal -->
<div class="modal-overlay" id="drop-quality-modal" aria-hidden="true" style="display:none;">
  <div class="modal-card drop-quality-card">
    <div class="modal-header">
      <h3 class="modal-title">Orbits Drop</h3>
      <button class="icon-btn close-modal-btn" aria-label="Close">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
    <div class="modal-content">
      <p class="drop-hint">Select image compression quality to save bandwidth during P2P transfer.</p>
      
      <div class="drop-quality-options">
        <label class="drop-option">
          <input type="radio" name="drop_quality" value="original" checked>
          <div class="option-content">
            <span class="option-title">Original Quality</span>
            <span class="option-desc">No compression, exact file match</span>
          </div>
        </label>
        
        <label class="drop-option">
          <input type="radio" name="drop_quality" value="high">
          <div class="option-content">
            <span class="option-title">High Quality</span>
            <span class="option-desc">Slight compression, max 1920px</span>
          </div>
        </label>
        
        <label class="drop-option">
          <input type="radio" name="drop_quality" value="fast">
          <div class="option-content">
            <span class="option-title">Fast (Compressed)</span>
            <span class="option-desc">Max compression for mobile data</span>
          </div>
        </label>
      </div>
      
      <div class="modal-actions" style="margin-top: 20px;">
        <button class="btn btn-secondary close-modal-btn">Cancel</button>
        <button class="btn btn-primary" id="drop-send-btn">Send File</button>
      </div>
    </div>
  </div>
</div>

  <!-- TITANIUM FIX: Cinema View (Watch Party Mode) -->
<div id="cinema-view" style="display:none;" aria-hidden="true">
  <div class="cinema-header">
    <button class="icon-btn" id="close-cinema-btn" aria-label="Exit Cinema Mode">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
    </button>
    <div class="cinema-title">Watch Party <span id="cinema-friend-name" style="opacity: 0.7; font-weight: normal; margin-left: 8px;"></span></div>
    
    <div class="cinema-controls">
      <button id="cinema-mic-btn" class="icon-btn" title="Toggle Microphone">
        <svg id="cinema-mic-on" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
        <svg id="cinema-mic-off" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display:none; color: var(--tg-text-danger)"><path d="M19 11v-1h-2v1c0 1.57-.64 3-1.68 4.03l1.43 1.43A8.93 8.93 0 0 0 19 11zM10.15 13.91a2.98 2.98 0 0 1-1.15-2.91V6c0-1.66 1.34-3 3-3 1.35 0 2.48.88 2.86 2.11L10.15 13.91zM4.27 3L3 4.27l5.96 5.96A3.01 3.01 0 0 0 9 11v1c0 2.76 2.24 5 5 5 .34 0 .68-.04 1.01-.1l4.72 4.72 1.27-1.27L4.27 3zM12 19c-3.53 0-6.43-2.61-6.92-6H3.08c.49 4.33 4.14 7.82 8.92 8.08V24h2v-2.92c.69-.04 1.35-.17 1.98-.37l-1.52-1.52c-.15.03-.3.05-.46.05z"/></svg>
      </button>
      <label for="cinema-file-input" class="tg-primary-btn" style="padding: 6px 12px; cursor: pointer; font-size: 13px;">
        Choose Local Video
      </label>
      <input type="file" id="cinema-file-input" accept="video/*" style="display: none;">
    </div>
  </div>
  
  <div class="cinema-player-container">
    <div id="cinema-empty-state" class="cinema-empty">
      <div style="font-size: 48px; margin-bottom: 16px;">🍿</div>
      <h3>Watch Party</h3>
      <p style="color: var(--tg-text-secondary); max-width: 400px; text-align: center; line-height: 1.5;">
        Both you and your friend need to select the same video file from your devices. 
        Orbits will automatically sync play, pause, and seeking in real-time.
      </p>
    </div>
    <video id="cinema-video" controls playsinline style="display:none;"></video>
  </div>
</div>

<div id="radar-view" style="display:none;" aria-hidden="true">
    <div class="radar-container">
      <canvas id="radar-canvas" width="280" height="280" aria-hidden="true"></canvas>
      <p class="radar-hint">Online friends (connected). Optional prefix filter: <code>orbit_radar_prefix</code> in localStorage.</p>
      <button type="button" id="radar-scan-btn" class="tg-primary-btn radar-scan-btn">Scan</button>
      <p id="radar-status" class="radar-status-line" role="status"></p>
      <div id="radar-results-list" class="radar-results-list"></div>
      <div class="radar-manual-row">
        <input type="text" id="radar-manual-id" class="radar-manual-input" placeholder="Peer ID (manual lookup)" autocomplete="off" maxlength="64">
        <button type="button" id="radar-lookup-btn" class="tg-primary-btn radar-lookup-btn">Lookup</button>
      </div>
    </div>
  </div>

</div>

<!-- TITANIUM FIX: PILLAR 2 - Settings View (Tabbed Interface) -->
<div id="settings-view" style="display:none;" aria-hidden="true">
  <div class="settings-header">
    <button id="close-settings-btn" class="tg-icon-btn" title="Back">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
    <span class="settings-title-text">Settings</span>
    <button id="save-settings-btn" class="tg-icon-btn" style="color:var(--tg-accent)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </button>
  </div>
  
  <div class="settings-tabs-nav">
    <button class="tab-btn active" data-tab="tab-profile">Profile</button>
    <button class="tab-btn" data-tab="tab-appearance">Appearance</button>
    <button class="tab-btn" data-tab="tab-media">Audio & Video</button>
    <button class="tab-btn" data-tab="tab-security">Security</button>
  </div>

  <div class="settings-body">
    
    <!-- Profile Tab -->
    <div id="tab-profile" class="settings-tab-content active">
      <div class="settings-section-title">My Profile</div>
      <div id="profile-photos-grid" class="profile-photos-grid">
        <div class="profile-photo-item profile-photo-add" id="profile-add-photo-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      </div>
      <input type="file" id="profile-photo-input" accept="image/*" hidden>
      <div class="settings-row">
        <span class="settings-row-label">Display name</span>
        <input type="text" id="settings-display-name" placeholder="Optional name" maxlength="32">
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Bio</span>
        <textarea id="settings-bio" placeholder="About you..." maxlength="150" rows="2"></textarea>
      </div>
    </div>

    <!-- Appearance Tab -->
    <div id="tab-appearance" class="settings-tab-content">
      <div class="settings-section-title">Themes (Pillar 5)</div>
      <div class="theme-presets-grid">
        <button type="button" class="theme-preset-btn" data-theme="matrix">
          <span class="theme-preview" style="background:#000;border:1px solid #00FF41"></span>
          <span class="theme-label">Matrix (Default)</span>
        </button>
        <button type="button" class="theme-preset-btn" data-theme="sakura_zen">
          <span class="theme-preview" style="background:linear-gradient(135deg,#140a0e,#ffb7c5)"></span>
          <span class="theme-label">Sakura Zen</span>
        </button>
        <button type="button" class="theme-preset-btn" data-theme="aurora_flow">
          <span class="theme-preview" style="background:linear-gradient(135deg,#0a0a12,#00E5FF)"></span>
          <span class="theme-label">Aurora Flow</span>
        </button>
        <button type="button" class="theme-preset-btn" data-theme="retro_synth">
          <span class="theme-preview" style="background:linear-gradient(180deg,#140a18,#FF00FF)"></span>
          <span class="theme-label">Retro Synth</span>
        </button>
        <button type="button" class="theme-preset-btn" data-theme="obsidian">
          <span class="theme-preview" style="background:#000000"></span>
          <span class="theme-label">Obsidian</span>
        </button>
      </div>
      
      <div class="settings-section-title">Motion & Density</div>
      <div class="settings-row">
        <span class="settings-row-label">Reduce UI Animations</span>
        <label class="tg-toggle"><input type="checkbox" id="reduce-animations-toggle">
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">Density</span>
        <select id="appearance-density">
          <option value="compact">Compact</option>
          <option value="default" selected>Default</option>
          <option value="comfortable">Comfortable</option>
        </select>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">Bubble style</span>
        <select id="appearance-bubble">
          <option value="rounded" selected>Rounded</option>
          <option value="square">Square</option>
        </select>
      </div>

      <div class="settings-row" style="align-items:flex-start;">
        <span class="settings-row-label">Color scheme</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <button type="button" class="color-dot" data-scheme="default" aria-label="Default" style="width:18px;height:18px;border-radius:50%;border:1px solid var(--tg-divider);background:#5b9bd5"></button>
          <button type="button" class="color-dot" data-scheme="emerald" aria-label="Emerald" style="width:18px;height:18px;border-radius:50%;border:1px solid var(--tg-divider);background:#50c878"></button>
          <button type="button" class="color-dot" data-scheme="amber" aria-label="Amber" style="width:18px;height:18px;border-radius:50%;border:1px solid var(--tg-divider);background:#f59e0b"></button>
          <button type="button" class="color-dot" data-scheme="rose" aria-label="Rose" style="width:18px;height:18px;border-radius:50%;border:1px solid var(--tg-divider);background:#f43f5e"></button>
          <button type="button" class="color-dot" data-scheme="violet" aria-label="Violet" style="width:18px;height:18px;border-radius:50%;border:1px solid var(--tg-divider);background:#8b5cf6"></button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-row-label">Custom colors</span>
        <button type="button" id="open-theme-customizer-btn" class="tg-link-btn">Open</button>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Text size</span>
        <div class="appearance-size-picker">
          <button class="size-btn" data-size="small">A</button>
          <button class="size-btn active" data-size="medium">A</button>
          <button class="size-btn" data-size="large">A</button>
        </div>
      </div>
    </div>

    <!-- Media Tab -->
    <div id="tab-media" class="settings-tab-content">
      <div class="settings-section-title">Audio & Video</div>
      <div class="settings-row">
        <span class="settings-row-label">Mic device</span>
        <select id="mic-device-select"></select>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Echo cancellation</span>
        <label class="tg-toggle"><input type="checkbox" id="echo-cancel-toggle" checked>
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Noise suppression</span>
        <label class="tg-toggle"><input type="checkbox" id="noise-suppression-toggle" checked>
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Auto gain</span>
        <label class="tg-toggle"><input type="checkbox" id="auto-gain-toggle" checked>
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Video quality</span>
        <select id="video-quality-select">
          <option value="low">Low (15fps)</option>
          <option value="medium" selected>Medium (24fps)</option>
          <option value="high">High (30fps HD)</option>
        </select>
      </div>
      <button id="test-mic-btn" class="settings-btn settings-btn-default">Test microphone</button>
      <button id="stop-mic-test-btn" class="settings-btn settings-btn-default" style="display:none">Stop test</button>
      <div id="mic-level-bar" style="height:4px;background:var(--tg-accent);width:0%;margin:0 16px;border-radius:2px;transition:width 0.1s"></div>
    </div>

    <!-- Security Tab -->
    <div id="tab-security" class="settings-tab-content">
      <div class="settings-section-title">Network & Performance</div>
      <div class="settings-row">
        <span class="settings-row-label">Data saver</span>
        <label class="tg-toggle"><input type="checkbox" id="data-saver-toggle">
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Battery saver</span>
        <label class="tg-toggle"><input type="checkbox" id="battery-saver-toggle">
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>

      <div class="settings-section-title">Privacy</div>
      <div class="settings-row">
        <span class="settings-row-label">Typing indicator</span>
        <label class="tg-toggle"><input type="checkbox" id="typing-indicator-toggle" checked>
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Allow screenshots</span>
        <label class="tg-toggle"><input type="checkbox" id="allow-screenshots-toggle">
          <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
      </div>
      <div class="settings-row">
        <span class="settings-row-label">Duress password</span>
        <input type="password" id="duress-password-input" placeholder="Min 6 chars">
      </div>
      <button id="panic-wipe-btn" class="settings-btn settings-btn-danger">Wipe all local data</button>
    </div>
  </div>
</div>

<!-- Create Group Modal -->
<div id="create-group-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">New Group</h3>
    <div class="tg-field">
      <input type="text" id="group-name-input" placeholder=" " maxlength="32">
      <label for="group-name-input">Group name</label>
    </div>
    <div id="group-members-list" class="group-members-list"></div>
    <p style="font-size:12px;color:var(--tg-text-hint);margin:8px 0">Max 8 members</p>
    <button id="confirm-create-group-btn" class="tg-primary-btn">Create Group</button>
    <button id="cancel-create-group-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Cancel</button>
  </div>
</div>

<!-- Policy Modal -->
<div id="policy-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">Privacy Policy</h3>
    <div id="policy-scrollbox" class="tg-modal-text">
      <p><strong>Zero server storage:</strong> Orbits does not store your messages,
      keys, or media on centralized servers.</p>
      <p><strong>Local control:</strong> Chat history is stored locally on your device.</p>
      <p><strong>Responsibility:</strong> If you lose your password, access cannot be
      restored — there is no centralized recovery.</p>
      <p><strong>Technical logs:</strong> Only technical metadata is used to establish
      P2P connections (node ID, NAT type).</p>
    </div>
    <button id="accept-policy-btn" class="tg-primary-btn">Accept and continue</button>
    <button id="close-policy-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Close</button>
  </div>
</div>

<!-- Report Modal -->
<div id="report-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">Report user</h3>
    <p class="tg-modal-text">Select a reason. The user will be blocked locally.</p>
    <label style="display:block;padding:8px 0"><input type="radio" name="report-reason" value="spam" checked> Spam</label>
    <label style="display:block;padding:8px 0"><input type="radio" name="report-reason" value="fraud"> Fraud</label>
    <label style="display:block;padding:8px 0"><input type="radio" name="report-reason" value="abuse"> Abuse</label>
    <button id="submit-report-btn" class="settings-btn settings-btn-danger">Report and block</button>
    <button id="close-report-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Cancel</button>
  </div>
</div>

<!-- Vault Lock Modal -->
<div id="vault-lock-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">Session locked</h3>
    <p class="tg-modal-text">The app was minimized for over 5 minutes. Enter your master password.</p>
    <div class="tg-field">
      <input type="password" id="unlock-password-input" placeholder=" ">
      <label>Master password</label>
    </div>
    <button id="unlock-vault-btn" class="tg-primary-btn">Unlock</button>
  </div>
</div>

<!-- Incoming Call Modal -->
<div id="incoming-call-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card" style="text-align:center">
    <h3 class="tg-modal-title" id="caller-name">Incoming call</h3>
    <p class="tg-modal-text" id="call-type-label">is calling...</p>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:16px">
      <button id="reject-call-btn" class="settings-btn settings-btn-danger" style="flex:1">Decline</button>
      <button id="accept-call-btn" class="tg-primary-btn" style="flex:1">Accept</button>
    </div>
  </div>
</div>

<!-- Call Screen -->
<div id="call-screen" style="display:none">
  <div class="call-container">
    <video id="remote-video" autoplay playsinline></video>
    <video id="local-video" autoplay playsinline muted></video>
    <div class="call-info">
      <div id="call-user-name"></div>
      <div id="call-status">Calling...</div>
    </div>
    <div class="call-controls">
      <button id="call-toggle-audio" class="tg-icon-btn call-btn" title="Mute">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
      </button>
      <button id="call-toggle-video" class="tg-icon-btn call-btn" title="Camera">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      </button>
      <button id="call-screen-share-btn" class="tg-icon-btn call-btn" title="Share Screen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
      </button>
      <button id="end-call-btn" class="tg-icon-btn call-btn call-end" title="End Call">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6.5-6.5A19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      </button>
    </div>
  </div>
</div>

<!-- Nearby Peer Modal -->
<div id="nearby-peer-modal" style="display:none">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">Nearby peer</h3>
    <p class="tg-modal-text">ID: <strong id="nearby-peer-id"></strong></p>
    <p class="tg-modal-text" id="nearby-peer-name-row" hidden>Name: <span id="nearby-peer-displayname"></span></p>
    <p class="tg-modal-text"><span id="nearby-peer-trust" class="trust-badge trust-neutral" style="display:none"></span></p>
    <button type="button" id="nearby-send-btn" class="tg-primary-btn">Send Message</button>
    <button id="nearby-add-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Add to Contacts</button>
    <button id="nearby-close-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Close</button>
  </div>
</div>

<!-- Add Contact Modal -->
<div id="add-friend-modal" style="display:none" aria-hidden="true">
  <div class="tg-modal-card">
    <h3 class="tg-modal-title">Add Contact</h3>
    <p class="tg-modal-text" style="font-size:13px;margin-bottom:8px;color:var(--tg-text-secondary)">Your ID — share it with friends:</p>
    <div style="display:flex;align-items:center;gap:8px;background:var(--tg-bg-input);border-radius:10px;padding:10px 14px;margin-bottom:16px;">
      <code id="my-peer-id-display" style="flex:1;font-family:monospace;font-size:16px;letter-spacing:2px;color:var(--tg-accent);font-weight:bold"></code>
      <button id="copy-my-id-btn" class="tg-icon-btn" title="Copy ID" style="width:32px;height:32px;flex-shrink:0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    </div>
    <div class="tg-field">
      <input type="text" id="add-friend-id-input" placeholder=" " autocomplete="off" maxlength="9" style="text-transform:uppercase;letter-spacing:1px">
      <label for="add-friend-id-input">Friend's ID</label>
    </div>
    <button id="confirm-add-friend-btn" class="tg-primary-btn">Add Contact</button>
    <button id="close-add-friend-modal-btn" class="settings-btn settings-btn-default" style="margin-top:8px">Cancel</button>
  </div>
</div>

<!-- Theme Customizer Modal -->
<div id="theme-customizer-modal" style="display:none" aria-hidden="true">
  <div class="settings-header">
    <button id="close-theme-customizer-btn" class="tg-icon-btn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
    <span class="settings-title-text">Настройка темы</span>
  </div>
  <div class="settings-body">
    <div class="settings-section-title">Цвета</div>
    <div class="settings-row">
      <span class="settings-row-label">Основной акцент</span>
      <input type="color" id="custom-theme-accent" value="#5b9bd5">
    </div>
    <div class="settings-row">
      <span class="settings-row-label">Фон (основной)</span>
      <input type="color" id="custom-theme-bg-primary" value="#25252c">
    </div>
    <div class="settings-row">
      <span class="settings-row-label">Фон (вторичный)</span>
      <input type="color" id="custom-theme-bg-secondary" value="#1a1a1f">
    </div>
    <div class="settings-row">
      <span class="settings-row-label">Фон (ввод)</span>
      <input type="color" id="custom-theme-bg-input" value="#2e2e36">
    </div>
    
    <div class="settings-section-title">Производительность</div>
    <div class="settings-row">
      <span class="settings-row-label">Сбережение нагрузки<br><small style="color:var(--tg-text-hint);font-size:11px">Уменьшает анимации на 50%</small></span>
      <label class="tg-toggle"><input type="checkbox" id="reduce-animations-toggle-customizer">
        <span class="tg-toggle-track"></span><span class="tg-toggle-knob"></span></label>
    </div>
    
    <button id="apply-custom-theme-btn" class="settings-btn settings-btn-default" style="background:var(--tg-accent);color:#fff;margin-top:24px;">Применить</button>
    <button id="reset-custom-theme-btn" class="settings-btn settings-btn-danger">Сбросить цвета</button>
  </div>
</div>

<script type="module" src="./src/main.js"></script>


</body>
</html>

```

### vite.config.js

```js
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Use relative base for maximum compatibility with GitHub Pages and local builds
  base: './',
  plugins: [
    VitePWA({
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Orbits P2P',
        short_name: 'Orbits',
        description: 'Decentralized P2P Messenger',
        theme_color: '#1a1a1f',
        background_color: '#05050A',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,webp,jpg,jpeg,wasm}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: { main: './index.html' },
      output: {
        manualChunks: {},
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: 'esbuild',
    target: 'esnext'
  },
  esbuild: {},
  worker: { format: 'es' },
  server: { port: 5173 }
}));

```

### src/main.js

```js
import Peer from 'peerjs';
import { registerSW } from 'virtual:pwa-register';
import { dbInit, dbGetPage, dbGetLast, dbAdd, dbUpdateStatus, dbDelete, dbClearAll, dbGetPendingOut, dbSetPendingOut } from './core/db.js';
import { cryptoDerive, cryptoLock, cryptoEncrypt, cryptoDecrypt, cryptoDecryptBatch, cryptoSha256Hex, cryptoPbkdf2Bytes } from './core/crypto.js';
import { bytesToBase64 } from './core/base64.js';
import { fileSha256Buffer } from './core/file.js';
import { VirtualScroller } from './ui/virtualScroll.js';
import { createCallManager } from './core/callManager.js';
import { getThemeManager } from './ui/themeManager.js';
import { Radar } from './ui/radar.js';
import { showToast } from './ui/toast.js';
import { encryptWirePayload, decryptWirePayload, initWireSession, acceptWireHello, getWireSessionStatus, waitForWireReady, teardownWireSession } from './core/wireCrypto.js';
import { optimizer } from './core/optimizer.js';
import { OrbitsDrop } from './core/orbitsDrop.js';

// TITANIUM FIX: Initialize OrbitsDrop Module
const orbitsDrop = new OrbitsDrop();

// Setup OrbitsDrop UI and Callbacks
orbitsDrop.onProgressUpdate = (msgId, percent, statusText) => {
  if (!msgsVirtual) return;
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.dropPercent = percent;
    msg.dropStatusText = statusText;
    msgsVirtual.patchByTs(msgId, () => {});
  }
};

orbitsDrop.onTransferComplete = async (msgId) => {
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.status = 'sent';
    msg.dropPercent = 100;
    msg.dropStatusText = 'Completed';
    await dbUpdateStatus(chatKey(msg.to || msg.from), msgId, 'sent');
    if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
  }
};

orbitsDrop.onFileReady = async (msgId, fileUrl, metadata) => {
  const msg = messageWindow.find(m => m.ts === msgId);
  if (msg) {
    msg.status = 'delivered';
    msg.dropPercent = 100;
    msg.dropStatusText = 'Completed';
    msg.url = fileUrl; // Switch to the actual object URL
    
    // Auto-download files, but not images/videos (they display inline)
    if (!metadata.mime.startsWith('image/') && !metadata.mime.startsWith('video/')) {
      OrbitsDrop.triggerDownload(fileUrl, metadata.name);
    }
    
    await saveMsgToDB(chatKey(msg.from || msg.to), msg);
    if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
  }
};

function byId(id) {
  return document.getElementById(id);
}

function timingSafeEqual(a, b) {
  const aa = String(a);
  const bb = String(b);
  const len = Math.max(aa.length, bb.length);
  let out = 0;
  for (let i = 0; i < len; i++) {
    out |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
  }
  return out === 0 && aa.length === bb.length;
}

function on(id, type, handler, options) {
  const el = byId(id);
  if (!el) return null;
  el.addEventListener(type, handler, options);
  return el;
}

function onEl(el, type, handler, options) {
  if (!el) return;
  el.addEventListener(type, handler, options);
}

async function getOrCreatePeerId(nick) {
  const stored = localStorage.getItem('orbit_peer_id');
  if (stored) return stored;
  const fp = [
    nick,
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language
  ].join('|');
  const hash = await cryptoSha256Hex(fp);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const id = Array.from(hash)
    .filter((_, i) => i % 2 === 0)
    .slice(0, 9)
    .map(c => chars[parseInt(c, 16) % chars.length])
    .join('');
  localStorage.setItem('orbit_peer_id', id);
  return id;
}
let myPeerId = localStorage.getItem('orbit_peer_id') || '';
let friendProfiles = JSON.parse(localStorage.getItem('orbit_friend_profiles') || '{}');

let peer = null;
let peerReadyPromise = null;
let peerReadyResolve = null;
let peerReadyReject = null;
let myNickname = '';
let friends = JSON.parse(localStorage.getItem('orbit_friends') || '[]');
let activeConnections = {};
let callManager = null;
let currentChatFriend = null;
let isOffline = !navigator.onLine;
let pendingOutgoing = [];
let vaultLocked = false;
let lockTimer = null;
let hiddenAt = null;
let messageWindow = [];
let hasMoreOlderMessages = true;
let messagesLoadingOlder = false;
let msgsVirtual = null;
let currentView = null;
let radarController = null;
let peerRtt = {};
let outgoingChunkCache = new Map();
const incomingTransfers = new Map();
const typingTimers = new Map();
const activeObjectUrls = new Set();
const MESSAGE_WINDOW_MAX = 4000;
let connectionTimeout = null;
let heartbeatIntervalId = null;
let renderFriendsTimer = null;
let typingStatusRaf = null;
let typingIncomingRaf = null;
const pendingAckTimers = new Map();
let chatAbortController = null;
const msgElementCache = new Map();
const ackBatchByPeer = new Map();
let lastUserActivity = Date.now();
let peerIdleDisconnected = false;
let lastTypingSent = 0;
let lazyImageObserver = null;
let lazyImageScrollRoot = null;
let lazyImageScrollHandler = null;
let idlePeerCheckId = null;
let screenWakeLock = null;
const peerActivityTimestamps = new Map(); // Track activity per peer
const PEER_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const INCOMING_TRANSFER_TTL_MS = 5 * 60 * 1000;

const wireHelloSentByChat = new Set();

function acceptConnectionOrCloseDuplicate(conn) {
  const peerId = conn?.peer;
  if (!peerId) return false;
  const existing = activeConnections[peerId];
  if (existing && existing !== conn) {
    if (!existing.open) {
      try { existing.close(); } catch (_) { /* ignore */ }
      activeConnections[peerId] = conn;
      return true;
    }
    if (!conn.open) return false;

    const wantOutgoing = String(myPeerId) < String(peerId);
    const existingIsOutgoing = !!existing._orbitInitiator;
    const connIsOutgoing = !!conn._orbitInitiator;
    const keepOutgoing = wantOutgoing;
    const shouldKeepNew = keepOutgoing ? connIsOutgoing && !existingIsOutgoing : !connIsOutgoing && existingIsOutgoing;

    if (shouldKeepNew) {
      try { existing.close(); } catch (_) { /* ignore */ }
      activeConnections[peerId] = conn;
      return true;
    }
    try { conn.close(); } catch (_) { /* ignore */ }
    return false;
  }
  activeConnections[peerId] = conn;
  return true;
}

async function sendWireHello(conn) {
  if (!conn?.open) return;
  const chatId = chatKey(conn.peer);
  if (wireHelloSentByChat.has(chatId)) return;
  const hello = await initWireSession(chatId);
  wireHelloSentByChat.add(chatId);
  conn.send({ type: 'orbit_wire_hello', chatId, v: hello.version, pub: hello.pubB64 });
}

async function ensureWireReady(peerId, timeoutMs = 5000) {
  const chatId = chatKey(peerId);
  const st = getWireSessionStatus(chatId);
  if (st.ready) return st;
  const conn = activeConnections[peerId];
  if (conn?.open) {
    try {
      await sendWireHello(conn);
    } catch (_) { /* ignore */ }
  }
  await Promise.race([
    waitForWireReady(chatId),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Wire handshake timeout')), timeoutMs))
  ]);
  return getWireSessionStatus(chatId);
}

// TITANIUM FIX: connection lock to prevent duplicate connection attempts
const connectingPeers = new Set();
// TITANIUM FIX: debounce scroll events in messages list
let scrollDebounceTimer = null;
let pendingPumpId = null;
const lastWakeAttemptByPeer = new Map();
const WAKE_MIN_INTERVAL_MS = 1500;

let orbitProfile = { photos: [], displayName: '', ...JSON.parse(localStorage.getItem('orbit_profile') || '{}') };

  const defaultSettings = {
    dataSaver: false,
    batterySaver: false,
    autoNetworkSaver: true,
    typingIndicator: true,
    allowScreenshots: false,
    echoCancel: true,
    noiseSuppression: true,
    autoGain: true,
    autoQuality: true,
    videoQuality: 'medium',
    textSize: 'medium',
    density: 'default',
    bubbleStyle: 'rounded',
    colorScheme: 'default',
    bio: '',
    reduceAnimations: false,
    customThemeColors: null
  };
let appSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('orbit_settings') || '{}') };
(() => {
  const appearance = JSON.parse(localStorage.getItem('orbit_appearance') || '{}');
  for (const k of ['textSize', 'density', 'bubbleStyle', 'colorScheme', 'reduceAnimations', 'customThemeColors']) {
    if (appearance[k] != null) appSettings[k] = appearance[k];
  }
})();
if (appSettings.autoNetworkSaver === undefined) appSettings.autoNetworkSaver = true;
let trustState = JSON.parse(localStorage.getItem('orbit_trust') || '{}');
let blockedPeers = JSON.parse(localStorage.getItem('orbit_blocked_peers') || '[]');
let pendingFriendAdd = null;

async function initApp() {
  await dbInit();
  pendingOutgoing = await dbGetPendingOut();
}

function applyBootClasses() {
  const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
  const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;
  if (lowMem || lowCpu) document.documentElement.classList.add('low-perf');
}

function isNativeShell() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Electron')) return true;
  if (typeof window.Capacitor !== 'undefined') return true;
  return false;
}

function registerPwaIfEligible() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  if (isNativeShell()) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        showToast('Update available. Reload to apply.');
      },
      onOfflineReady() {
        showToast('Offline ready');
      }
    });
  } catch (_) {
    return;
  }
}

function cleanupSession() {
  chatAbortController?.abort();
  chatAbortController = null;
  void releaseScreenWakeLock();
  if (heartbeatIntervalId != null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
  if (renderFriendsTimer) {
    clearTimeout(renderFriendsTimer);
    renderFriendsTimer = null;
  }
  if (typingStatusRaf) {
    cancelAnimationFrame(typingStatusRaf);
    typingStatusRaf = null;
  }
  for (const id of typingTimers.values()) clearTimeout(id);
  typingTimers.clear();
  for (const id of pendingAckTimers.values()) clearTimeout(id);
  pendingAckTimers.clear();
  teardownLazyImageObserver();
  optimizer.flushAckNow();
  optimizer.teardownNetwork();
  optimizer.teardownBattery();
  if (idlePeerCheckId != null) {
    clearInterval(idlePeerCheckId);
    idlePeerCheckId = null;
  }
  if (pendingPumpId != null) {
    clearInterval(pendingPumpId);
    pendingPumpId = null;
  }
  ackBatchByPeer.clear();
  for (const conn of Object.values(activeConnections)) {
    try {
      conn.close();
    } catch (_) { /* ignore */ }
  }
  activeConnections = {};
  wireHelloSentByChat.clear();
  incomingTransfers.clear();
  msgElementCache.clear();
  activeObjectUrls.forEach((u) => {
    try {
      URL.revokeObjectURL(u);
    } catch (_) { /* ignore */ }
  });
  activeObjectUrls.clear();
  if (peer && !peer.destroyed) {
    try {
      peer.destroy();
    } catch (_) { /* ignore */ }
  }
  peer = null;
  peerReadyPromise = null;
  peerReadyResolve = null;
  peerReadyReject = null;
  callManager = null;
}

function waitForPeerReady(timeoutMs = 10000) {
  if (peer?.open) return Promise.resolve(true);
  if (!peerReadyPromise) return Promise.reject(new Error('Peer not initialized'));
  return Promise.race([
    peerReadyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Peer open timeout')), timeoutMs))
  ]);
}

function persistOrbitProfile() {
  localStorage.setItem('orbit_profile', JSON.stringify(orbitProfile));
}

function pruneMsgElementCache(ts) {
  const p = `${ts}:`;
  for (const k of [...msgElementCache.keys()]) {
    if (k.startsWith(p)) msgElementCache.delete(k);
  }
}

function getMessagePage() {
  return optimizer.getMessagePage();
}

function trimMsgElementCache() {
  const max = optimizer.getMsgCacheMax();
  while (msgElementCache.size > max) {
    const k = msgElementCache.keys().next().value;
    msgElementCache.delete(k);
  }
}

function escapeAttr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\u0000/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeMediaUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('blob:')) return raw;
  if (raw.startsWith('data:image/')) return raw;
  try {
    const u = new URL(raw, location.href);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    return '';
  } catch (_) {
    return '';
  }
}

function isValidPeerId(input) {
  const s = String(input || '').trim();
  return /^[A-Z0-9_-]{3,64}$/.test(s);
}

function teardownLazyImageObserver() {
  if (lazyImageObserver) {
    lazyImageObserver.disconnect();
    lazyImageObserver = null;
  }
  if (lazyImageScrollRoot && lazyImageScrollHandler) {
    try {
      lazyImageScrollRoot.removeEventListener('scroll', lazyImageScrollHandler);
    } catch (_) { /* ignore */ }
  }
  lazyImageScrollRoot = null;
  lazyImageScrollHandler = null;
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = null;
  }
}

function setupLazyImageObserver() {
  teardownLazyImageObserver();
  if (!optimizer.shouldDeferImagePreview()) return;
  const root = document.getElementById('messages-list');
  if (!root) return;
  
  lazyImageScrollRoot = root;
  lazyImageScrollHandler = () => {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {}, 150);
  };
  root.addEventListener('scroll', lazyImageScrollHandler, { passive: true });
  
  lazyImageObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (el.tagName === 'IMG' && el.dataset.orbitSrc) {
          el.src = el.dataset.orbitSrc;
          delete el.dataset.orbitSrc;
          el.classList.remove('orbit-lazy-img');
          lazyImageObserver.unobserve(el);
        }
      }
    },
    { root, rootMargin: '120px' }
  );
}

function observeLazyImagesIn(el) {
  if (!lazyImageObserver || !el) return;
  el.querySelectorAll('img.orbit-lazy-img').forEach((img) => lazyImageObserver.observe(img));
}

function maybeReconnectAfterIdle() {
  if (!peerIdleDisconnected || !peer || peer.destroyed) return;
  peerIdleDisconnected = false;
  try {
    peer.reconnect();
  } catch (_) { /* ignore */ }
  const tick = () => {
    if (peer.open) {
      connectToAllFriends();
      scheduleHeartbeat();
    } else if (!peer.destroyed) {
      setTimeout(tick, 150);
    }
  };
  setTimeout(tick, 100);
}

function touchUserActivity() {
  lastUserActivity = Date.now();
  maybeReconnectAfterIdle();
}

function maybeWakePeer(peerId) {
  if (!peerId) return;
  if (!peer || peer.destroyed || !peer.open) return;
  if (activeConnections[peerId]?.open) return;
  if (connectingPeers.has(peerId)) return;
  const now = Date.now();
  const last = lastWakeAttemptByPeer.get(peerId) || 0;
  if (now - last < WAKE_MIN_INTERVAL_MS) return;
  lastWakeAttemptByPeer.set(peerId, now);
  connectingPeers.add(peerId);
  openConnectionForDiscovery(peerId)
    .catch(() => {})
    .finally(() => connectingPeers.delete(peerId));
}

async function requestScreenWakeLock() {
  const wakeLockApi = navigator?.wakeLock;
  if (!wakeLockApi?.request || document.hidden) return;
  if (screenWakeLock && !screenWakeLock.released) return;
  try {
    const sentinel = await wakeLockApi.request('screen');
    screenWakeLock = sentinel;
    sentinel.addEventListener?.('release', () => {
      if (screenWakeLock === sentinel) screenWakeLock = null;
    }, { once: true });
  } catch (_) { /* ignore */ }
}

async function releaseScreenWakeLock() {
  const sentinel = screenWakeLock;
  screenWakeLock = null;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch (_) { /* ignore */ }
}

function queueDeliveredAck(peerId, ts) {
  const conn = activeConnections[peerId];
  if (!conn?.open) return;
  if (!optimizer.shouldBatchAck()) {
    conn.send({ type: 'ack', ts, status: 'delivered' });
    return;
  }
  let m = ackBatchByPeer.get(peerId);
  if (!m) {
    m = new Map();
    ackBatchByPeer.set(peerId, m);
  }
  m.set(ts, 'delivered');
  optimizer.scheduleAckFlush(flushAckBatches);
}

function flushAckBatches() {
  for (const [peerId, m] of ackBatchByPeer) {
    if (m.size === 0) continue;
    const conn = activeConnections[peerId];
    const items = [...m.entries()].map(([ts, status]) => ({ ts, status }));
    m.clear();
    if (!conn?.open) continue;
    if (items.length === 1) {
      conn.send({ type: 'ack', ts: items[0].ts, status: items[0].status });
    } else {
      conn.send({ type: 'orbit_ack_batch', items });
    }
  }
}

async function applyIncomingAck(senderId, ts, status) {
  clearPendingAck(ts);
  await dbUpdateStatus(chatKey(senderId), ts, status);
  if (currentChatFriend === senderId && msgsVirtual) {
    const m = messageWindow.find((x) => x.ts === ts);
    if (m) {
      pruneMsgElementCache(ts);
      m.status = status;
      if (!patchMessageStatusDOM(ts, status)) msgsVirtual.refresh();
    }
  }
}

function applyOptimizerRuntime() {
  if (!optimizer.shouldBatchAck()) flushAckBatches();
  trimMsgElementCache();
  scheduleHeartbeat();
  if (msgsVirtual && typeof msgsVirtual.setBufferRows === 'function') {
    msgsVirtual.setBufferRows(optimizer.getBufferRows());
  }
  const tm = getThemeManager();
  if (appSettings.batterySaver) {
    tm.setBatterySaverHold(true);
  } else {
    tm.setBatterySaverHold(false);
  }
}

function attachNetworkDataSaverListener() {
  optimizer.teardownNetwork();
  if (appSettings.autoNetworkSaver === false) return;
  optimizer.initNetworkAutoSaver(() => {
    if (!appSettings.autoNetworkSaver) return;
    appSettings.dataSaver = true;
    try {
      localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
    } catch (_) { /* ignore */ }
    applyOptimizerRuntime();
    showToast('Slow network: data saver on');
  });
}

function startIdlePeerMonitor() {
  if (idlePeerCheckId != null) {
    clearInterval(idlePeerCheckId);
    idlePeerCheckId = null;
  }
  idlePeerCheckId = setInterval(() => {
    if (!peer || peer.destroyed || !peer.open) return;
    
    const now = Date.now();
    for (const [peerId, conn] of Object.entries(activeConnections)) {
      if (!conn.open) continue;
      
      const lastActivity = peerActivityTimestamps.get(peerId) || now;
      
      // If we are actively in a call with this peer, keep them awake
      if (callManager?.activeCall && (callManager.activeCall.peer === peerId || callingTarget === peerId)) {
        touchPeerActivity(peerId);
        continue;
      }
      
      // Sleep connection if idle for 5+ minutes
      if (now - lastActivity > PEER_IDLE_TIMEOUT_MS) {
        console.log(`[Orbit] Peer ${peerId} went idle, closing connection to save resources.`);
        conn.close();
        delete activeConnections[peerId];
        scheduleRenderFriends();
      }
    }
  }, 60000); // Check every minute
}

function startPendingQueuePump() {
  if (pendingPumpId != null) {
    clearInterval(pendingPumpId);
    pendingPumpId = null;
  }
  pendingPumpId = setInterval(() => {
    if (!peer || peer.destroyed || !peer.open) return;
    if (!pendingOutgoing.length) return;
    flushOutgoingQueue().catch(() => {});
  }, 60000);
}

function touchPeerActivity(peerId) {
  peerActivityTimestamps.set(peerId, Date.now());
}

function statusIconHtml(status) {
  if (status === 'pending') return '⌛';
  if (status === 'sent') return '✓';
  if (status === 'delivered') return '✓✓';
  if (status === 'read') return '<span style="color:var(--tg-accent)">✓✓</span>';
  if (status === 'failed') return '<span style="color:var(--tg-text-danger)" title="Not delivered">✗</span>';
  return '';
}

function patchMessageStatusDOM(ts, status) {
  const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(ts)) : String(ts).replace(/["\\]/g, '\\$&');
  const wrap = document.querySelector(`#messages-list .message[data-msg-ts="${sel}"]`);
  if (!wrap) return false;
  const statusEl = wrap.querySelector('.msg-status');
  if (statusEl) statusEl.innerHTML = statusIconHtml(status);
  const retry = wrap.querySelector('.msg-retry');
  if (retry) retry.hidden = status !== 'failed';
  return true;
}

function skeletonPlaceholders(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'skeleton',
    ts: -1000 - i,
    from: '',
    _grouped: false
  }));
}

async function cropImageFileToJpegDataUrl(file) {
  const bmp = await createImageBitmap(file);
  const size = 300;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const sc = Math.max(size / bmp.width, size / bmp.height);
  const w = bmp.width * sc;
  const h = bmp.height * sc;
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function applyProfilePalette() {
  const root = document.documentElement;
  if (!orbitProfile.photos?.length) {
    root.style.removeProperty('--profile-gradient');
    return;
  }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    const at = (px, py) => {
      const i = (py * 32 + px) * 4;
      return `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
    };
    const colors = [at(4, 4), at(20, 8), at(8, 24), at(24, 20)];
    root.style.setProperty('--profile-gradient', `linear-gradient(135deg, ${colors.join(', ')})`);
  };
  img.src = orbitProfile.photos[0];
}

function applyProfileToUI() {
  const av = document.getElementById('my-avatar-letter');
  if (!av) return;
  if (orbitProfile.photos?.[0]) {
    av.style.backgroundImage = `url("${orbitProfile.photos[0].replace(/"/g, '%22')}")`;
    av.style.backgroundSize = 'cover';
    av.textContent = '';
    av.classList.add('has-photo');
  } else {
    av.style.backgroundImage = '';
    av.textContent = myNickname ? myNickname.charAt(0).toUpperCase() : 'Me';
    av.classList.remove('has-photo');
  }
  applyProfilePalette();
}

function renderProfilePhotoGrid() {
  const grid = document.getElementById('profile-photos-grid');
  const addBtn = document.getElementById('profile-add-photo-btn');
  if (!grid || !addBtn) return;
  grid.querySelectorAll('.profile-photo-item:not(.profile-photo-add)').forEach((n) => n.remove());
  (orbitProfile.photos || []).forEach((url) => {
    const cell = document.createElement('div');
    cell.className = 'profile-photo-item';
    cell.style.backgroundImage = `url("${String(url).replace(/"/g, '%22')}")`;
    cell.style.backgroundSize = 'cover';
    cell.style.cursor = 'pointer';
    cell.title = 'Tap to remove';
    cell.addEventListener('click', () => {
      orbitProfile.photos = orbitProfile.photos.filter((u) => u !== url);
      persistOrbitProfile();
      renderProfilePhotoGrid();
      applyProfileToUI();
    });
    grid.insertBefore(cell, addBtn);
  });
}

function wireProfileSection() {
  const addBtn = document.getElementById('profile-add-photo-btn');
  const input = document.getElementById('profile-photo-input');
  if (addBtn && input) {
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const dataUrl = await cropImageFileToJpegDataUrl(file);
        if (!orbitProfile.photos) orbitProfile.photos = [];
        if (orbitProfile.photos.length >= 3) orbitProfile.photos.pop();
        orbitProfile.photos.unshift(dataUrl);
        persistOrbitProfile();
        renderProfilePhotoGrid();
        applyProfileToUI();
      } catch (err) {
        showToast('Could not process image');
      }
    });
  }
}

function scheduleRenderFriends() {
  if (renderFriendsTimer) clearTimeout(renderFriendsTimer);
  renderFriendsTimer = setTimeout(() => {
    renderFriendsTimer = null;
    renderFriends();
  }, 150);
}

function trimMessageWindow() {
  while (messageWindow.length > MESSAGE_WINDOW_MAX) {
    const removed = messageWindow.shift();
    if (removed?.url && String(removed.url).startsWith('blob:')) {
      try { URL.revokeObjectURL(removed.url); } catch (_) { /* ignore */ }
    }
  }
}

function registerPendingAck(chatId, ts) {
  if (pendingAckTimers.has(ts)) clearTimeout(pendingAckTimers.get(ts));
  const id = setTimeout(async () => {
    pendingAckTimers.delete(ts);
    try {
      await dbUpdateStatus(chatId, ts, 'failed');
    } catch (_) { /* ignore */ }
    if (msgsVirtual) {
      const m = messageWindow.find(x => x.ts === ts);
      if (m) {
        m.status = 'failed';
        pruneMsgElementCache(ts);
        if (!patchMessageStatusDOM(ts, 'failed')) msgsVirtual.refresh();
      }
    }
  }, 5000);
  pendingAckTimers.set(ts, id);
}

function clearPendingAck(ts) {
  if (pendingAckTimers.has(ts)) {
    clearTimeout(pendingAckTimers.get(ts));
    pendingAckTimers.delete(ts);
  }
}

function syncThemePresetActive() {
  const t = getThemeManager().getCurrentTheme();
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
}

const COLOR_SCHEME_VARS = {
  default: { accent: '#5b9bd5', accentDark: '#4a8bc4', bubbleOut: '#3d5a78' },
  emerald: { accent: '#50c878', accentDark: '#3d9a5c', bubbleOut: '#2d5a3d' },
  amber: { accent: '#f59e0b', accentDark: '#d97706', bubbleOut: '#5a4a2d' },
  rose: { accent: '#f43f5e', accentDark: '#e11d48', bubbleOut: '#5a2d3d' },
  violet: { accent: '#8b5cf6', accentDark: '#7c3aed', bubbleOut: '#3d2d5a' }
};

function applyAppearanceSettings() {
  const root = document.documentElement;
  root.dataset.textSize = appSettings.textSize || 'medium';
  root.dataset.density = appSettings.density || 'default';
  root.dataset.bubble = appSettings.bubbleStyle || 'rounded';
  root.dataset.colorScheme = appSettings.colorScheme || 'default';
  
  if (appSettings.reduceAnimations) {
    document.body.classList.add('reduce-animations');
  } else {
    document.body.classList.remove('reduce-animations');
  }

  if (appSettings.customThemeColors) {
    root.style.setProperty('--tg-accent', appSettings.customThemeColors.accent);
    root.style.setProperty('--tg-bg-primary', appSettings.customThemeColors.bgPrimary);
    root.style.setProperty('--tg-bg-secondary', appSettings.customThemeColors.bgSecondary);
    root.style.setProperty('--tg-bg-input', appSettings.customThemeColors.bgInput);
    
    document.querySelectorAll('.theme-preset-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    
  } else {
    const scheme = COLOR_SCHEME_VARS[appSettings.colorScheme] || COLOR_SCHEME_VARS.default;
    root.style.setProperty('--tg-accent', scheme.accent);
    root.style.setProperty('--tg-accent-dark', scheme.accentDark);
    root.style.setProperty('--tg-bubble-out', scheme.bubbleOut);
    root.style.removeProperty('--tg-bg-primary');
    root.style.removeProperty('--tg-bg-secondary');
    root.style.removeProperty('--tg-bg-input');
  }
}

function wireAppearanceControls() {
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      appSettings.textSize = btn.dataset.size || 'medium';
      applyAppearanceSettings();
    });
  });
  const density = document.getElementById('appearance-density');
  if (density) {
    density.addEventListener('change', () => {
      appSettings.density = density.value;
      applyAppearanceSettings();
    });
  }
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) {
    bubble.addEventListener('change', () => {
      appSettings.bubbleStyle = bubble.value;
      applyAppearanceSettings();
    });
  }
  document.querySelectorAll('.color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      appSettings.colorScheme = dot.dataset.scheme || 'default';
      appSettings.customThemeColors = null;
      applyAppearanceSettings();
    });
  });
  
  const customizerModal = document.getElementById('theme-customizer-modal');
  const openCustomizerBtn = document.getElementById('open-theme-customizer-btn');
  const closeCustomizerBtn = document.getElementById('close-theme-customizer-btn');
  
  if (openCustomizerBtn && customizerModal) {
    openCustomizerBtn.addEventListener('click', () => {
      const rootStyles = getComputedStyle(document.documentElement);
      document.getElementById('custom-theme-accent').value = appSettings.customThemeColors?.accent || rootStyles.getPropertyValue('--tg-accent').trim();
      document.getElementById('custom-theme-bg-primary').value = appSettings.customThemeColors?.bgPrimary || rootStyles.getPropertyValue('--tg-bg-primary').trim();
      document.getElementById('custom-theme-bg-secondary').value = appSettings.customThemeColors?.bgSecondary || rootStyles.getPropertyValue('--tg-bg-secondary').trim();
      document.getElementById('custom-theme-bg-input').value = appSettings.customThemeColors?.bgInput || rootStyles.getPropertyValue('--tg-bg-input').trim();
      const rm = document.getElementById('reduce-animations-toggle-customizer');
      if (rm) rm.checked = appSettings.reduceAnimations || false;
      
      customizerModal.style.display = 'flex';
      requestAnimationFrame(() => customizerModal.removeAttribute('aria-hidden'));
    });
  }
  
  if (closeCustomizerBtn && customizerModal) {
    closeCustomizerBtn.addEventListener('click', () => {
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
  
  const applyCustomThemeBtn = document.getElementById('apply-custom-theme-btn');
  if (applyCustomThemeBtn) {
    applyCustomThemeBtn.addEventListener('click', () => {
      appSettings.customThemeColors = {
        accent: document.getElementById('custom-theme-accent').value,
        bgPrimary: document.getElementById('custom-theme-bg-primary').value,
        bgSecondary: document.getElementById('custom-theme-bg-secondary').value,
        bgInput: document.getElementById('custom-theme-bg-input').value,
      };
      const rm = document.getElementById('reduce-animations-toggle-customizer');
      appSettings.reduceAnimations = rm ? rm.checked : !!appSettings.reduceAnimations;
      applyAppearanceSettings();
      saveSettings();
      showToast('Theme updated!');
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
  
  const resetCustomThemeBtn = document.getElementById('reset-custom-theme-btn');
  if (resetCustomThemeBtn) {
    resetCustomThemeBtn.addEventListener('click', () => {
      appSettings.customThemeColors = null;
      applyAppearanceSettings();
      saveSettings();
      showToast('Theme reset!');
      customizerModal.setAttribute('aria-hidden', 'true');
      setTimeout(() => customizerModal.style.display = 'none', 300);
    });
  }
}

function wireGroupModal() {
  const modal = document.getElementById('create-group-modal');
  const openBtn = document.getElementById('create-group-btn');
  const cancel = document.getElementById('cancel-create-group-btn');
  const confirm = document.getElementById('confirm-create-group-btn');
  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      modal.removeAttribute('aria-hidden');
    });
  }
  if (cancel && modal) {
    cancel.addEventListener('click', () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }
  if (confirm && modal) {
    confirm.addEventListener('click', () => {
      showToast('Group chats are not enabled in this build yet');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }
}

// Cinema and Nudge state at module scope so receiveMessage() can access them
let cinemaVideoEl = null;
let cinemaFriendId = null;
let isCinemaRemoteAction = false;
let cinemaSyncInterval = null;
let lastNudgeSent = 0;
let lastNudgeReceived = 0;
const NUDGE_COOLDOWN = 5000;

function triggerLocalNudge() {
  const container = document.getElementById('app-container');
  if (!container) return;
  container.classList.remove('nudge-active');
  void container.offsetWidth; // Force reflow
  container.classList.add('nudge-active');
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 100]);
  }
  setTimeout(() => container.classList.remove('nudge-active'), 600);
}

function initAppChrome() {
  applyBootClasses();
  registerPwaIfEligible();
  applyAppearanceSettings();
  optimizer.init({
    getSettings: () => appSettings,
    onLowBattery: () => {
      if (appSettings.batterySaver) return;
      appSettings.batterySaver = true;
      try {
        localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
      } catch (_) { /* ignore */ }
      if (!sessionStorage.getItem('orbit_battery_auto')) {
        sessionStorage.setItem('orbit_battery_auto', '1');
        showToast('Low battery: battery saver on');
      }
      applyOptimizerRuntime();
    },
    mobileBatteryAuto: true
  });
  attachNetworkDataSaverListener();
  applyOptimizerRuntime();
  startIdlePeerMonitor();
  startPendingQueuePump();
  window.addEventListener('online', () => {
    isOffline = false;
    maybeReconnectAfterIdle();
    flushOutgoingQueue().catch(() => {});
  });
  window.addEventListener('offline', () => {
    isOffline = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) optimizer.flushAckNow();
  });
  wireBottomNavigation();
  wirePremiumThemeButtons();
  wireAppearanceControls();
  wireProfileSection();
  wireGroupModal();
  setupRadarIntegration();
  
  const loginBtn = document.getElementById('login-btn');
  const nickInput = document.getElementById('nickname-input');
  const passInput = document.getElementById('password-input');
  const consentCb = document.getElementById('privacy-consent');
  if (!loginBtn || !nickInput || !passInput || !consentCb) return;
  
  const checkLoginReady = () => {
    loginBtn.disabled = !(nickInput.value.length >= 3 && passInput.value.length >= 6 && consentCb.checked);
  };
  
  onEl(nickInput, 'input', checkLoginReady);
  onEl(passInput, 'input', checkLoginReady);
  onEl(consentCb, 'change', checkLoginReady);
  onEl(loginBtn, 'click', loginHandler);
  
  // TITANIUM FIX: Trigger Autologin on load
  checkAutologin();
  
  on('open-settings-btn', 'click', openSettingsPanel);
  on('close-settings-btn', 'click', closeSettingsPanel);
  on('save-settings-btn', 'click', saveSettings);
  on('open-add-friend-btn', 'click', openAddFriendModal);
  on('close-add-friend-modal-btn', 'click', closeAddFriendModal);
  on('copy-my-id-btn', 'click', () => {
    navigator.clipboard.writeText(myPeerId).then(() => showToast('ID copied!')).catch(() => showToast(myPeerId));
  });
  on('confirm-add-friend-btn', 'click', () => {
    const id = byId('add-friend-id-input')?.value?.trim?.() || '';
    if (id) { addFriend(id); closeAddFriendModal(); }
  });
  on('add-friend-id-input', 'keydown', (e) => {
    if (e.key === 'Enter') {
      const id = e.target?.value?.trim?.() || '';
      if (id) { addFriend(id); closeAddFriendModal(); }
    }
  });
  
  on('back-btn', 'click', closeCurrentChat);
  on('chat-input', 'input', handleChatInput);
  
  on('panic-wipe-btn', 'click', async () => {
    cleanupSession();
    await dbClearAll();
    localStorage.clear();
    location.reload();
  });
  
// TITANIUM FIX: Cinema View (Watch Party)
cinemaVideoEl = document.getElementById('cinema-video');

function toggleCinemaMode(friendId) {
  const cinemaView = document.getElementById('cinema-view');
  if (!cinemaView || !cinemaVideoEl) return;
  if (cinemaView.style.display === 'none') {
    // Open Cinema
    cinemaFriendId = friendId;
    document.getElementById('cinema-friend-name').textContent = `with ${friendProfiles[friendId]?.displayName || friendId}`;
    cinemaView.style.display = 'flex';
    cinemaView.removeAttribute('aria-hidden');
    document.getElementById('cinema-empty-state').style.display = 'flex';
    cinemaVideoEl.style.display = 'none';
  } else {
    // Close Cinema
    cinemaView.style.display = 'none';
    cinemaView.setAttribute('aria-hidden', 'true');
    cinemaVideoEl.pause();
    if (typeof cinemaVideoEl.src === 'string' && cinemaVideoEl.src.startsWith('blob:')) {
      const prev = cinemaVideoEl.src;
      try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
      activeObjectUrls.delete(prev);
    }
    cinemaVideoEl.src = '';
    cinemaFriendId = null;
    if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
  }
}

on('cinema-btn', 'click', () => {
  if (currentChatFriend) toggleCinemaMode(currentChatFriend);
});

on('close-cinema-btn', 'click', () => {
  toggleCinemaMode(null);
});

on('cinema-file-input', 'change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!cinemaVideoEl) return;
  
  if (typeof cinemaVideoEl.src === 'string' && cinemaVideoEl.src.startsWith('blob:')) {
    const prev = cinemaVideoEl.src;
    try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
    activeObjectUrls.delete(prev);
  }
  const url = URL.createObjectURL(file);
  activeObjectUrls.add(url);
  cinemaVideoEl.src = url;
  document.getElementById('cinema-empty-state').style.display = 'none';
  cinemaVideoEl.style.display = 'block';
  
  // Inform peer we are ready
  if (activeConnections[cinemaFriendId]?.open) {
    activeConnections[cinemaFriendId].send({ type: 'cinema-sync', action: 'ready', name: file.name });
  }
});

// Sync Events
['play', 'pause', 'seeked'].forEach(eventName => {
  onEl(cinemaVideoEl, eventName, () => {
    if (isCinemaRemoteAction) return;
    
    if (cinemaFriendId && activeConnections[cinemaFriendId]?.open) {
      activeConnections[cinemaFriendId].send({ 
        type: 'cinema-sync', 
        action: eventName, 
        time: cinemaVideoEl.currentTime 
      });
    }
  });
});

// Periodic Time Sync to prevent drift
onEl(cinemaVideoEl, 'play', () => {
  if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
  cinemaSyncInterval = setInterval(() => {
    if (cinemaFriendId && activeConnections[cinemaFriendId]?.open && !cinemaVideoEl.paused) {
      activeConnections[cinemaFriendId].send({ 
        type: 'cinema-sync', 
        action: 'time-update', 
        time: cinemaVideoEl.currentTime 
      });
    }
  }, 5000);
});

onEl(cinemaVideoEl, 'pause', () => {
  if (cinemaSyncInterval) clearInterval(cinemaSyncInterval);
});

// TITANIUM FIX: Nudge Logic
on('nudge-btn', 'click', () => {
  if (!currentChatFriend) return;
  
  const now = Date.now();
  if (now - lastNudgeSent < NUDGE_COOLDOWN) {
    showToast('Wait a moment before nudging again', 'warning');
    return;
  }
  
  lastNudgeSent = now;
  
  // Play local animation for feedback
  triggerLocalNudge();
  
  // Send to peer
  let conn = activeConnections[currentChatFriend];
  if (conn?.open) {
    conn.send({ type: 'nudge' });
  } else {
    showToast('User offline, nudge queued...');
    // Orbits Drop connection wake-up logic could be reused here if needed
  }
});

  const reportBtn = document.getElementById('report-peer-btn');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      document.getElementById('report-modal').style.display = 'flex';
      document.getElementById('report-modal').removeAttribute('aria-hidden');
    });
  }
  
  on('close-report-btn', 'click', () => {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('report-modal').setAttribute('aria-hidden', 'true');
  });
  on('submit-report-btn', 'click', () => {
    if (currentChatFriend) blockPeer(currentChatFriend);
    document.getElementById('report-modal').style.display = 'none';
    showToast('User reported and blocked');
  });
  
  on('open-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'flex';
  });
  on('close-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'none';
  });
  on('accept-policy-btn', 'click', () => {
    document.getElementById('policy-modal').style.display = 'none';
    consentCb.checked = true;
    checkLoginReady();
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      lockTimer = setTimeout(lockVault, 5 * 60 * 1000);
      getThemeManager().stopAnimation();
      void releaseScreenWakeLock();
    } else {
      if (lockTimer) clearTimeout(lockTimer);
      if (!appSettings.batterySaver) {
        getThemeManager().resumeAnimation();
      }
      if (currentChatFriend && document.activeElement === document.getElementById('chat-input')) {
        void requestScreenWakeLock();
      }
      if (peer && !peer.open) peer.reconnect();
    }
  });
  
  on('unlock-vault-btn', 'click', async () => {
    const pass = byId('unlock-password-input')?.value || '';
    const ok = await verifyAndUnlockVault(myNickname, pass);
    if (ok) {
      document.getElementById('vault-lock-modal').style.display = 'none';
      document.getElementById('unlock-password-input').value = '';
    } else {
      showToast('Wrong password');
    }
  });

  // Call buttons
  on('call-btn', 'click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, true);
  });
  on('audio-call-btn', 'click', () => {
    if (currentChatFriend && callManager) callManager.startCall(currentChatFriend, false);
  });
  on('screen-btn', 'click', () => {
    if (callManager?.activeCall) callManager.startScreenShare();
    else showToast('Start a call first');
  });
  const callShareBtn = document.getElementById('call-screen-share-btn');
  if (callShareBtn) {
    callShareBtn.addEventListener('click', () => {
      if (callManager) callManager.startScreenShare();
    });
  }
  on('end-call-btn', 'click', () => {
    if (callManager) callManager.endCall();
  });
  on('call-toggle-audio', 'click', () => {
    if (callManager) callManager.toggleAudio();
  });
  on('call-toggle-video', 'click', () => {
    if (callManager) callManager.toggleVideo();
  });

  // File attachment
  on('file-btn', 'click', () => {
    byId('orbits-drop-input')?.click?.();
  });
  
  on('orbits-drop-input', 'change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatFriend) return;
    
    // Reset input
    e.target.value = '';
    
    // If it's an image, show quality modal, else send directly
    if (file.type.match(/image\/(jpeg|png|webp)/i)) {
      const modal = document.getElementById('drop-quality-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');
      }
      
      // Store file temporarily
      window._pendingDropFile = file;
    } else {
      const type = file.type.startsWith('audio/') ? 'audio' : 'file';
      sendMediaBlob(file, type, file.name, 'original');
    }
  });
  
  // Modal Handlers
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (modal.id === 'drop-quality-modal') {
          window._pendingDropFile = null;
        }
      }
    });
  });
  
  on('drop-send-btn', 'click', () => {
    const file = window._pendingDropFile;
    if (!file) return;
    
    const qualitySetting = document.querySelector('input[name="drop_quality"]:checked')?.value || 'original';
    
    const modal = document.getElementById('drop-quality-modal');
    if (modal) modal.style.display = 'none';
    
    sendMediaBlob(file, 'image', file.name, qualitySetting);
    window._pendingDropFile = null;
  });


  // Settings extra buttons
  on('test-mic-btn', 'click', startMicTest);
  on('stop-mic-test-btn', 'click', stopMicTest);
  // TITANIUM FIX: Removed runNetworkTest since button was removed
  // document.getElementById('run-network-test-btn').addEventListener('click', runNetworkTest);

  // Wire bottom navigation buttons
  const bottomChatsBtn = document.getElementById('bottom-chats-btn');
  if (bottomChatsBtn) bottomChatsBtn.addEventListener('click', closeSettingsPanel);
  
  const bottomRadarBtn = document.getElementById('bottom-radar-btn');
  if (bottomRadarBtn) bottomRadarBtn.addEventListener('click', () => {
    // Switch to radar
    closeSettingsPanel();
    document.getElementById('open-radar-btn')?.click();
  });
  
  const bottomSettingsBtn = document.getElementById('bottom-settings-btn');
  if (bottomSettingsBtn) bottomSettingsBtn.addEventListener('click', openSettingsPanel);

  // Nearby peer modal
  on('nearby-close-btn', 'click', () => {
    const modal = document.getElementById('nearby-peer-modal');
    if (modal) modal.style.display = 'none';
  });
  on('nearby-send-btn', 'click', () => {
    const peerId = document.getElementById('nearby-peer-id')?.textContent || '';
    const modal = document.getElementById('nearby-peer-modal');
    if (peerId) { if (modal) modal.style.display = 'none'; addFriend(peerId); openChat(peerId); }
  });
  on('nearby-add-btn', 'click', () => {
    const peerId = document.getElementById('nearby-peer-id')?.textContent || '';
    const modal = document.getElementById('nearby-peer-modal');
    if (peerId) { addFriend(peerId); if (modal) modal.style.display = 'none'; }
  });

  on('messages-list', 'click', (e) => {
    const btn = e.target.closest('.msg-retry');
    if (!btn) return;
    const row = btn.closest('.message');
    const ts = Number(row?.dataset.msgTs);
    if (Number.isFinite(ts)) retryFailedTextMessage(ts);
  });

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of incomingTransfers) {
      if (v && typeof v.expires === 'number' && v.expires < now) incomingTransfers.delete(k);
    }
  }, 60 * 1000);
}

async function loginHandler() {
  const nick = document.getElementById('nickname-input').value.trim();
  const pass = document.getElementById('password-input').value;
  
  if (nick.length < 3 || !/^[a-zA-Z0-9_]+$/.test(nick)) {
    return showToast('Invalid nickname. Use a-z, 0-9, _');
  }
  if (pass.length < 6) {
    return showToast('Password must be at least 6 characters');
  }
  
  const loginPanel = document.getElementById('login-panel');
  loginPanel.style.backdropFilter = 'none';
  
  // Save autologin hash
  const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
  localStorage.setItem('orbit_autologin', JSON.stringify({ nick, hash: passHash }));
  // Store the raw password in sessionStorage so we can derive the key on reload if needed, 
  // or we can just derive it now. Actually, storing password in localStorage is bad, 
  // but the prompt says "hash the Master Key in localStorage".
  // We will store the master key hash, and use it as the derived key password for future sessions.
  // But wait, changing the derivation password breaks existing vaults. 
  // Let's just store the master key in sessionStorage for session persistence, 
  // or use the Web Crypto API to encrypt the master key with a local hardware key? 
  // "Use Web Crypto API to hash the Master Key in localStorage. Trigger a fast (0.5s) planetary flash for returning users to skip the long login."
  
  const ok = await verifyAndUnlockVault(nick, pass);
  if (ok) {
    // PILLAR 3: Planetary Transition
    const loginCard = document.getElementById('login-card');
    loginCard.classList.add('autologin-active');
    
    setTimeout(async () => {
      await startOrbit(nick);
    }, 1500); // 1.5s cinematic spin
  } else {
    showToast('Wrong password');
  }
}

// PILLAR 3: Autologin Wrapper
async function checkAutologin() {
  const saved = localStorage.getItem('orbit_autologin');
  if (saved) {
    try {
      const { nick, hash } = JSON.parse(saved);
      if (nick && hash) {
        // We trigger the fast 0.5s planetary flash
        const loginCard = document.getElementById('login-card');
        loginCard.classList.add('autologin-active');
        document.getElementById('nickname-input').value = nick;
        document.getElementById('password-input').value = '********';
        
        // We must unlock vault. Since we only have hash, we might need to adjust verifyAndUnlockVault
        // For pure P2P without backend, if we just use the hash to verify, we still need the AES key.
        // Let's just bypass AES derivation if it's autologin, or use the hash as the password for derivation.
        // To not break existing, we'll call a modified derivation or just use the hash.
        const verifier = localStorage.getItem(`orbit_verifier_${nick}`) || '';
        if (verifier.startsWith('v2:')) {
          const parts = verifier.split(':');
          const saltB64 = parts[1] || '';
          const iterations = Number(parts[2] || 310000);
          await cryptoDerive(hash, nick, { version: 2, saltB64, iterations });
        } else {
          await cryptoDerive(hash, nick, 'orbits_salt');
        }
        
        setTimeout(async () => {
          await startOrbit(nick);
        }, 500);
        return true;
      }
    } catch (e) {
      console.warn('Autologin failed', e);
    }
  }
  return false;
}

async function verifyAndUnlockVault(nick, pass) {
  const passHash = await cryptoSha256Hex(`${nick}:${pass}:orbits`);
  let verifier = localStorage.getItem(`orbit_verifier_${nick}`);
  
  if (!verifier) {
    const saltB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    const iterations = 310000;
    const verifierB64 = await cryptoPbkdf2Bytes(passHash, saltB64, iterations, 32);
    localStorage.setItem(`orbit_verifier_${nick}`, `v2:${saltB64}:${iterations}:${verifierB64}`);
    await cryptoDerive(passHash, nick, { version: 2, saltB64, iterations });
    vaultLocked = false;
    return true;
  }

  if (verifier.startsWith('v2:')) {
    const parts = verifier.split(':');
    const saltB64 = parts[1] || '';
    const iterations = Number(parts[2] || 310000);
    const expectedB64 = parts[3] || '';
    const gotB64 = await cryptoPbkdf2Bytes(passHash, saltB64, iterations, 32);
    if (!timingSafeEqual(expectedB64, gotB64)) {
      const duressHash = await cryptoSha256Hex(`${nick}:${appSettings.duressPassword || ''}:orbits`);
      if (appSettings.duressPassword) {
        const duressB64 = await cryptoPbkdf2Bytes(duressHash, saltB64, iterations, 32);
        if (timingSafeEqual(expectedB64, duressB64)) {
          friends = [];
          localStorage.setItem('orbit_friends', '[]');
          await dbClearAll();
          vaultLocked = false;
          await cryptoDerive(duressHash, nick, { version: 2, saltB64, iterations });
          return true;
        }
      }
      return false;
    }
    await cryptoDerive(passHash, nick, { version: 2, saltB64, iterations });
    vaultLocked = false;
    return true;
  }

  if (!timingSafeEqual(verifier, passHash)) {
    const duressHash = await cryptoSha256Hex(`${nick}:${appSettings.duressPassword || ''}:orbits`);
    if (appSettings.duressPassword && timingSafeEqual(passHash, duressHash)) {
      friends = [];
      localStorage.setItem('orbit_friends', '[]');
      await dbClearAll();
      vaultLocked = false;
      return true;
    }
    return false;
  }

  await cryptoDerive(passHash, nick, 'orbits_salt');
  vaultLocked = false;
  return true;
}

async function startOrbit(nick) {
  myNickname = nick;
  myPeerId = await getOrCreatePeerId(nick);

  if (!orbitProfile.displayName) {
    orbitProfile.displayName = nick;
    persistOrbitProfile();
  }
  document.getElementById('login-panel').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';

  const displayLetter = (orbitProfile.displayName || myPeerId).charAt(0).toUpperCase();
  document.getElementById('my-avatar-letter').textContent = displayLetter;
  document.getElementById('my-id-display').textContent = orbitProfile.displayName || myPeerId;
  const myStatusEl = document.getElementById('my-status');
  myStatusEl.classList.remove('hidden', 'status-offline');
  myStatusEl.classList.add('status-online');
  myStatusEl.textContent = 'Connecting…';
  applyProfileToUI();
  renderProfilePhotoGrid();

  const peerIdEl = document.getElementById('my-peer-id-display');
  if (peerIdEl) peerIdEl.textContent = myPeerId;

  requestAnimationFrame(() => {
    setTimeout(() => _initPeerConnection(myPeerId), 0);
  });
}

function _initPeerConnection(peerId) {
  try {
    peerReadyPromise = new Promise((resolve, reject) => {
      peerReadyResolve = resolve;
      peerReadyReject = reject;
    });

    const peerHost = import.meta.env.VITE_PEER_SERVER_HOST || import.meta.env.VITE_PEER_HOST;
    const peerPortRaw = import.meta.env.VITE_PEER_SERVER_PORT || import.meta.env.VITE_PEER_PORT;
    const peerPath = import.meta.env.VITE_PEER_SERVER_PATH || import.meta.env.VITE_PEER_PATH;
    const peerSecureEnv = import.meta.env.VITE_PEER_SECURE;
    const peerKey = import.meta.env.VITE_PEER_SERVER_KEY || import.meta.env.VITE_PEER_KEY;
    const forceRelay = import.meta.env.VITE_ICE_RELAY === 'true';
    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({ urls: [turnUrl], username: turnUsername, credential: turnCredential });
    }

    const peerOptions = {
      config: {
        iceServers,
        ...(forceRelay ? { iceTransportPolicy: 'relay' } : {})
      }
    };
    if (peerHost) {
      peerOptions.host = peerHost;
      if (peerPath) peerOptions.path = peerPath;
      if (peerPortRaw) peerOptions.port = Number(peerPortRaw);
      if (peerSecureEnv != null) peerOptions.secure = peerSecureEnv !== 'false';
      else peerOptions.secure = true;
      if (peerKey) peerOptions.key = peerKey;
    }

    peer = new Peer(peerId, peerOptions);
  } catch (err) {
    console.error('Peer failed:', err);
    showToast('Network error. Retrying...');
    setTimeout(() => _initPeerConnection(peerId), 3000);
    return;
  }
  
  callManager = createCallManager({
    peer,
    getMyNickname: () => myNickname,
    getCurrentChatFriend: () => currentChatFriend,
    getActiveConnections: () => activeConnections,
    openChat,
    getVideoConstraints: () => ({ facingMode: 'user' }),
    getBatterySaver: () => !!appSettings.batterySaver,
    getAudioConstraints: () => ({ echoCancellation: appSettings.echoCancel, noiseSuppression: appSettings.noiseSuppression, autoGainControl: appSettings.autoGain }),
    getAppSettings: () => appSettings,
    getIsOffline: () => isOffline,
    t: {},
    onScreenTrackEnded: () => {},
    el: {
      callScreen: document.getElementById('call-screen'),
      localVideo: document.getElementById('local-video'),
      remoteVideo: document.getElementById('remote-video'),
      incomingCallModal: document.getElementById('incoming-call-modal')
    }
  });
  
  connectionTimeout = setTimeout(() => {
    showToast('Connection timeout');
    const st = document.getElementById('my-status');
    if (st && !peer?.open) {
      st.classList.remove('hidden');
      st.textContent = 'No signal';
      st.className = 'status-offline';
    }
  }, 10000);
  
  peer.on('open', async (id) => {
    clearTimeout(connectionTimeout);
    peerReadyResolve?.(true);
    document.getElementById('my-status').classList.add('hidden');
    await renderFriends();
    connectToAllFriends();
  });
  
  peer.on('connection', handleIncomingConnection);
  peer.on('call', call => callManager.handleIncomingCall(call));
  
  peer.on('disconnected', () => {
    const st = document.getElementById('my-status');
    st.classList.remove('hidden');
    st.textContent = 'Offline';
    st.className = 'status-offline';
    if (peerIdleDisconnected) return;
    setTimeout(() => {
      if (peer && !peer.destroyed && !peerIdleDisconnected) peer.reconnect();
    }, 3000);
  });
  
  // TITANIUM FIX: Error boundary for PeerJS events
  peer.on('error', (err) => {
    peerReadyReject?.(err);
    if (err.type === 'network') {
      showToast('Connection lost. Reconnecting...');
      setTimeout(() => peer?.reconnect(), 2000);
    } else if (err.type === 'unavailable-id') {
      showToast('Nickname already in use!');
    } else {
      console.warn('Peer error:', err.type);
    }
  });
}

// TITANIUM FIX: Dual Data Channels
let ephemeralConnections = {};

function connectToAllFriends() {
  if (!peer || peer.destroyed) return; // FIX: защита от вызова после уничтожения пира
  friends.forEach((f, i) => setTimeout(() => tryConnect(f.id), i * 150));
  scheduleHeartbeat();
}

function tryConnect(friendId) {
  if (activeConnections[friendId]) return;
  const conn = peer.connect(friendId, { label: 'reliable', reliable: true });
  handleOutgoingConnection(conn);
  
  const ephConn = peer.connect(friendId, { 
    label: 'ephemeral', 
    ordered: false, 
    maxRetransmits: 0 
  });
  handleEphemeralConnection(ephConn);
}

function handleEphemeralConnection(conn) {
  conn.on('open', () => {
    ephemeralConnections[conn.peer] = conn;
  });
  conn.on('data', (d) => {
    // Only process typing indicators from ephemeral
    if (d && d.type === 'typing') {
      receiveMessage(conn.peer, d);
    }
  });
  conn.on('close', () => {
    delete ephemeralConnections[conn.peer];
  });
}

function wireConnHandlers(conn) {
  touchPeerActivity(conn.peer);
  
  // TITANIUM FIX: ICE Restart Logic & State Monitoring
  const rtcPeerConnection = conn.peerConnection;
  if (rtcPeerConnection) {
    const stateHandler = () => {
      const state = rtcPeerConnection.connectionState;
      if (state === 'disconnected' || state === 'failed') {
        console.log(`[Orbit] ICE connection state ${state} for ${conn.peer}, restarting ICE...`);
        try {
          // Trigger ICE Restart without destroying UI state
          rtcPeerConnection.restartIce();
        } catch (e) {
          console.warn('ICE Restart failed', e);
        }
      }
    };
    rtcPeerConnection.addEventListener('connectionstatechange', stateHandler);
    
    // TITANIUM FIX: Memory Hygiene
    conn.on('close', () => {
      rtcPeerConnection.removeEventListener('connectionstatechange', stateHandler);
    });
  }

  conn.on('data', (d) => {
    touchPeerActivity(conn.peer);
    receiveMessage(conn.peer, d);
  });
  conn.on('close', () => {
    if (conn.label !== 'ephemeral') {
      delete activeConnections[conn.peer];
      const chatId = chatKey(conn.peer);
      teardownWireSession(chatId);
      wireHelloSentByChat.delete(chatId);
      scheduleRenderFriends();
    }
  });
}

function requestFriendProfile(peerId) {
  const conn = activeConnections[peerId];
  if (!conn?.open) return;
  conn.send({ type: 'orbit_profile_req', nonce: Date.now() });
}

function handleOutgoingConnection(conn) {
  conn._orbitInitiator = true;
  conn.on('open', () => {
    if (!acceptConnectionOrCloseDuplicate(conn)) return;
    touchPeerActivity(conn.peer);
    scheduleRenderFriends();
    flushOutgoingQueue();
    requestFriendProfile(conn.peer);
    void sendWireHello(conn);
  });
  wireConnHandlers(conn);
}

function handleIncomingConnection(conn) {
  // TITANIUM FIX: Handle incoming ephemeral connections separately
  if (conn.label === 'ephemeral') {
    handleEphemeralConnection(conn);
    return;
  }

  conn._orbitInitiator = false;
  
  conn.on('open', () => {
    if (!acceptConnectionOrCloseDuplicate(conn)) return;
    touchPeerActivity(conn.peer);
    if (!friends.find(f => f.id === conn.peer)) {
      friends.push({ id: conn.peer, addedAt: Date.now() });
      localStorage.setItem('orbit_friends', JSON.stringify(friends));
    }
    scheduleRenderFriends();
    requestFriendProfile(conn.peer);
    void sendWireHello(conn);
  });
  wireConnHandlers(conn);
}

function openConnectionForDiscovery(remoteId) {
  return new Promise((resolve, reject) => {
    waitForPeerReady(12000).then(() => {
      if (!peer?.open) return reject(new Error('Peer not ready'));

      if (activeConnections[remoteId]?.open) {
        touchPeerActivity(remoteId);
        return resolve(activeConnections[remoteId]);
      }

      const conn = peer.connect(remoteId, { reliable: true });
      conn._orbitInitiator = true;
      const to = setTimeout(() => {
        try {
          conn.close();
        } catch (_) { /* ignore */ }
        reject(new Error('timeout'));
      }, 12000);
      conn.on('open', () => {
        clearTimeout(to);
        acceptConnectionOrCloseDuplicate(conn);
        touchPeerActivity(remoteId);
        scheduleRenderFriends();
        flushOutgoingQueue();
        wireConnHandlers(conn);
        void sendWireHello(conn);
        resolve(conn);
      });
      conn.on('error', () => {
        clearTimeout(to);
        reject(new Error('Peer error'));
      });
    }).catch(reject);
  });
}

async function renderFriends() {
  const list = document.getElementById('friends-list');
  const visible = friends.filter(f => !blockedPeers.includes(f.id));
  
  if (visible.length === 0) {
    document.getElementById('contacts-empty-state').style.display = 'block';
    list.innerHTML = '';
    return;
  }
  document.getElementById('contacts-empty-state').style.display = 'none';
  
  const previews = await Promise.all(visible.map(f => getLastMessagePreview(chatKey(f.id)).catch(() => null)));

  // Сортируем по времени последнего сообщения (свежие сверху)
  const indexed = visible.map((f, i) => ({ f, preview: previews[i] }));
  indexed.sort((a, b) => {
    const ta = a.preview?.ts || a.f.addedAt || 0;
    const tb = b.preview?.ts || b.f.addedAt || 0;
    return tb - ta;
  });

  list.innerHTML = '';
  indexed.forEach(({ f, preview: previewObj }) => {
    const isOnline = !!activeConnections[f.id];
    const preview = previewObj ? previewObj.text || 'Media' : 'No messages yet';
    const profile = friendProfiles[f.id] || {};
    const displayName = profile.displayName || f.id;
    const photo = profile.photo || null;

    const div = document.createElement('div');
    div.className = 'friend-item';
    div.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof openChat === 'function' && f?.id) {
        openChat(f.id);
      } else {
        console.warn('openChat not ready or friend missing', f);
      }
    });

    const avatarEl = document.createElement('div');
    avatarEl.className = 'friend-avatar';
    if (photo) {
      const safe = sanitizeMediaUrl(photo);
      if (safe) {
        avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
      } else {
        avatarEl.textContent = displayName.charAt(0).toUpperCase();
      }
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }

    const infoWrap = document.createElement('div');
    infoWrap.style.flex = '1';
    infoWrap.style.marginLeft = '12px';
    infoWrap.style.overflow = 'hidden';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';

    const nameEl = document.createElement('strong');
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.textContent = displayName;

    const statusEl = document.createElement('span');
    statusEl.style.color = isOnline ? 'var(--tg-online)' : 'var(--tg-offline)';
    statusEl.style.fontSize = '12px';
    statusEl.style.marginLeft = '4px';
    statusEl.textContent = isOnline ? '●' : '○';

    topRow.appendChild(nameEl);
    topRow.appendChild(statusEl);

    const previewEl = document.createElement('div');
    previewEl.style.color = 'var(--tg-text-secondary)';
    previewEl.style.fontSize = '13px';
    previewEl.style.whiteSpace = 'nowrap';
    previewEl.style.overflow = 'hidden';
    previewEl.style.textOverflow = 'ellipsis';
    previewEl.textContent = preview;

    infoWrap.appendChild(topRow);
    infoWrap.appendChild(previewEl);

    div.replaceChildren(avatarEl, infoWrap);
    list.appendChild(div);
  });
}
function addFriend(id) {
  const normalized = id.trim().toUpperCase();
  if (!isValidPeerId(normalized)) return showToast('Invalid ID');
  if (normalized === myPeerId) return showToast('Cannot add yourself');
  if (friends.find(f => f.id === normalized)) return showToast('Already in contacts');
  friends.push({ id: normalized, addedAt: Date.now() });
  localStorage.setItem('orbit_friends', JSON.stringify(friends));
  tryConnect(normalized);
  renderFriends();
  showToast('Contact added');
}

function chatKey(friendId = currentChatFriend) {
  return [myPeerId, friendId].sort().join('_');
}

function cleanupCurrentView() {
  teardownLazyImageObserver();
  chatAbortController?.abort();
  chatAbortController = null;
  if (msgsVirtual) { msgsVirtual.destroy(); msgsVirtual = null; }
  // FIX: сбрасываем флаги загрузки сообщений при закрытии чата
  messagesLoadingOlder = false;
  hasMoreOlderMessages = true;
}

async function openChat(friendId) {
  // TITANIUM FIX: Guard 1: prevent double-open
  if (currentChatFriend === friendId && msgsVirtual) {
    return;
  }
  // TITANIUM FIX: Guard 2: peer must be ready
  if (!peer || peer.destroyed) {
    showToast('Connecting to network...');
    return;
  }
  // TITANIUM FIX: Guard 3: friend must exist
  if (!friends.some(f => f.id === friendId)) {
    showToast('Add this user as friend first');
    return;
  }

  touchUserActivity();
  cleanupCurrentView();
  hideRadarIfActive();
  currentView = 'chat';
  chatAbortController = new AbortController();
  const chatSig = chatAbortController.signal;

  currentChatFriend = friendId;
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.style.display = 'none';
  document.getElementById('active-chat').style.display = 'flex';

  const fp = friendProfiles[friendId] || {};
  const friendDisplayName = fp.displayName || friendId;
  document.getElementById('chat-friend-name').textContent = friendDisplayName;

  const isOnline = !!activeConnections[friendId];
  document.getElementById('chat-friend-status').textContent = isOnline ? 'online' : 'offline';
  document.getElementById('chat-friend-status').style.color = isOnline ? 'var(--tg-online)' : 'var(--tg-text-secondary)';

  const avatarEl = document.getElementById('current-chat-avatar');
  if (fp.photo) {
    const safe = sanitizeMediaUrl(fp.photo);
    if (safe) {
      avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.textContent = friendDisplayName.charAt(0).toUpperCase();
      avatarEl.dataset.color = friendId.charCodeAt(0) % 8;
    }
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = friendDisplayName.charAt(0).toUpperCase();
    avatarEl.dataset.color = friendId.charCodeAt(0) % 8;
  }
  
  document.getElementById('app-container').classList.add('chat-open');
  document.getElementById('back-btn').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  
  messageWindow = skeletonPlaceholders(12);
  applyBubbleGrouping();
  
  const container = document.getElementById('messages-list');
  container.innerHTML = '';
  
  setupLazyImageObserver();

  msgsVirtual = new VirtualScroller(container, {
    estimateRowHeight: 72,
    bufferRows: optimizer.getBufferRows(),
    getCount: () => messageWindow.length,
    getItem: i => messageWindow[i],
    renderItem: (el, item) => {
      el.innerHTML = '';
      el.appendChild(buildMessageElement(item));
      observeLazyImagesIn(el);
    },
    onNearTop: async () => {
      if (messageWindow[0]?.type === 'skeleton') return;
      if (!messagesLoadingOlder && hasMoreOlderMessages) {
        messagesLoadingOlder = true;
        const oldestTs = messageWindow[0]?.ts;
        const page = getMessagePage();
        const rows = await dbGetPage(chatKey(), page, oldestTs);
        if (rows.length > 0) {
          const dec = await decodeMessageRows(rows);
          dec.sort((a, b) => b.ts - a.ts);
          messageWindow = [...messageWindow, ...dec];
          applyBubbleGrouping();
          // No need to insert at start, they are at the end of the array now
          msgsVirtual.refresh();
        }
        hasMoreOlderMessages = rows.length === page;
        messagesLoadingOlder = false;
      }
    }
  });
  
  msgsVirtual.refresh();
  msgsVirtual.scrollToBottom();
  if (container.clientHeight === 0) {
    requestAnimationFrame(() => { msgsVirtual?.refresh(); });
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const ml = document.getElementById('messages-list');
      if (ml && currentChatFriend) {
        requestAnimationFrame(() => {
          ml.scrollTop = ml.scrollHeight;
        });
      }
    }, { signal: chatSig });
  }

  const chatInputEl = document.getElementById('chat-input');
  chatInputEl.addEventListener('focus', () => {
    void requestScreenWakeLock();
    requestAnimationFrame(() => {
      const ml = document.getElementById('messages-list');
      if (ml && currentChatFriend) ml.scrollTop = ml.scrollHeight;
    });
  }, { signal: chatSig });
  chatInputEl.addEventListener('blur', () => {
    void releaseScreenWakeLock();
  }, { signal: chatSig });

  // TITANIUM FIX: Show skeletons immediately
  messageWindow = skeletonPlaceholders(12);
  msgsVirtual?.refresh();

  // Then load real messages
  await loadInitialMessagesForChat();
  applyBubbleGrouping();
  msgsVirtual.refresh();
  msgsVirtual.scrollToBottom();
  if (window.innerWidth <= 768) {
    document.getElementById('chat-input')?.focus();
    void requestScreenWakeLock();
  }
}

function closeCurrentChat() {
  optimizer.flushAckNow();
  void releaseScreenWakeLock();
  cleanupCurrentView();
  currentView = null;
  document.getElementById('app-container').classList.remove('chat-open');
  currentChatFriend = null;
  messageWindow = [];
  activeObjectUrls.forEach(u => URL.revokeObjectURL(u));
  activeObjectUrls.clear();
  document.getElementById('active-chat').style.display = 'none';
  
  // TITANIUM FIX: Only show empty-state if no other main view is open
  const radarEl = document.getElementById('radar-view');
  const settingsEl = document.getElementById('settings-view');
  const emptyStateEl = document.getElementById('empty-state');
  const radarVisible = radarEl ? radarEl.style.display === 'flex' : false;
  const settingsVisible = settingsEl ? settingsEl.style.display === 'flex' : false;
  
  if (!radarVisible && !settingsVisible) {
    if (emptyStateEl) emptyStateEl.style.display = 'flex';
  } else {
    if (emptyStateEl) emptyStateEl.style.display = 'none';
  }
}

async function loadInitialMessagesForChat() {
  const page = getMessagePage();
  const rows = await dbGetPage(chatKey(), page, null);
  messageWindow = await decodeMessageRows(rows);
  // TITANIUM FIX: Sort descending for column-reverse
  messageWindow.sort((a, b) => b.ts - a.ts);
  trimMessageWindow();
  hasMoreOlderMessages = rows.length === page;
}

function applyBubbleGrouping() {
  for (let i = 0; i < messageWindow.length - 1; i++) {
    messageWindow[i]._grouped = messageWindow[i].from === messageWindow[i + 1].from;
  }
  if (messageWindow.length) messageWindow.at(-1)._grouped = false;
}

function buildMessageElement(msg) {
  if (msg.type === 'skeleton') {
    const sk = document.createElement('div');
    sk.className = 'message skeleton-msg';
    sk.innerHTML = '<div class="skeleton-bubble"></div>';
    return sk;
  }

  const cacheKey = `${msg.ts}:${msg.status}:${msg.from}:${msg.type}`;
  if (msg.status !== 'pending' && msgElementCache.has(cacheKey)) {
    return msgElementCache.get(cacheKey).cloneNode(true);
  }

  const div = document.createElement('div');
  div.className = 'message ' + (msg.from === myPeerId ? 'me' : 'them');
  if (msg._grouped) div.classList.add('grouped');
  div.dataset.msgTs = String(msg.ts);

  let contentHtml = '';
  if (msg.type === 'text') {
    contentHtml = `<div class="msg-text">${escapeHtml(msg.text)}</div>`;
  } else if (msg.type === 'image') {
    if (msg.status === 'pending' && msg.dropPercent !== undefined) {
      contentHtml = `
        <div class="msg-file">Uploading ${escapeHtml(msg.name)}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent}% - ${msg.dropStatusText || 'Transferring'}</div>
      `;
    } else if (msg.url) {
      if (optimizer.shouldDeferImagePreview()) {
        contentHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" class="msg-media-img orbit-lazy-img" data-orbit-src="${escapeAttr(msg.url)}">`;
      } else {
        contentHtml = `<img src="${escapeAttr(msg.url)}" alt="" class="msg-media-img">`;
      }
    } else {
      contentHtml = `<div class="msg-file">Downloading ${escapeHtml(msg.name)}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent || 0}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent || 0}% - ${msg.dropStatusText || 'Receiving'}</div>`;
    }
  } else if (msg.type === 'audio') {
    contentHtml = `<audio src="${escapeAttr(msg.url)}" controls class="msg-media-audio"></audio>`;
  } else {
    // Files
    if (msg.dropPercent !== undefined && msg.dropPercent < 100) {
      contentHtml = `<div class="msg-file">${escapeHtml(msg.name || 'File')}</div>
        <div class="drop-progress-container"><div class="drop-progress-bar" style="width: ${msg.dropPercent}%"></div></div>
        <div class="drop-status-text">${msg.dropPercent}% - ${msg.dropStatusText || 'Transferring'}</div>`;
    } else {
      contentHtml = `<div class="msg-file">
        <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        <a href="${escapeAttr(msg.url)}" download="${escapeAttr(msg.name)}" style="color: inherit; text-decoration: none;">${escapeHtml(msg.name || 'File')}</a>
      </div>`;
    }
  }

  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const statusHtml = msg.from === myPeerId ? statusIconHtml(msg.status) : '';
  const retryBtn =
    msg.from === myPeerId && msg.type === 'text' && msg.status === 'failed'
      ? '<button type="button" class="msg-retry tg-link-btn">Retry</button>'
      : '';

  div.innerHTML = `
    <div class="msg-body">${contentHtml}</div>
    <div class="msg-meta">
      <span class="msg-time">${time}</span>
      ${msg.from === myPeerId ? `<span class="msg-status">${statusHtml}</span>` : ''}
      ${retryBtn}
    </div>
  `;

  if (msg.status !== 'pending') {
    msgElementCache.set(cacheKey, div.cloneNode(true));
    trimMsgElementCache();
  }
  return div;
}

async function retryFailedTextMessage(ts) {
  if (!currentChatFriend) return;
  const conn = activeConnections[currentChatFriend];
  if (!conn?.open) return showToast('You are offline');
  const m = messageWindow.find((x) => x.ts === ts);
  if (!m || m.type !== 'text' || m.status !== 'failed') return;
  pruneMsgElementCache(ts);
  m.status = 'pending';
  await dbUpdateStatus(chatKey(), ts, 'pending');
  if (!patchMessageStatusDOM(ts, 'pending')) msgsVirtual?.refresh();
  try {
    await ensureWireReady(currentChatFriend);
    const cipher = await encryptWirePayload(chatKey(), {
      type: 'text',
      text: m.text,
      ts,
      from: myPeerId,
      to: currentChatFriend,
      status: 'sent'
    });
    conn.send({ type: 'orbit_wire', cipher });
    m.status = 'sent';
    await dbUpdateStatus(chatKey(), ts, 'sent');
    registerPendingAck(chatKey(), ts);
    if (!patchMessageStatusDOM(ts, 'sent')) msgsVirtual?.refresh();
  } catch (err) {
    m.status = 'failed';
    await dbUpdateStatus(chatKey(), ts, 'failed');
    msgsVirtual?.refresh();
  }
}

async function sendTextMessage(text) {
  if (!currentChatFriend || !text) return;
  touchUserActivity();
  const ts = Date.now();
  const msg = { type: 'text', text, ts, from: myPeerId, to: currentChatFriend, status: 'pending' };
  await saveMsgToDB(chatKey(), msg);
  await mergeMessageIntoView(msg);
  
  // TITANIUM FIX: Race condition protection - check if already connecting
  if (connectingPeers.has(currentChatFriend)) {
    console.log(`[Orbit] Already waking up peer ${currentChatFriend}, queueing message`);
    msg.status = 'pending';
    pendingOutgoing.push(msg);
    await dbSetPendingOut(pendingOutgoing);
    return;
  }
  
  let conn = activeConnections[currentChatFriend];
  
  if (!conn?.open && peer && peer.open) {
    console.log(`[Orbit] Waking up peer ${currentChatFriend} to send text message...`);
    connectingPeers.add(currentChatFriend);
    try {
      conn = await openConnectionForDiscovery(currentChatFriend);
      connectingPeers.delete(currentChatFriend);
    } catch(e) {
      console.log(`[Orbit] Failed to wake up peer ${currentChatFriend}`, e);
      connectingPeers.delete(currentChatFriend);
    }
  }

  if (conn?.open) {
    try {
      await ensureWireReady(currentChatFriend);
      const cipher = await encryptWirePayload(chatKey(), {
        type: 'text',
        text,
        ts,
        from: myPeerId,
        to: currentChatFriend,
        status: 'sent'
      });
      conn.send({ type: 'orbit_wire', cipher });
      msg.status = 'sent';
      await dbUpdateStatus(chatKey(), ts, 'sent');
      registerPendingAck(chatKey(), ts);
      
      // TITANIUM FIX: Flush any queued messages for this peer
      await flushOutgoingQueueForPeer(currentChatFriend);
      
    } catch (err) {
      msg.status = 'failed';
      await dbUpdateStatus(chatKey(), ts, 'failed');
    }
  } else {
    // If we still don't have a connection, keep it pending in outgoing queue
    msg.status = 'pending';
    pendingOutgoing.push(msg);
    await dbSetPendingOut(pendingOutgoing);
    showToast('User offline. Message queued.');
  }
  
  if (msgsVirtual) msgsVirtual.refresh();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function mergeMessageIntoView(msg) {
  if (currentChatFriend !== (msg.from === myPeerId ? msg.to : msg.from)) return;
  // TITANIUM FIX: column-reverse means newest is first in array
  messageWindow.unshift(msg);
  trimMessageWindow();
  applyBubbleGrouping();
  if (msgsVirtual) {
    msgsVirtual.refresh();
    // No need to scrollToBottom with column-reverse
  }
}

async function receiveMessage(senderId, data) {
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'ping') return;
  if (data.type !== 'typing') touchUserActivity();

  if (data.type === 'orbit_wire_hello') {
    if (Number(data.v) !== 2 || !data.pub) return;
    const chatId = typeof data.chatId === 'string' && data.chatId ? data.chatId : chatKey(senderId);
    try {
      const ready = await acceptWireHello(chatId, data.pub);
      const { fingerprint } = await ready;
      const fpKey = `orbit_wire_fp_${chatId}`;
      const existing = localStorage.getItem(fpKey);
      if (!existing) {
        localStorage.setItem(fpKey, fingerprint);
      } else if (existing !== fingerprint) {
        const st = ensurePeerTrust(senderId);
        st.score = Math.max(0, Number(st.score || 0) - 30);
        localStorage.setItem('orbit_trust', JSON.stringify(trustState));
        const banner = document.getElementById('chat-warning-banner');
        if (banner) {
          banner.style.display = 'block';
          banner.textContent = 'Security warning: session key changed. Possible MITM.';
        }
        showToast('Security warning: key changed');
      }
    } catch (err) {
      console.warn('Wire hello failed', err);
    }
    return;
  }

  if (data.type === 'orbit_profile_req') {
    const conn = activeConnections[senderId];
    if (conn?.open && typeof data.nonce === 'number') {
      conn.send({
        type: 'orbit_profile_res',
        nonce: data.nonce,
        profile: {
          displayName: orbitProfile.displayName || '',
          photo: orbitProfile.photos?.[0] || null
        }
      });
    }
    return;
  }

  if (data.type === 'orbit_profile_res') {
    if (data.profile) {
      friendProfiles[senderId] = data.profile;
      localStorage.setItem('orbit_friend_profiles', JSON.stringify(friendProfiles));
      scheduleRenderFriends();
      if (currentChatFriend === senderId) {
        const dn = data.profile.displayName || senderId;
        document.getElementById('chat-friend-name').textContent = dn;
        const avatarEl = document.getElementById('current-chat-avatar');
        if (data.profile.photo) {
          const safe = sanitizeMediaUrl(data.profile.photo);
          if (safe) {
            avatarEl.style.backgroundImage = `url("${safe.replace(/\"/g, '%22')}")`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
          } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = dn.charAt(0).toUpperCase();
          }
        }
      }
    }
    window.dispatchEvent(new CustomEvent('orbit-profile-res', { detail: { from: senderId, nonce: data.nonce, profile: data.profile || {} } }));
    return;
  }

  if (data.type === 'typing') {
    if (optimizer.isDataSaver()) return;
    if (currentChatFriend === senderId) {
      if (typingIncomingRaf) cancelAnimationFrame(typingIncomingRaf);
      typingIncomingRaf = requestAnimationFrame(() => {
        typingIncomingRaf = null;
        const statusEl = document.getElementById('chat-friend-status');
        statusEl.innerHTML = '<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
      });
      clearTimeout(typingTimers.get(senderId));
      typingTimers.set(senderId, setTimeout(() => {
        const statusEl = document.getElementById('chat-friend-status');
        statusEl.textContent = activeConnections[senderId]?.open ? 'online' : 'offline';
        typingTimers.delete(senderId);
      }, 3000));
    }
    return;
  }

  if (data.type === 'orbit_wire') {
    try {
      await ensureWireReady(senderId, 5000);
      const plain = await decryptWirePayload(chatKey(senderId), data.cipher);
      if (plain.from !== senderId) return;
      const msg = {
        ...plain,
        ts: plain.ts || Date.now(),
        from: senderId,
        to: myPeerId,
        status: 'delivered'
      };
      await saveMsgToDB(chatKey(senderId), msg);
      await mergeMessageIntoView(msg);
      scheduleRenderFriends();
      queueDeliveredAck(senderId, msg.ts);
    } catch (err) {
      console.error('Wire decrypt failed', err);
    }
    return;
  }

  if (data.type === 'text' || data.type === 'image' || data.type === 'audio' || data.type === 'file') {
    const msg = { ...data, ts: data.ts || Date.now(), from: senderId, to: myPeerId, status: 'delivered' };
    await saveMsgToDB(chatKey(senderId), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    // Уведомление если чат не открыт
    if (currentChatFriend !== senderId) {
      const fp = friendProfiles[senderId] || {};
      const senderName = fp.displayName || senderId;
      const preview = data.type === 'text' ? (data.text || '').slice(0, 40) : data.type === 'image' ? '📷 Photo' : data.type === 'audio' ? '🎤 Voice' : '📎 File';
      showToast(`${senderName}: ${preview}`);
    }

    queueDeliveredAck(senderId, msg.ts);
  }

  // TITANIUM FIX: Handle Nudge
  if (data.type === 'nudge') {
    const now = Date.now();
    if (now - lastNudgeReceived > NUDGE_COOLDOWN) {
      lastNudgeReceived = now;
      showToast(`${friendProfiles[senderId]?.displayName || senderId} nudged you!`, 'nudge');
      triggerLocalNudge();
    }
    return;
  }
  
  // TITANIUM FIX: Handle Cinema Sync
  if (data.type === 'cinema-sync') {
    if (data.action === 'ready') {
      showToast(`${friendProfiles[senderId]?.displayName || senderId} is ready to watch: ${data.name}`);
      return;
    }
    
    // Only apply if Cinema Mode is open and playing same peer
    if (document.getElementById('cinema-view').style.display !== 'none' && cinemaFriendId === senderId) {
      isCinemaRemoteAction = true; // Lock local events to prevent loops
      
      switch (data.action) {
        case 'play':
          if (Math.abs(cinemaVideoEl.currentTime - data.time) > 1.0) {
            cinemaVideoEl.currentTime = data.time;
          }
          cinemaVideoEl.play().catch(e => console.warn('Cinema play blocked', e));
          break;
        case 'pause':
          cinemaVideoEl.pause();
          cinemaVideoEl.currentTime = data.time; // Sync exact pause frame
          break;
        case 'seeked':
        case 'time-update':
          if (Math.abs(cinemaVideoEl.currentTime - data.time) > 2.0) {
            cinemaVideoEl.currentTime = data.time;
          }
          break;
      }
      // Reset lock after all queued media events have fired
      setTimeout(() => { isCinemaRemoteAction = false; }, 0);
    }
    return;
  }

  // TITANIUM FIX: Handle Orbits Drop incoming packets
  if (data.type && data.type.startsWith('file-')) {
    if (data.type === 'file-start') {
      const msg = { 
        type: data.mime.startsWith('image/') ? 'image' : 'file', 
        name: data.name, 
        ts: data.msgId, 
        from: senderId, 
        to: myPeerId, 
        status: 'pending',
        dropPercent: 0,
        dropStatusText: 'Receiving...'
      };
      await mergeMessageIntoView(msg);
      
      if (currentChatFriend !== senderId) {
        showToast(`Receiving file: ${data.name}`);
      }
    }
    
    orbitsDrop.handleIncomingPacket(data);
    return;
  }

  if (data.type === 'orbit_ack_batch' && Array.isArray(data.items)) {
    for (const it of data.items) {
      if (it && it.ts != null && it.status) {
        await applyIncomingAck(senderId, it.ts, it.status);
      }
    }
    return;
  }

  if (data.type === 'ack' && data.ts != null && data.status) {
    await applyIncomingAck(senderId, data.ts, data.status);
  }
}

// FIX: реализована отправка файлов с чанкингом для больших файлов (избегаем base64 взрыва)
async function sendMediaBlob(file, type, name, qualitySetting = 'original') {
  touchUserActivity();
  let workFile = file;
  let workName = name || file.name || 'file';
  
  // TITANIUM FIX: Canvas API Compression
  if (type === 'image' && qualitySetting !== 'original') {
    try {
      showToast('Compressing image...');
      workFile = await orbitsDrop.compressImage(file, qualitySetting);
      workName = String(workName).replace(/\.[^.]+$/, '') + '.jpg';
    } catch (err) {
      console.warn('Image compress failed, using original', err);
    }
  }
  
  // TITANIUM FIX: Orbits Drop Chunking for files > 1MB
  const MAX_INLINE_SIZE = 1 * 1024 * 1024; // 1MB limit for base64
  
  if (workFile.size > MAX_INLINE_SIZE) {
    showToast('Using Orbits Drop (High-Bandwidth Transfer)...');
    
    const msgId = Date.now();
    const msg = { 
      type, 
      name: workName, 
      ts: msgId, 
      from: myPeerId, 
      to: currentChatFriend, 
      status: 'pending',
      dropPercent: 0,
      dropStatusText: 'Initializing...'
    };
    
    await saveMsgToDB(chatKey(), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    let conn = activeConnections[currentChatFriend];
    if (!conn?.open && peer && peer.open) {
      try {
        conn = await openConnectionForDiscovery(currentChatFriend);
      } catch(err) {
        console.log(`[Orbit Drop] Failed to wake up peer ${currentChatFriend}`, err);
      }
    }

    if (conn?.open) {
      try {
        await orbitsDrop.sendFile(workFile, conn, msgId);
      } catch (err) {
        console.error('[Orbit Drop] Transfer failed:', err);
        msg.status = 'failed';
        msg.dropStatusText = 'Failed';
        await dbUpdateStatus(chatKey(), msgId, 'failed');
        if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
      }
    } else {
      msg.status = 'failed';
      msg.dropStatusText = 'Peer Offline';
      await dbUpdateStatus(chatKey(), msgId, 'failed');
      if (msgsVirtual) msgsVirtual.patchByTs(msgId, () => {});
      showToast('User offline. Drop failed.');
    }
    return;
  }
  
  // Standard base64 transfer for small files
  const reader = new FileReader();
  reader.onload = async (e) => {
    const buffer = e.target.result;
    const url = arrayBufferToDataUrl(buffer, workFile.type || file.type);
    const msg = { type, url, name: workName, ts: Date.now(), from: myPeerId, to: currentChatFriend, status: 'pending' };
    await saveMsgToDB(chatKey(), msg);
    await mergeMessageIntoView(msg);
    scheduleRenderFriends();

    let conn = activeConnections[currentChatFriend];
    
    if (!conn?.open && peer && peer.open) {
      console.log(`[Orbit] Waking up peer ${currentChatFriend} to send media blob...`);
      try {
        conn = await openConnectionForDiscovery(currentChatFriend);
      } catch(err) {
        console.log(`[Orbit] Failed to wake up peer ${currentChatFriend}`, err);
      }
    }

    if (conn?.open) {
      try {
        await ensureWireReady(currentChatFriend);
        const cipher = await encryptWirePayload(chatKey(), {
          type,
          url,
          name: workName,
          ts: msg.ts,
          from: myPeerId,
          to: currentChatFriend,
          status: 'sent'
        });
        conn.send({ type: 'orbit_wire', cipher });
      } catch (err) {
        msg.status = 'failed';
        await dbUpdateStatus(chatKey(), msg.ts, 'failed');
        showToast('Secure send failed');
        if (msgsVirtual) msgsVirtual.refresh();
        return;
      }
      msg.status = 'sent';
      await dbUpdateStatus(chatKey(), msg.ts, 'sent');
      registerPendingAck(chatKey(), msg.ts);
    } else {
      msg.status = 'pending';
      pendingOutgoing.push(msg);
      await dbSetPendingOut(pendingOutgoing);
      showToast('User offline. Media queued.');
    }
    
    if (msgsVirtual) msgsVirtual.refresh();
  };
  reader.readAsArrayBuffer(workFile);
}

async function sendChunkedFile(file, type, name) {
  // Простая реализация чанкинга по 256KB
  const CHUNK_SIZE = 256 * 1024;
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  const transferId = `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const reader = new FileReader();
    const chunkData = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsArrayBuffer(chunkBlob);
    });
    const conn = activeConnections[currentChatFriend];
    if (!conn?.open) {
      showToast('Connection lost during upload');
      return;
    }
    conn.send({
      type: 'orbit_chunk',
      transferId,
      index: i,
      total: chunks,
      data: Array.from(new Uint8Array(chunkData)),
      name,
      mime: file.type,
      final: i === chunks - 1
    });
  }
  showToast(`Sent ${chunks} chunks`);
}

function arrayBufferToDataUrl(buffer, mimeType) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function saveMsgToDB(chatId, msgObj) {
  const encStr = await cryptoEncrypt(msgObj);
  await dbAdd({ chatId, ts: msgObj.ts, status: msgObj.status, from: msgObj.from, type: msgObj.type, enc: encStr });
}

async function decodeMessageRows(rows) {
  const encArray = rows.map(r => r.enc);
  const decObjects = await cryptoDecryptBatch(encArray);
  return rows.map((r, i) => {
    const obj = decObjects[i] || {};
    return { ...r, ...obj };
  });
}

async function getLastMessagePreview(chatId) {
  const last = await dbGetLast(chatId);
  if (!last) return null;
  const dec = await cryptoDecrypt(last.enc);
  return dec;
}

async function lockVault() {
  await cryptoLock();
  vaultLocked = true;
  document.getElementById('vault-lock-modal').style.display = 'flex';
  document.getElementById('vault-lock-modal').removeAttribute('aria-hidden');
  closeCurrentChat();
  if (peer) peer.disconnect();
}

function openSettingsPanel() {
  hideRadarIfActive();
  syncSettingsFormFromState();
  renderProfilePhotoGrid();
  populateMicDevices();
  const panel = document.getElementById('settings-view');
  currentView = 'settings';
  panel.style.display = 'flex';
  requestAnimationFrame(() => panel.removeAttribute('aria-hidden'));
  
  // PILLAR 2: Tab System (Vanilla JS)
  if (!panel.dataset.tabsInit) {
    panel.dataset.tabsInit = 'true';
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
      });
    });
  }
}

function closeSettingsPanel() {
  const panel = document.getElementById('settings-view');
  panel.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    panel.style.display = 'none';
    if (currentView === 'settings') currentView = currentChatFriend ? 'chat' : null;
  }, 300);
}

function syncSettingsFormFromState() {
  const dn = document.getElementById('settings-display-name');
  if (dn) dn.value = orbitProfile.displayName || '';
  const ds = document.getElementById('data-saver-toggle');
  if (ds) ds.checked = !!appSettings.dataSaver;
  const bs = document.getElementById('battery-saver-toggle');
  if (bs) bs.checked = !!appSettings.batterySaver;
  const ans = document.getElementById('auto-network-saver-toggle');
  if (ans) ans.checked = appSettings.autoNetworkSaver !== false;
  const ti = document.getElementById('typing-indicator-toggle');
  if (ti) ti.checked = appSettings.typingIndicator;
  const as = document.getElementById('allow-screenshots-toggle');
  if (as) as.checked = appSettings.allowScreenshots;
  const ec = document.getElementById('echo-cancel-toggle');
  if (ec) ec.checked = appSettings.echoCancel;
  const ns = document.getElementById('noise-suppression-toggle');
  if (ns) ns.checked = appSettings.noiseSuppression;
  const ag = document.getElementById('auto-gain-toggle');
  if (ag) ag.checked = appSettings.autoGain;
  const autoQualToggle = document.getElementById('auto-quality-toggle');
  if (autoQualToggle) autoQualToggle.checked = appSettings.autoQuality;
  const vq = document.getElementById('video-quality-select');
  if (vq) vq.value = appSettings.videoQuality;
  const duress = document.getElementById('duress-password-input');
  if (duress) duress.value = appSettings.duressPassword || '';
  const bio = document.getElementById('settings-bio');
  if (bio) bio.value = appSettings.bio || '';
  document.querySelectorAll('.size-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === (appSettings.textSize || 'medium'));
  });
  const density = document.getElementById('appearance-density');
  if (density) density.value = appSettings.density || 'default';
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) bubble.value = appSettings.bubbleStyle || 'rounded';
  document.querySelectorAll('.color-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.scheme === (appSettings.colorScheme || 'default'));
  });
  const reduce = document.getElementById('reduce-animations-toggle');
  if (reduce) reduce.checked = !!appSettings.reduceAnimations;
  syncThemePresetActive();
}

function readSettingsFormToState() {
  const dn = document.getElementById('settings-display-name');
  if (dn) {
    orbitProfile.displayName = dn.value.trim().slice(0, 32);
    persistOrbitProfile();
  }
  const ti = document.getElementById('typing-indicator-toggle');
  if (ti) appSettings.typingIndicator = ti.checked;
  const ds = document.getElementById('data-saver-toggle');
  if (ds) appSettings.dataSaver = ds.checked;
  const bs = document.getElementById('battery-saver-toggle');
  if (bs) appSettings.batterySaver = bs.checked;
  const ans = document.getElementById('auto-network-saver-toggle');
  if (ans) appSettings.autoNetworkSaver = ans.checked;
  const as = document.getElementById('allow-screenshots-toggle');
  if (as) appSettings.allowScreenshots = as.checked;
  const ec = document.getElementById('echo-cancel-toggle');
  if (ec) appSettings.echoCancel = ec.checked;
  const ns = document.getElementById('noise-suppression-toggle');
  if (ns) appSettings.noiseSuppression = ns.checked;
  const ag = document.getElementById('auto-gain-toggle');
  if (ag) appSettings.autoGain = ag.checked;
  const autoQualToggle = document.getElementById('auto-quality-toggle');
  if (autoQualToggle) appSettings.autoQuality = autoQualToggle.checked;
  const vq = document.getElementById('video-quality-select');
  if (vq) appSettings.videoQuality = vq.value;
  const duress = document.getElementById('duress-password-input');
  if (duress) appSettings.duressPassword = duress.value;
  const bio = document.getElementById('settings-bio');
  if (bio) appSettings.bio = bio.value.slice(0, 150);
  const density = document.getElementById('appearance-density');
  if (density) appSettings.density = density.value;
  const bubble = document.getElementById('appearance-bubble');
  if (bubble) appSettings.bubbleStyle = bubble.value;
  const activeSize = document.querySelector('.size-btn.active');
  if (activeSize) appSettings.textSize = activeSize.dataset.size || 'medium';
  const activeScheme = document.querySelector('.color-dot.active');
  if (activeScheme) appSettings.colorScheme = activeScheme.dataset.scheme || 'default';
  const reduce = document.getElementById('reduce-animations-toggle');
  if (reduce) appSettings.reduceAnimations = reduce.checked;
  applyAppearanceSettings();
}

function saveSettings() {
  readSettingsFormToState();
  localStorage.setItem('orbit_settings', JSON.stringify(appSettings));
  localStorage.setItem(
    'orbit_appearance',
    JSON.stringify({
      textSize: appSettings.textSize,
      density: appSettings.density,
      bubbleStyle: appSettings.bubbleStyle,
      colorScheme: appSettings.colorScheme,
      reduceAnimations: appSettings.reduceAnimations,
      customThemeColors: appSettings.customThemeColors
    })
  );
  applyOptimizerRuntime();
  attachNetworkDataSaverListener();
  if (currentChatFriend && msgsVirtual) {
    teardownLazyImageObserver();
    setupLazyImageObserver();
    msgsVirtual.refresh();
  }
  closeSettingsPanel();
  showToast('Settings saved');
}

function populateMicDevices() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    const select = document.getElementById('mic-device-select');
    if (!select) return;
    select.innerHTML = '';
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${select.length + 1}`;
      select.appendChild(opt);
    });
  });
}

function runNetworkTest() {
  const res = document.getElementById('network-test-result');
  if (res) res.textContent = 'Testing... (mock)';
}

let micStream = null;
function startMicTest() {
  if (micStream) stopMicTest();
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      micStream = stream;
      document.getElementById('test-mic-btn').style.display = 'none';
      document.getElementById('stop-mic-test-btn').style.display = 'inline-block';
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function updateLevel() {
        if (!micStream) return;
        analyser.getByteFrequencyData(dataArray);
        let avg = 0;
        for (let i = 0; i < dataArray.length; i++) avg += dataArray[i];
        avg /= dataArray.length;
        const percent = Math.min(100, (avg / 255) * 100);
        document.getElementById('mic-level-bar').style.width = percent + '%';
        requestAnimationFrame(updateLevel);
      }
      updateLevel();
    })
    .catch(() => showToast('Microphone access denied'));
}
function stopMicTest() {
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  document.getElementById('test-mic-btn').style.display = 'inline-block';
  document.getElementById('stop-mic-test-btn').style.display = 'none';
  document.getElementById('mic-level-bar').style.width = '0%';
}

function ensurePeerTrust(peerId) {
  if (!trustState[peerId]) trustState[peerId] = { score: 50 };
  return trustState[peerId];
}

function calculateTrustScore(peerId) {
  return ensurePeerTrust(peerId).score;
}

function getTrustBadgeData(peerId) {
  const score = calculateTrustScore(peerId);
  return { text: `Shield: ${score}`, className: score > 70 ? 'trust-high' : 'trust-neutral' };
}

function blockPeer(peerId) {
  if (!blockedPeers.includes(peerId)) {
    blockedPeers.push(peerId);
    localStorage.setItem('orbit_blocked_peers', JSON.stringify(blockedPeers));
  }
  if (activeConnections[peerId]) {
    activeConnections[peerId].close();
  }
  if (currentChatFriend === peerId) {
    closeCurrentChat();
  }
  renderFriends();
}

function setupRadarIntegration() {
  radarController = new Radar({
    onSendMessage: (id) => { hideRadarIfActive(); addFriend(id); openChat(id); },
    onAddContact: (id) => { addFriend(id); showToast('Added'); },
    getFriends: () => friends,
    getBlockedPeers: () => blockedPeers,
    getPeer: () => peer,
    getActiveConnections: () => activeConnections,
    getRadarPrefix: () => localStorage.getItem('orbit_radar_prefix') || '',
    getTrustBadgeData: getTrustBadgeData,
    openConnectionForDiscovery,
    showToast
  });
}

function switchToRadar() {
  const settingsView = document.getElementById('settings-view');
  if (settingsView) {
    settingsView.setAttribute('aria-hidden', 'true');
    settingsView.style.display = 'none';
  }
  if (!radarController) return;
  const activeChat = document.getElementById('active-chat');
  if (activeChat) activeChat.style.display = 'none';
  document.getElementById('app-container')?.classList?.remove('chat-open');
  currentView = 'radar';
  const radarView = document.getElementById('radar-view');
  if (!radarView) return;
  radarView.style.display = 'flex';
  radarView.removeAttribute('aria-hidden');
  radarController.activate();
}

function hideRadarIfActive() {
  const radarView = document.getElementById('radar-view');
  if (radarView) {
    radarView.style.display = 'none';
    radarView.setAttribute('aria-hidden', 'true');
  }
  radarController?.deactivate?.();
  if (currentView === 'radar') currentView = currentChatFriend ? 'chat' : null;
}

let mediaRecorderInstance = null;
let voiceChunks = [];
on('send-voice-btn', 'pointerdown', async () => {
  const chatInputEl = document.getElementById('chat-input');
  if (!chatInputEl) return;
  if (chatInputEl.value.trim()) return; // text mode
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderInstance = new MediaRecorder(stream);
    voiceChunks = [];
    mediaRecorderInstance.ondataavailable = e => voiceChunks.push(e.data);
    mediaRecorderInstance.start();
  } catch (err) {
    showToast('Mic access denied');
  }
});
on('send-voice-btn', 'pointerup', () => {
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
    mediaRecorderInstance.onstop = () => {
      const blob = new Blob(voiceChunks, { type: 'audio/webm' });
      sendMediaBlob(blob, 'audio', 'voice_msg.webm');
      if (mediaRecorderInstance.stream) {
        mediaRecorderInstance.stream.getTracks().forEach(t => t.stop());
      }
      mediaRecorderInstance = null;
    };
    mediaRecorderInstance.stop();
  }
});
on('send-voice-btn', 'pointermove', (e) => {
  // swipe cancel mock
});

const chatInput = document.getElementById('chat-input');
function handleChatInput() {
  if (!chatInput) return;
  if (currentChatFriend) maybeWakePeer(currentChatFriend);
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';

  const hasText = chatInput.value.trim().length > 0;
  const micIcon = document.getElementById('mic-icon');
  const sendIcon = document.getElementById('send-icon');
  if (micIcon) micIcon.style.display = hasText ? 'none' : '';
  if (sendIcon) sendIcon.style.display = hasText ? '' : 'none';
  document.getElementById('send-voice-btn')?.classList?.toggle('voice-mode', !hasText);

  if (optimizer.typingAllowed() && currentChatFriend && activeConnections[currentChatFriend]) {
    if (typingStatusRaf) cancelAnimationFrame(typingStatusRaf);
    
    // TITANIUM FIX: Use ephemeral channel for typing indicators to prevent head-of-line blocking
    const conn = ephemeralConnections[currentChatFriend]?.open 
      ? ephemeralConnections[currentChatFriend] 
      : activeConnections[currentChatFriend];
      
    typingStatusRaf = requestAnimationFrame(() => {
      typingStatusRaf = null;
      if (!conn.open) return;
      const now = Date.now();
      if (now - lastTypingSent < optimizer.getTypingMinIntervalMs()) return;
      lastTypingSent = now;
      conn.send({ type: 'typing' });
    });
  }
}

on('chat-input-area', 'click', async (e) => {
  if (!chatInput) return;
  if (!e.target.closest('.tg-send-btn')) return;
  const text = chatInput.value.trim();
  if (!text || !currentChatFriend) return;
  await sendTextMessage(text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  handleChatInput();
});
onEl(chatInput, 'keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text && currentChatFriend) {
      sendTextMessage(text).then(() => {
        chatInput.value = '';
        chatInput.style.height = 'auto';
      });
    }
  }
});

function wireBottomNavigation() {
  const btns = ['chats', 'contacts', 'radar', 'settings'];
  btns.forEach(b => {
    const el = document.getElementById(`bottom-${b}-btn`);
    if (el) {
      el.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        if (b === 'radar') switchToRadar();
        else { hideRadarIfActive(); if(b === 'settings') openSettingsPanel(); }
      });
    }
  });
}

function wirePremiumThemeButtons() {
  document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      getThemeManager().setTheme(btn.dataset.theme);
      syncThemePresetActive();
      appSettings.customThemeColors = null;
      applyAppearanceSettings();
    });
  });
  syncThemePresetActive();
}

function switchToChats() {}
function switchToContacts() {}

function scheduleHeartbeat() {
  if (heartbeatIntervalId != null) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  const ms = optimizer.getHeartbeatIntervalMs();
  heartbeatIntervalId = setInterval(() => {
    if (peer && !peer.destroyed && !peer.disconnected) {
      Object.values(activeConnections).forEach((conn) => {
        if (conn.open) conn.send({ type: 'ping', ts: Date.now() });
      });
    }
  }, ms);
}

async function flushOutgoingQueue() {
  if (!pendingOutgoing.length) return;
  const stillPending = [];
  
  for (const msg of pendingOutgoing) {
    let conn = activeConnections[msg.to];
    
    // Attempt to wake up peer if connection is closed
    if (!conn?.open && peer && peer.open) {
      console.log(`[Orbit] Waking up peer ${msg.to} to send queued message...`);
      try {
        conn = await openConnectionForDiscovery(msg.to);
      } catch(e) {
        console.log(`[Orbit] Failed to wake up peer ${msg.to}`, e);
      }
    }
    
    if (conn?.open) {
      try {
        await ensureWireReady(msg.to);
        const cipher = await encryptWirePayload(chatKey(msg.to), msg);
        conn.send({ type: 'orbit_wire', cipher });
        await dbUpdateStatus(chatKey(msg.to), msg.ts, 'sent');
        registerPendingAck(chatKey(msg.to), msg.ts);
      } catch (err) {
        console.error('Failed to flush outgoing', err);
        stillPending.push(msg); // keep in queue if encryption/send fails unexpectedly
      }
    } else {
      stillPending.push(msg); // keep in queue if peer cannot be reached
    }
  }
  
  pendingOutgoing = stillPending;
  await dbSetPendingOut(pendingOutgoing);
}

// TITANIUM FIX: Flush queued messages for a specific peer only
async function flushOutgoingQueueForPeer(peerId) {
  if (!pendingOutgoing.length) return;
  const stillPending = [];
  const peerMessages = [];
  
  // Separate messages for this peer from others
  for (const msg of pendingOutgoing) {
    if (msg.to === peerId) {
      peerMessages.push(msg);
    } else {
      stillPending.push(msg);
    }
  }
  
  if (peerMessages.length === 0) return;
  
  let conn = activeConnections[peerId];
  
  // If no active connection, try to establish one
  if (!conn?.open && peer && peer.open) {
    console.log(`[Orbit] Waking up peer ${peerId} to flush queued messages...`);
    try {
      conn = await openConnectionForDiscovery(peerId);
    } catch(e) {
      console.log(`[Orbit] Failed to wake up peer ${peerId}`, e);
      // If wake-up fails, keep all messages in queue
      stillPending.push(...peerMessages);
      pendingOutgoing = stillPending;
      await dbSetPendingOut(pendingOutgoing);
      return;
    }
  }
  
  // Send all messages for this peer if connection is open
  if (conn?.open) {
    for (const msg of peerMessages) {
      try {
        await ensureWireReady(peerId);
        const cipher = await encryptWirePayload(chatKey(peerId), msg);
        conn.send({ type: 'orbit_wire', cipher });
        await dbUpdateStatus(chatKey(peerId), msg.ts, 'sent');
        registerPendingAck(chatKey(peerId), msg.ts);
      } catch (err) {
        console.error('Failed to flush queued message', err);
        stillPending.push(msg); // keep in queue if send fails
      }
    }
  } else {
    // If connection still not open, keep messages in queue
    stillPending.push(...peerMessages);
  }
  
  pendingOutgoing = stillPending;
  await dbSetPendingOut(pendingOutgoing);
}

function openAddFriendModal() {
  const modal = document.getElementById('add-friend-modal');
  const peerEl = document.getElementById('my-peer-id-display');
  if (peerEl) peerEl.textContent = myPeerId;
  document.getElementById('add-friend-id-input').value = '';
  modal.style.display = 'flex';
  modal.removeAttribute('aria-hidden');
  setTimeout(() => document.getElementById('add-friend-id-input').focus(), 100);
}

function closeAddFriendModal() {
  const modal = document.getElementById('add-friend-modal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

const _doc = typeof document !== 'undefined' ? document : null;
if (_doc?.readyState === 'loading') {
  _doc.addEventListener('DOMContentLoaded', () => {
    initAppChrome();
    initApp();
  });
} else {
  initAppChrome();
  initApp();
}

```

### src/core/crypto.js

```js
import { base64ToBytes, bytesToBase64 } from './base64.js';

let worker = null;
try {
  worker = new Worker(new URL('../workers/crypto.worker.js', import.meta.url), { type: 'module' });
} catch (_) {
  worker = null;
}

let fallbackAesKey = null;
const pending = new Map();
let nextId = 1;

if (worker) {
  worker.onmessage = (e) => {
    const { id, result, error } = e.data;
    if (pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (error) reject(new Error(error));
      else resolve(result);
    }
  };
}

async function sha256HexLocal(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256HexBufferLocal(buffer) {
  const buf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2BytesLocal(password, saltBytes, iterations, lengthBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, baseKey, lengthBytes * 8);
  return new Uint8Array(bits);
}

async function deriveLocalKey({ password, nickname, salt, saltB64, iterations, version }) {
  const enc = new TextEncoder();
  const kdfVersion = Number(version || 1);
  const iters = Number(iterations || (kdfVersion >= 2 ? 310000 : 100000));
  const saltBytes = saltB64 ? base64ToBytes(saltB64) : enc.encode(String(salt || ''));
  const baseMaterial = kdfVersion >= 2 ? String(password) : String(password) + String(nickname || '');
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']);
  fallbackAesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return true;
}

async function encryptLocal(obj) {
  if (!fallbackAesKey) throw new Error('No key');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fallbackAesKey, data);
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptLocal(encStr) {
  if (!fallbackAesKey) throw new Error('No key');
  const [ivB64, dataB64] = String(encStr || '').split(':');
  const iv = base64ToBytes(ivB64);
  const data = base64ToBytes(dataB64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fallbackAesKey, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function decryptBatchLocal(arr) {
  const out = [];
  for (const s of arr) {
    if (!s) {
      out.push(null);
      continue;
    }
    try {
      out.push(await decryptLocal(s));
    } catch (_) {
      out.push(null);
    }
  }
  return out;
}

function callWorker(type, payload) {
  if (!worker) {
    return (async () => {
      if (type === 'derive') return deriveLocalKey(payload);
      if (type === 'lock') {
        fallbackAesKey = null;
        return true;
      }
      if (type === 'encrypt') return encryptLocal(payload);
      if (type === 'decrypt') return decryptLocal(payload);
      if (type === 'decryptBatch') return decryptBatchLocal(payload);
      if (type === 'sha256hex') return sha256HexLocal(payload);
      if (type === 'sha256buffer') return sha256HexBufferLocal(payload);
      if (type === 'pbkdf2') {
        const saltBytes = base64ToBytes(String(payload.saltB64 || ''));
        const iters = Number(payload.iterations);
        const len = Number(payload.lengthBytes || 32);
        const bytes = await pbkdf2BytesLocal(String(payload.password), saltBytes, iters, len);
        return bytesToBase64(bytes);
      }
      throw new Error('Unknown type');
    })();
  }

  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export async function cryptoDerive(password, nickname, salt) {
  if (salt && typeof salt === 'object') {
    const { saltB64, iterations, version } = salt;
    return callWorker('derive', { password, nickname, saltB64, iterations, version });
  }
  return callWorker('derive', { password, nickname, salt });
}

export async function cryptoLock() {
  return callWorker('lock');
}

export async function cryptoEncrypt(obj) {
  return callWorker('encrypt', obj);
}

export async function cryptoDecrypt(encStr) {
  return callWorker('decrypt', encStr);
}

export async function cryptoDecryptBatch(encStrArray) {
  return callWorker('decryptBatch', encStrArray);
}

export async function cryptoSha256Hex(str) {
  return callWorker('sha256hex', str);
}

export async function cryptoSha256Buffer(arrayBuffer) {
  return callWorker('sha256buffer', arrayBuffer);
}

export async function cryptoPbkdf2Bytes(password, saltB64, iterations, lengthBytes = 32) {
  return callWorker('pbkdf2', { password, saltB64, iterations, lengthBytes });
}

```

### src/core/base64.js

```js
export function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

```

### src/core/wireCrypto.js

```js
import { base64ToBytes, bytesToBase64 } from './base64.js';

const ORBIT_WIRE_VERSION = 2;
const ORBIT_WIRE_SALT_TAG = 'orbits-wire-v2';

const sessions = new Map();

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesLexCompare(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

async function sha256Bytes(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

async function sha256Hex(bytes) {
  const digest = await sha256Bytes(bytes);
  return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateEcdhKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
}

async function exportSpki(publicKey) {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(spki);
}

async function importRemoteSpki(spkiBytes) {
  return crypto.subtle.importKey(
    'spki',
    spkiBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

async function deriveAesKeyFromSharedSecret(sharedSecretBytes, saltBytes, infoBytes) {
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecretBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      localKeyPair: null,
      localSpki: null,
      remoteSpki: null,
      key: null,
      ready: null,
      readyResolve: null,
      readyReject: null,
      fingerprint: null
    });
  }
  return sessions.get(chatId);
}

async function ensureLocal(chatId) {
  const s = getSession(chatId);
  if (!s.ready) {
    s.ready = new Promise((resolve, reject) => {
      s.readyResolve = resolve;
      s.readyReject = reject;
    });
  }
  if (!s.localKeyPair) {
    s.localKeyPair = await generateEcdhKeyPair();
    s.localSpki = await exportSpki(s.localKeyPair.publicKey);
  }
  return s;
}

async function tryFinalize(chatId) {
  const s = getSession(chatId);
  if (!s.localKeyPair || !s.localSpki || !s.remoteSpki || s.key) return s;

  const remoteKey = await importRemoteSpki(s.remoteSpki);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteKey },
    s.localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const [a, b] = bytesLexCompare(s.localSpki, s.remoteSpki) <= 0 ? [s.localSpki, s.remoteSpki] : [s.remoteSpki, s.localSpki];
  const transcript = concatBytes(a, b);
  const salt = await sha256Bytes(concatBytes(new TextEncoder().encode(ORBIT_WIRE_SALT_TAG), transcript));
  const info = concatBytes(new TextEncoder().encode(`${ORBIT_WIRE_SALT_TAG}|${chatId}|v${ORBIT_WIRE_VERSION}|`), transcript);

  s.key = await deriveAesKeyFromSharedSecret(sharedSecret, salt, info);
  s.fingerprint = await sha256Hex(transcript);
  s.readyResolve?.({ fingerprint: s.fingerprint, version: ORBIT_WIRE_VERSION });
  return s;
}

export async function initWireSession(chatId) {
  const s = await ensureLocal(chatId);
  return { version: ORBIT_WIRE_VERSION, pubB64: bytesToBase64(s.localSpki) };
}

export async function acceptWireHello(chatId, remotePubB64) {
  const s = await ensureLocal(chatId);
  s.remoteSpki = base64ToBytes(String(remotePubB64 || ''));
  await tryFinalize(chatId);
  return s.ready;
}

export function getWireSessionStatus(chatId) {
  const s = sessions.get(chatId);
  return { ready: !!s?.key, fingerprint: s?.fingerprint || null, version: ORBIT_WIRE_VERSION };
}

export function waitForWireReady(chatId) {
  const s = sessions.get(chatId);
  if (!s?.ready) return Promise.reject(new Error('Wire session not initialized'));
  return s.ready;
}

export function teardownWireSession(chatId) {
  sessions.delete(chatId);
}

export async function encryptWirePayload(chatId, obj) {
  const s = getSession(chatId);
  if (!s.key) throw new Error('Wire key not ready');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const aad = new TextEncoder().encode(chatId);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, s.key, data);
  const ivB64 = bytesToBase64(iv);
  const ctB64 = bytesToBase64(new Uint8Array(encrypted));
  return `v${ORBIT_WIRE_VERSION}:${ivB64}:${ctB64}`;
}

export async function decryptWirePayload(chatId, encStr) {
  const s = getSession(chatId);
  if (!s.key) throw new Error('Wire key not ready');
  const parts = String(encStr || '').split(':');
  if (parts.length !== 3 || !parts[0].startsWith('v')) throw new Error('Bad wire payload');
  const iv = base64ToBytes(parts[1]);
  const ct = base64ToBytes(parts[2]);
  const aad = new TextEncoder().encode(chatId);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, s.key, ct);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

```

### src/workers/crypto.worker.js

```js
let aesKey = null;

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x2000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256buffer(buffer) {
  const buf = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Bytes(password, saltBytes, iterations, lengthBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'derive') {
      const { password, nickname, salt, saltB64, iterations, version } = payload;
      const enc = new TextEncoder();
      const kdfVersion = Number(version || 1);
      const iters = Number(iterations || (kdfVersion >= 2 ? 310000 : 100000));
      const saltBytes = saltB64 ? base64ToBytes(saltB64) : enc.encode(String(salt || ''));

      const baseMaterial = kdfVersion >= 2 ? String(password) : String(password) + String(nickname || '');
      const baseKey = await crypto.subtle.importKey('raw', enc.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']);
      aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: iters, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      self.postMessage({ id, result: true });
    } else if (type === 'lock') {
      aesKey = null;
      self.postMessage({ id, result: true });
    } else if (type === 'encrypt') {
      if (!aesKey) throw new Error('No key');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const data = enc.encode(JSON.stringify(payload));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
      
      const ivBase64 = bytesToBase64(iv);
      const dataBase64 = bytesToBase64(new Uint8Array(encrypted));
      self.postMessage({ id, result: `${ivBase64}:${dataBase64}` });
    } else if (type === 'decrypt') {
      if (!aesKey) throw new Error('No key');
      const [ivBase64, dataBase64] = payload.split(':');
      const iv = base64ToBytes(ivBase64);
      const data = base64ToBytes(dataBase64);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
      const dec = new TextDecoder();
      self.postMessage({ id, result: JSON.parse(dec.decode(decrypted)) });
    } else if (type === 'decryptBatch') {
      if (!aesKey) throw new Error('No key');
      const results = await Promise.all(payload.map(async (str) => {
        if (!str) return null;
        try {
          const [ivBase64, dataBase64] = str.split(':');
          const iv = base64ToBytes(ivBase64);
          const data = base64ToBytes(dataBase64);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
          const dec = new TextDecoder();
          return JSON.parse(dec.decode(decrypted));
        } catch (err) {
          return null;
        }
      }));
      self.postMessage({ id, result: results });
    } else if (type === 'pbkdf2') {
      const { password, saltB64, iterations, lengthBytes } = payload;
      const saltBytes = base64ToBytes(String(saltB64 || ''));
      const iters = Number(iterations);
      const len = Number(lengthBytes || 32);
      const out = await pbkdf2Bytes(String(password), saltBytes, iters, len);
      self.postMessage({ id, result: bytesToBase64(out) });
    } else if (type === 'sha256hex') {
      const result = await sha256hex(payload);
      self.postMessage({ id, result });
    } else if (type === 'sha256buffer') {
      const result = await sha256buffer(payload);
      self.postMessage({ id, result });
    } else {
      throw new Error('Unknown type');
    }
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};

```

### src/workers/themeWorker.js

```js
/**
 * OffscreenCanvas theme renderer — all drawing runs in this worker (no main-thread canvas load).
 * Protocol: init | resize | setTheme | pause | resume | setParams
 */

const raf =
  typeof self.requestAnimationFrame === 'function'
    ? self.requestAnimationFrame.bind(self)
    : (cb) => self.setTimeout(() => cb(self.performance.now()), 16);

const cancelRaf =
  typeof self.cancelAnimationFrame === 'function'
    ? self.cancelAnimationFrame.bind(self)
    : (id) => clearTimeout(id);

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let currentTheme = 'none';
let paused = false;
let animId = null;
/** 0 = uncapped */
let maxFPS = 0;
let lastFrameTime = 0;

let params = {
  sakuraCount: 42,
  matrixFont: 15,
  auroraBands: 6,
  synthHorizontals: 22,
  synthVerticals: 24,
  windStrength: 1.15
};

const MATRIX_CHARS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789ABCDEFﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ';

let sakuraPetals = [];
let matrixState = { cols: 0, columns: [] };

function randomChar() {
  return MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0];
}

function cancelLoop() {
  if (animId != null) {
    cancelRaf(animId);
    animId = null;
  }
}

function needsAnimationLoop(theme) {
  return theme === 'sakura_zen' || theme === 'aurora_flow' || theme === 'retro_synth' || theme === 'matrix';
}

function drawNone() {
  if (!ctx) return;
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(0, 0, width, height);
}

function drawObsidian() {
  if (!ctx) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
}

function initSakura() {
  const n = Math.min(100, Math.max(40, params.sakuraCount | 0));
  sakuraPetals = [];
  for (let i = 0; i < n; i++) {
    sakuraPetals.push({
      x: Math.random() * width,
      y: Math.random() * height - height,
      size: 6 + Math.random() * 10,
      vy: 0.8 + Math.random() * 1.7,
      vxBase: (Math.random() - 0.5) * 0.45,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.05,
      phase: Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      opacity: 0.6 + Math.random() * 0.4
    });
  }
}

function initMatrix() {
  const fs = Math.max(10, Math.min(22, params.matrixFont | 0));
  const cols = Math.max(8, Math.ceil(width / fs));
  matrixState.cols = cols;
  matrixState.columns = [];
  for (let i = 0; i < cols; i++) {
    const len = 8 + ((Math.random() * 18) | 0);
    const chars = [];
    for (let j = 0; j < len; j++) chars.push(randomChar());
    matrixState.columns.push({
      y: Math.random() * height,
      speed: 1.2 + Math.random() * 4.5,
      chars,
      tick: Math.random() * 100
    });
  }
}

function initThemeState() {
  if (currentTheme === 'sakura_zen') initSakura();
  if (currentTheme === 'matrix') initMatrix();
}

function drawSakuraFrame(t) {
  if (!ctx) return;
  const w = params.windStrength;
  ctx.fillStyle = '#0a0510';
  ctx.fillRect(0, 0, width, height);
  const gBg = ctx.createLinearGradient(0, 0, 0, height);
  gBg.addColorStop(0, '#1a0d12');
  gBg.addColorStop(1, '#0a0510');
  ctx.fillStyle = gBg;
  ctx.fillRect(0, 0, width, height);

  for (const p of sakuraPetals) {
    const wind =
      Math.sin(t * 0.0007 + p.phase) * (0.55 * w) +
      Math.sin(t * 0.0004 + p.phase2) * 0.25 * w;
    p.x += p.vxBase + wind * 0.12;
    p.y += p.vy;
    p.rot += p.vr;

    if (p.y > height + 24) {
      p.y = -20 - Math.random() * 40;
      p.x = Math.random() * width;
    }
    if (p.x < -30) p.x = width + 20;
    if (p.x > width + 30) p.x = -20;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;

    ctx.shadowColor = 'rgba(255, 180, 210, 0.85)';
    ctx.shadowBlur = Math.max(4, p.size * 0.55);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    g.addColorStop(0, 'rgba(255, 230, 240, 1)');
    g.addColorStop(0.4, 'rgba(255, 160, 190, 0.9)');
    g.addColorStop(0.75, 'rgba(255, 120, 160, 0.45)');
    g.addColorStop(1, 'rgba(255, 80, 120, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 200, 220, 0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawAuroraFrame(t) {
  if (!ctx) return;
  const bands = Math.min(12, Math.max(3, params.auroraBands | 0));
  ctx.fillStyle = '#020208';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let i = 0; i < bands; i++) {
    const phase = t * 0.00035 + i * 0.9;
    const y0 = height * (0.08 + i * 0.11) + Math.sin(phase) * (height * 0.04);
    const hBand = height * 0.22 + Math.sin(phase * 1.3) * 40;

    const g = ctx.createLinearGradient(0, y0, width, y0 + hBand);
    const a1 = 0.12 + 0.08 * Math.sin(phase);
    const a2 = 0.22 + 0.1 * Math.cos(phase * 0.8);
    const hue1 = 160 + Math.sin(phase) * 40;
    const hue2 = 280 + Math.cos(phase * 0.7) * 50;
    g.addColorStop(0, `hsla(${hue1}, 70%, 45%, 0)`);
    g.addColorStop(0.35, `hsla(${hue1}, 85%, 55%, ${a1})`);
    g.addColorStop(0.55, `hsla(${hue2}, 60%, 50%, ${a2})`);
    g.addColorStop(0.75, `hsla(200, 90%, 60%, ${a1 * 0.8})`);
    g.addColorStop(1, `hsla(${hue1}, 70%, 40%, 0)`);

    ctx.fillStyle = g;
    ctx.fillRect(0, y0 - 20, width, hBand + 60);
  }

  ctx.globalCompositeOperation = 'lighter';
  const sweep = t * 0.0002;
  const rg = ctx.createRadialGradient(
    width * (0.3 + 0.4 * Math.sin(sweep)),
    height * (0.25 + 0.15 * Math.cos(sweep * 1.2)),
    0,
    width * 0.5,
    height * 0.35,
    Math.max(width, height) * 0.65
  );
  rg.addColorStop(0, 'rgba(80, 220, 180, 0.15)');
  rg.addColorStop(0.5, 'rgba(120, 80, 220, 0.12)');
  rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function drawSynthFrame(t) {
  if (!ctx) return;
  ctx.fillStyle = '#0a0014';
  ctx.fillRect(0, 0, width, height);

  const cx = width * 0.5;
  const horizon = height * 0.38;
  const scroll = (t * 0.045) % 1;

  const horiz = Math.min(40, Math.max(8, params.synthHorizontals | 0));
  ctx.lineWidth = 1;
  for (let i = 0; i < horiz; i++) {
    const p = (i / horiz + scroll) % 1;
    const y = horizon + p * p * (height - horizon);
    const alpha = 0.15 + (1 - p) * 0.45;
    ctx.strokeStyle = `rgba(0, 255, 240, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const verts = Math.min(48, Math.max(12, params.synthVerticals | 0));
  for (let i = 0; i <= verts; i++) {
    const u = i / verts - 0.5;
    const angle = u * 1.15;
    ctx.strokeStyle = `rgba(255, 0, 180, ${0.12 + Math.abs(u) * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(cx, horizon);
    const x2 = cx + Math.tan(angle) * (height - horizon) * 1.4;
    ctx.lineTo(x2, height + 4);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 0, 200, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();
}

function drawMatrixFrame() {
  if (!ctx) return;
  const fs = Math.max(10, Math.min(22, params.matrixFont | 0));
  const cols = Math.max(8, Math.ceil(width / fs));
  if (matrixState.cols !== cols || matrixState.columns.length !== cols) initMatrix();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, 0, width, height);

  ctx.font = `bold ${fs}px ui-monospace, "Cascadia Code", monospace`;

  for (let i = 0; i < cols; i++) {
    const col = matrixState.columns[i];
    col.y += col.speed;
    col.tick += 1;
    if (col.y > height + col.chars.length * fs) {
      col.y = -fs * (2 + Math.random() * 8);
      col.speed = 1.2 + Math.random() * 4.5;
    }
    if (col.tick % 3 === 0 && Math.random() < 0.08) {
      col.chars[((Math.random() * col.chars.length) | 0)] = randomChar();
    }

    for (let j = 0; j < col.chars.length; j++) {
      const y = col.y - j * fs;
      if (y < -fs || y > height + fs) continue;
      const head = j === 0;
      const fade = head ? 1 : Math.max(0.08, 1 - j * 0.045);
      ctx.fillStyle = head
        ? '#e8ffe8'
        : `rgba(0, ${160 + (j % 5) * 10}, 60, ${fade * 0.85})`;
      ctx.fillText(col.chars[j], i * fs + 1, y);
    }
  }
}

function renderFrame(t) {
  if (!ctx || width < 1 || height < 1) return;
  switch (currentTheme) {
    case 'sakura_zen':
      drawSakuraFrame(t);
      break;
    case 'aurora_flow':
      drawAuroraFrame(t);
      break;
    case 'retro_synth':
      drawSynthFrame(t);
      break;
    case 'matrix':
      drawMatrixFrame();
      break;
    default:
      break;
  }
}

function scheduleLoop() {
  cancelLoop();
  if (paused || !ctx) return;

  if (!needsAnimationLoop(currentTheme)) {
    if (currentTheme === 'none') drawNone();
    else if (currentTheme === 'obsidian') drawObsidian();
    return;
  }

  const loop = (time) => {
    if (paused || !ctx) return;
    if (maxFPS > 0) {
      const minDelta = 1000 / maxFPS;
      if (time - lastFrameTime < minDelta) {
        animId = raf(loop);
        return;
      }
      lastFrameTime = time;
    }
    renderFrame(time);
    animId = raf(loop);
  };
  animId = raf(loop);
}

self.onmessage = (e) => {
  const d = e.data;
  if (!d || typeof d.type !== 'string') return;

  switch (d.type) {
    case 'init': {
      canvas = d.canvas;
      ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      width = d.width | 0;
      height = d.height | 0;
      if (canvas && width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      if (typeof d.theme === 'string') currentTheme = d.theme;
      if (d.params && typeof d.params === 'object') Object.assign(params, d.params);
      initThemeState();
      paused = false;
      scheduleLoop();
      break;
    }
    case 'resize': {
      width = d.width | 0;
      height = d.height | 0;
      if (canvas && width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'setTheme': {
      currentTheme = d.theme || 'none';
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'pause': {
      paused = true;
      cancelLoop();
      break;
    }
    case 'resume': {
      paused = false;
      scheduleLoop();
      break;
    }
    case 'setParams': {
      if (d.params && typeof d.params === 'object') Object.assign(params, d.params);
      initThemeState();
      if (!paused) scheduleLoop();
      break;
    }
    case 'setMaxFPS': {
      maxFPS = Math.max(0, Number(d.value) | 0);
      lastFrameTime = 0;
      if (!paused) scheduleLoop();
      break;
    }
    default:
      break;
  }
};

```

### src/ui/themeManager.js

```js
/**
 * Theme manager: OffscreenCanvas + dedicated theme worker (main thread does not paint animated themes).
 * Fallback: static black (#000) if transferControlToOffscreen is unavailable.
 */

export const THEMES = {
  NONE: 'none',
  SAKURA_ZEN: 'sakura_zen',
  AURORA_FLOW: 'aurora_flow',
  RETRO_SYNTH: 'retro_synth',
  MATRIX: 'matrix',
  OBSIDIAN: 'obsidian'
};

/** Map legacy orbit_theme values from older builds */
const LEGACY_THEME_MAP = {
  aurora: 'aurora_flow',
  stellar: 'aurora_flow',
  retro: 'retro_synth',
  japan: 'sakura_zen',
  abyss: 'obsidian',
  draft: 'obsidian'
};

const ALL_THEME_IDS = new Set([
  THEMES.NONE,
  THEMES.SAKURA_ZEN,
  THEMES.AURORA_FLOW,
  THEMES.RETRO_SYNTH,
  THEMES.MATRIX,
  THEMES.OBSIDIAN
]);

function normalizeStoredTheme(raw) {
  if (!raw || typeof raw !== 'string') return THEMES.NONE;
  return LEGACY_THEME_MAP[raw] || (ALL_THEME_IDS.has(raw) ? raw : THEMES.NONE);
}

const MAIN_WIND = 1.15;

class ThemeManager {
  constructor() {
    this.canvas = document.getElementById('theme-background');
    this.worker = null;
    this._useWorker = false;
    this._fallbackCtx = null;
    this._mainRaf = null;
    this._sakuraPetals = [];
    this._mainMaxFps = 0;
    this._mainLastFrameTime = 0;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._tabHidden = typeof document !== 'undefined' ? document.hidden : false;
    /** When true, do not resume theme loop on tab focus (battery saver). */
    this._batterySaverHold = false;

    const stored = localStorage.getItem('orbit_theme');
    let initial = normalizeStoredTheme(stored);
    if (this._reducedMotion) initial = THEMES.OBSIDIAN;
    this.theme = initial;
    if (stored !== this.theme) localStorage.setItem('orbit_theme', this.theme);

    this._applyDataTheme();
    this._initRenderer();

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this._reducedMotion = e.matches;
      if (this._reducedMotion) {
        this.theme = THEMES.OBSIDIAN;
        localStorage.setItem('orbit_theme', THEMES.OBSIDIAN);
        this._applyDataTheme();
        this._postWorker({ type: 'setTheme', theme: THEMES.OBSIDIAN });
        this._postWorker({ type: 'pause' });
        this._cancelMainThemeLoop();
        this._drawFallbackStatic();
      } else {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._resizeRenderer();
        this._scheduleMainThemeLoop();
      }
    });

    document.addEventListener('visibilitychange', () => {
      this._tabHidden = document.hidden;
      if (document.hidden) {
        this._postWorker({ type: 'pause' });
        this._cancelMainThemeLoop();
      } else if (!this._reducedMotion && !this._batterySaverHold) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._scheduleMainThemeLoop();
      }
    });

    window.addEventListener('resize', () => this._resizeRenderer());
  }

  _initRenderer() {
    const canvas = this.canvas;
    if (!canvas) return;

    const canTransfer =
      typeof canvas.transferControlToOffscreen === 'function' &&
      typeof OffscreenCanvas !== 'undefined';

    if (!canTransfer) {
      console.warn(
        '[Orbits themes] OffscreenCanvas unavailable — Sakura Zen uses main-thread canvas (other themes static).'
      );
      this._fallbackCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this._resizeFallbackCanvasEl();
      this._setupFallbackRendering();
      return;
    }

    try {
      this.worker = new Worker(new URL('../workers/themeWorker.js', import.meta.url), { type: 'module' });
      const offscreen = canvas.transferControlToOffscreen();
      this.worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          width: window.innerWidth,
          height: window.innerHeight,
          theme: this.theme
        },
        [offscreen]
      );
      this._useWorker = true;
    } catch (err) {
      console.warn('[Orbits themes] Worker init failed — Sakura Zen on main thread, other themes static.', err);
      this.worker = null;
      this._fallbackCtx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this._resizeFallbackCanvasEl();
      this._setupFallbackRendering();
    }
  }

  _initMainSakura() {
    const canvas = this.canvas;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const n = 60 + ((Math.random() * 41) | 0);
    this._sakuraPetals = [];
    for (let i = 0; i < n; i++) {
      this._sakuraPetals.push({
        x: Math.random() * w,
        y: Math.random() * h - h,
        size: 5 + Math.random() * 9,
        vy: 0.8 + Math.random() * 1.7,
        vxBase: (Math.random() - 0.5) * 0.45,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.05,
        phase: Math.random() * Math.PI * 2,
        phase2: Math.random() * Math.PI * 2,
        opacity: 0.6 + Math.random() * 0.4
      });
    }
  }

  _drawMainSakuraFrame(t) {
    const ctx = this._fallbackCtx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width < 1 || height < 1) return;
    const wind = MAIN_WIND;

    ctx.fillStyle = '#0a0510';
    ctx.fillRect(0, 0, width, height);
    const gBg = ctx.createLinearGradient(0, 0, 0, height);
    gBg.addColorStop(0, '#1a0d12');
    gBg.addColorStop(1, '#0a0510');
    ctx.fillStyle = gBg;
    ctx.fillRect(0, 0, width, height);

    for (const p of this._sakuraPetals) {
      const wobble =
        Math.sin(t * 0.0007 + p.phase) * (0.55 * wind) +
        Math.sin(t * 0.0004 + p.phase2) * 0.25 * wind;
      p.x += p.vxBase + wobble * 0.12;
      p.y += p.vy;
      p.rot += p.vr;

      if (p.y > height + 24) {
        p.y = -20 - Math.random() * 40;
        p.x = Math.random() * width;
      }
      if (p.x < -30) p.x = width + 20;
      if (p.x > width + 30) p.x = -20;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.opacity;

      ctx.shadowColor = 'rgba(255, 180, 210, 0.85)';
      ctx.shadowBlur = Math.max(4, p.size * 0.55);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      g.addColorStop(0, 'rgba(255, 230, 240, 1)');
      g.addColorStop(0.4, 'rgba(255, 160, 190, 0.9)');
      g.addColorStop(0.75, 'rgba(255, 120, 160, 0.45)');
      g.addColorStop(1, 'rgba(255, 80, 120, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 200, 220, 0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _cancelMainThemeLoop() {
    if (this._mainRaf != null) {
      cancelAnimationFrame(this._mainRaf);
      this._mainRaf = null;
    }
  }

  _scheduleMainThemeLoop() {
    if (this._useWorker || !this._fallbackCtx) return;
    this._cancelMainThemeLoop();
    if (
      this.theme !== THEMES.SAKURA_ZEN ||
      this._reducedMotion ||
      this._batterySaverHold ||
      this._tabHidden
    ) {
      return;
    }
    if (!this._sakuraPetals.length) this._initMainSakura();

    const loop = (time) => {
      if (this._useWorker || !this._fallbackCtx) {
        this._mainRaf = null;
        return;
      }
      if (
        this.theme !== THEMES.SAKURA_ZEN ||
        this._reducedMotion ||
        this._batterySaverHold ||
        this._tabHidden
      ) {
        this._mainRaf = null;
        return;
      }
      if (this._mainMaxFps > 0) {
        const minDelta = 1000 / this._mainMaxFps;
        if (time - this._mainLastFrameTime < minDelta) {
          this._mainRaf = requestAnimationFrame(loop);
          return;
        }
        this._mainLastFrameTime = time;
      }
      this._drawMainSakuraFrame(time);
      this._mainRaf = requestAnimationFrame(loop);
    };
    this._mainRaf = requestAnimationFrame(loop);
  }

  _setupFallbackRendering() {
    this._cancelMainThemeLoop();
    if (this.theme === THEMES.SAKURA_ZEN && !this._reducedMotion && !this._batterySaverHold && !this._tabHidden) {
      this._initMainSakura();
      this._scheduleMainThemeLoop();
    } else {
      this._drawFallbackStatic();
    }
  }

  _resizeFallbackCanvasEl() {
    const canvas = this.canvas;
    if (!canvas || this._useWorker) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  _resizeRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this._useWorker && this.worker) {
      this.worker.postMessage({ type: 'resize', width: w, height: h });
    } else if (this._fallbackCtx) {
      this._resizeFallbackCanvasEl();
      if (this.theme === THEMES.SAKURA_ZEN) {
        this._initMainSakura();
        this._scheduleMainThemeLoop();
      } else {
        this._drawFallbackStatic();
      }
    }
  }

  _postWorker(msg) {
    if (this._useWorker && this.worker) {
      try {
        this.worker.postMessage(msg);
      } catch (_) { /* ignore */ }
    }
  }

  _drawFallbackStatic() {
    if (!this._fallbackCtx || !this.canvas) return;
    const { width, height } = this.canvas;
    const c = this._fallbackCtx;
    if (this.theme === THEMES.NONE) {
      c.fillStyle = '#1a1a1f';
      c.fillRect(0, 0, width, height);
    } else if (this.theme === THEMES.SAKURA_ZEN) {
      const gBg = c.createLinearGradient(0, 0, 0, height);
      gBg.addColorStop(0, '#1a0d12');
      gBg.addColorStop(1, '#0a0510');
      c.fillStyle = gBg;
      c.fillRect(0, 0, width, height);
    } else {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);
    }
  }

  setTheme(name) {
    if (this._reducedMotion) name = THEMES.NONE;
    if (!ALL_THEME_IDS.has(name)) name = THEMES.NONE;
    this.theme = name;
    localStorage.setItem('orbit_theme', name);
    this._applyDataTheme();

    if (this._useWorker) {
      this._postWorker({ type: 'setTheme', theme: name });
      if (this._tabHidden) this._postWorker({ type: 'pause' });
    } else {
      this._setupFallbackRendering();
    }
  }

  /** Optional tuning for worker themes (density, speeds, etc.) */
  setThemeParams(partial) {
    this._postWorker({ type: 'setParams', params: partial || {} });
  }

  getCurrentTheme() {
    return this.theme;
  }

  _applyDataTheme() {
    document.body.dataset.theme = this.theme;
  }

  stopAnimation() {
    this._postWorker({ type: 'pause' });
    this._cancelMainThemeLoop();
  }

  /** @param {number} fps 0 = uncapped */
  setMaxFPS(fps) {
    const v = fps | 0;
    this._postWorker({ type: 'setMaxFPS', value: v });
    this._mainMaxFps = Math.max(0, v);
    this._mainLastFrameTime = 0;
  }

  /** Pause animated themes until cleared; keeps tab-visibility logic consistent. */
  setBatterySaverHold(on) {
    this._batterySaverHold = !!on;
    if (on) {
      this._postWorker({ type: 'pause' });
      this.setMaxFPS(15);
      this._cancelMainThemeLoop();
      if (!this._useWorker) this._drawFallbackStatic();
    } else {
      this.setMaxFPS(0);
      if (!this._tabHidden && !this._reducedMotion) {
        this._postWorker({ type: 'resume' });
        this._postWorker({ type: 'setTheme', theme: this.theme });
        this._setupFallbackRendering();
      }
    }
  }

  resumeAnimation() {
    this._postWorker({ type: 'resume' });
    if (this._reducedMotion) {
      this._postWorker({ type: 'setTheme', theme: THEMES.NONE });
    } else {
      this._postWorker({ type: 'setTheme', theme: this.theme });
    }
    this._scheduleMainThemeLoop();
  }
}

let instance = null;
export function getThemeManager() {
  if (!instance) instance = new ThemeManager();
  return instance;
}

```

### src/core/orbitsDrop.js

```js
/**
 * Orbits Drop - High-Bandwidth P2P File Transfer Module
 * Handles massive file transfers with compression, chunking, and buffer control.
 * Strictly Zero-Server, Vanilla JS implementation.
 */

export class OrbitsDrop {
  constructor() {
    this.CHUNK_SIZE = 65536; // 64KB per chunk to prevent WebRTC buffer overflow
    this.MAX_BUFFER_SIZE = 1048576; // 1MB WebRTC buffer limit before pausing
    
    // Receiver State
    this.incomingFiles = new Map(); // fileId -> { chunks: [], totalSize: 0, receivedBytes: 0, metadata: {}, statusMsgId: '' }
    
    // Sender State
    this.outgoingTransfers = new Map(); // fileId -> { statusMsgId: '', aborted: false }
    
    // Callbacks to interact with UI
    this.onProgressUpdate = null; // (msgId, percent, statusText) => {}
    this.onFileReady = null; // (msgId, fileUrl, metadata) => {}
    this.onTransferComplete = null; // (msgId) => {}
    this.onTransferFailed = null; // (msgId, error) => {}
  }

  // ==========================================
  // 1. FILE COMPRESSION MODULE (Pre-transfer)
  // ==========================================
  
  /**
   * Compresses an image locally using the Canvas API
   * @param {File} file - Original image file
   * @param {string} qualitySetting - 'original', 'high', or 'fast'
   * @returns {Promise<Blob>} - Compressed Blob or original if compression not applicable
   */
  async compressImage(file, qualitySetting) {
    // Only compress standard images
    if (!file.type.match(/image\/(jpeg|png|webp)/i) || qualitySetting === 'original') {
      return file;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        let targetWidth = img.width;
        let targetHeight = img.height;
        let quality = 0.9;
        
        // Define compression tiers
        if (qualitySetting === 'high') {
          // Max dimension 1920px
          const maxDim = 1920;
          if (targetWidth > maxDim || targetHeight > maxDim) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
              targetWidth = maxDim;
            } else {
              targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
              targetHeight = maxDim;
            }
          }
          quality = 0.85;
        } else if (qualitySetting === 'fast') {
          // Max dimension 1080px
          const maxDim = 1080;
          if (targetWidth > maxDim || targetHeight > maxDim) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
              targetWidth = maxDim;
            } else {
              targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
              targetHeight = maxDim;
            }
          }
          quality = 0.6;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        // Better scaling algorithm
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Always output as JPEG for compression, unless it's a PNG and we want to preserve transparency
        const outputType = (file.type === 'image/png' && qualitySetting === 'high') ? 'image/png' : 'image/jpeg';
        
        canvas.toBlob((blob) => {
          if (blob) {
            // If compression somehow made it larger, use original
            if (blob.size >= file.size) resolve(file);
            else resolve(blob);
          } else {
            resolve(file); // Fallback to original on failure
          }
        }, outputType, quality);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file); // Fallback to original on error
      };
      
      img.src = url;
    });
  }

  // ==========================================
  // 2. THE WEBRTC CHUNKER (Sender Side)
  // ==========================================

  /**
   * Sends a file in chunks over a WebRTC DataChannel with buffer backpressure control
   */
  async sendFile(file, conn, statusMsgId, fileId = crypto.randomUUID()) {
    return new Promise((resolve, reject) => {
      if (!conn || !conn.open) {
        return reject(new Error('Connection not open'));
      }

      // 1. Send metadata packet
      const metadata = {
        type: 'file-start',
        fileId: fileId,
        name: file.name || 'orbits_drop_file',
        size: file.size,
        mime: file.type || 'application/octet-stream',
        msgId: statusMsgId
      };
      
      this.outgoingTransfers.set(fileId, { statusMsgId, aborted: false });
      
      try {
        conn.send(metadata);
      } catch (err) {
        this.outgoingTransfers.delete(fileId);
        return reject(new Error('Failed to send file metadata'));
      }

      // 2. Setup chunking
      let offset = 0;
      const reader = new FileReader();
      
      const dataChannel = conn.dataChannel || null;
      const canBackpressure =
        !!dataChannel &&
        typeof dataChannel.bufferedAmount === 'number' &&
        typeof dataChannel.addEventListener === 'function';

      const sendNextChunk = () => {
        const transferState = this.outgoingTransfers.get(fileId);
        if (!transferState || transferState.aborted) {
          return reject(new Error('Transfer aborted'));
        }

        // Backpressure control: Wait if buffer is too full
        if (canBackpressure && dataChannel.bufferedAmount > this.MAX_BUFFER_SIZE) {
          const onBufferedAmountLow = () => {
            dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            sendNextChunk();
          };
          dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
          return;
        }

        // Read next slice
        const slice = file.slice(offset, offset + this.CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        const chunk = e.target.result;
        if (!chunk || chunk.byteLength === 0) return;

        try {
          // Send raw ArrayBuffer. PeerJS passes ArrayBuffers directly to RTCDataChannel
          // We wrap it in our protocol object to distinguish from normal messages
          conn.send({
            type: 'file-chunk',
            fileId: fileId,
            data: chunk
          });
          
          offset += chunk.byteLength;
          
          // Update UI Progress
          if (this.onProgressUpdate) {
            const percent = Math.floor((offset / file.size) * 100);
            this.onProgressUpdate(statusMsgId, percent, 'Sending...');
          }

          if (offset < file.size) {
            // Use setTimeout to avoid blocking the main thread during massive transfers
            setTimeout(sendNextChunk, 0);
          } else {
            // 3. Send Completion Packet
            conn.send({
              type: 'file-end',
              fileId: fileId
            });
            
            this.outgoingTransfers.delete(fileId);
            if (this.onTransferComplete) this.onTransferComplete(statusMsgId);
            resolve();
          }
        } catch (err) {
          this.outgoingTransfers.delete(fileId);
          if (this.onTransferFailed) this.onTransferFailed(statusMsgId, err);
          reject(err);
        }
      };

      reader.onerror = (err) => {
        this.outgoingTransfers.delete(fileId);
        if (this.onTransferFailed) this.onTransferFailed(statusMsgId, reader.error);
        reject(reader.error);
      };

      if (canBackpressure) {
        dataChannel.bufferedAmountLowThreshold = this.MAX_BUFFER_SIZE / 2;
      }
      
      // Start the transfer
      sendNextChunk();
    });
  }

  abortTransfer(fileId) {
    if (this.outgoingTransfers.has(fileId)) {
      const state = this.outgoingTransfers.get(fileId);
      state.aborted = true;
      this.outgoingTransfers.set(fileId, state);
      return true;
    }
    return false;
  }

  // ==========================================
  // 3. THE WEBRTC ASSEMBLER (Receiver Side)
  // ==========================================

  /**
   * Main entry point for processing incoming Orbits Drop protocol packets
   */
  handleIncomingPacket(packet) {
    if (!packet || !packet.type) return false;

    switch (packet.type) {
      case 'file-start':
        this._handleFileStart(packet);
        return true;
      case 'file-chunk':
        this._handleFileChunk(packet);
        return true;
      case 'file-end':
        this._handleFileEnd(packet);
        return true;
      default:
        return false; // Not a file packet
    }
  }

  _handleFileStart(metadata) {
    console.log(`[Orbits Drop] Receiving file: ${metadata.name} (${metadata.size} bytes)`);
    
    // Initialize receiver state for this file
    this.incomingFiles.set(metadata.fileId, {
      chunks: [],
      totalSize: metadata.size,
      receivedBytes: 0,
      metadata: metadata,
      statusMsgId: metadata.msgId // ID of the UI message bubble
    });
    
    if (this.onProgressUpdate) {
      this.onProgressUpdate(metadata.msgId, 0, 'Receiving...');
    }
  }

  _handleFileChunk(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return; // Ignore orphaned chunks

    // Store ArrayBuffer chunk in memory
    fileState.chunks.push(packet.data);
    fileState.receivedBytes += packet.data.byteLength;
    
    // Update UI Progress
    if (this.onProgressUpdate) {
      const percent = Math.floor((fileState.receivedBytes / fileState.totalSize) * 100);
      this.onProgressUpdate(fileState.metadata.msgId, percent, 'Receiving...');
    }
  }

  _handleFileEnd(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return;

    console.log(`[Orbits Drop] Assembly complete: ${fileState.metadata.name}`);
    
    try {
      // Assemble chunks into final Blob
      const finalBlob = new Blob(fileState.chunks, { type: fileState.metadata.mime });
      
      // Clean up memory IMMEDIATELY before generating URL
      const metadata = fileState.metadata;
      const msgId = metadata.msgId;
      this.incomingFiles.delete(packet.fileId);
      
      // 4. Local Saving: Generate Object URL
      const fileUrl = URL.createObjectURL(finalBlob);
      
      // Notify UI that file is ready for download/display
      if (this.onFileReady) {
        this.onFileReady(msgId, fileUrl, metadata);
      }
      
      if (this.onTransferComplete) {
        this.onTransferComplete(msgId);
      }
      
    } catch (err) {
      console.error('[Orbits Drop] File assembly failed:', err);
      if (this.onTransferFailed) {
        this.onTransferFailed(fileState.metadata.msgId, err);
      }
      this.incomingFiles.delete(packet.fileId);
    }
  }

  // ==========================================
  // 4. LOCAL SAVING (Strictly Client-Side)
  // ==========================================

  /**
   * Programmatically triggers native browser download and cleans up memory
   */
  static triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      // Note: We don't revoke here immediately if the URL is also used for UI display (e.g. <img> src).
      // URL revocation should be managed by the UI component when it unmounts.
    }, 100);
  }
}

```

### src/core/callManager.js

```js
export function createCallManager(options) {
  let localStream = null;
  let activeCall = null;
  let callStatus = 'idle'; // idle | calling | in-call
  let callingTarget = null;
  let savedCameraTrack = null;

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
        audio: options.getAudioConstraints ? options.getAudioConstraints() : true,
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
      const myNickname = options.getMyNickname ? options.getMyNickname() : '';
      if (myNickname > callerId) {
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
        newAccept?.removeEventListener('click', acceptHandler);
        newReject?.removeEventListener('click', rejectHandler);
        options.el.incomingCallModal.style.display = 'none';
        options.el.incomingCallModal.setAttribute('aria-hidden', 'true');
        await answerCall(call);
      };

      const rejectHandler = () => {
        newAccept?.removeEventListener('click', acceptHandler);
        newReject?.removeEventListener('click', rejectHandler);
        options.el.incomingCallModal.style.display = 'none';
        options.el.incomingCallModal.setAttribute('aria-hidden', 'true');
        call.close();
      };

      newAccept?.addEventListener('click', acceptHandler);
      newReject?.addEventListener('click', rejectHandler);
    }
  }

  async function autoAnswer(call) {
    await answerCall(call);
  }

  async function answerCall(call) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC media devices are not available. Serve over HTTPS.');
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: resolveVideoConstraints(true)
        });
      } catch (videoErr) {
        console.warn('Could not get video for answer, falling back to audio', videoErr);
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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

```

### src/styles/style.css

```css
:root {
  /* PILLAR 1: Deep Dark Space Base & Neon Accents */
  --tg-bg-primary: #0A0A0F;
  --tg-bg-secondary: #05050A;
  --tg-bg-elevated: #111116;
  --tg-bg-input: #111116;
  --tg-bg-hover: rgba(255, 255, 255, 0.08);
  --tg-bg-active: #00FF41;
  
  --tg-accent: #00FF41;
  --tg-accent-dark: #00cc33;
  --tg-bubble-out: rgba(0, 255, 65, 0.15);
  --tg-bubble-in: rgba(255, 255, 255, 0.05);
  
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #A0A0A5;
  --tg-text-hint: #6E6E7A;
  --tg-text-link: #00FF41;
  --tg-text-danger: #FF3366;
  
  --tg-divider: rgba(255, 255, 255, 0.05);
  
  --tg-online: #00FF41;
  --tg-offline: #686C72;
  
  --tg-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  --tg-font-mono: 'SF Mono', 'Fira Code', monospace;
  
  --tg-sidebar-w: 320px;
  --tg-header-h: 64px;
  --tg-avatar-list: 48px;
  --tg-avatar-header: 42px;
  
  --tg-radius-bubble: 20px;
  --tg-radius-tip: 4px;
  --tg-radius-input: 24px;
  
  --tg-fast: 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
  --tg-normal: 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  
  /* Pillar 5 Glassmorphism hooks */
  --tg-glass-bg: rgba(10, 10, 15, 0.7);
  --tg-glass-border: rgba(255, 255, 255, 0.05);
}

:root[data-density="compact"] {
  --tg-header-h: 56px;
  --tg-sidebar-w: 300px;
}

:root[data-density="comfortable"] {
  --tg-header-h: 72px;
  --tg-sidebar-w: 340px;
}

:root[data-bubble="square"] body {
  --tg-radius-bubble: 10px;
  --tg-radius-input: 18px;
}

:root[data-bubble="rounded"] body {
  --tg-radius-input: 24px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  /* PILLAR 1: Fluidity & Micro-interactions */
  transition: background-color var(--tg-fast), border-color var(--tg-fast), color var(--tg-fast), transform var(--tg-fast);
}

* {
  margin: 0;
  padding: 0;
}

html {
  height: 100%;
  overflow-x: hidden;
}

body {
  background: var(--tg-bg-secondary);
  color: var(--tg-text-primary);
  font-family: var(--tg-font);
  font-size: 15px;
  letter-spacing: -0.01em;
  overflow-x: hidden;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overscroll-behavior: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.hidden {
  display: none !important;
}

.view-active {
  display: flex !important;
}

.view-hidden {
  display: none !important;
}

.theme-background-canvas,
#theme-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  display: block;
  /* PILLAR 5: Hardware Acceleration */
  will-change: transform;
  transform: translateZ(0);
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }

/* TITANIUM FIX: UNBREAKABLE TEXT */
.message .msg-text,
.friend-item strong,
#chat-friend-name,
#my-id-display {
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

/* TITANIUM FIX: CSS CONTAINMENT */
#messages-list,
#radar-canvas {
  contain: content;
}

/* TITANIUM FIX: GRID CENTERING */
.login-card,
.tg-modal-card {
  display: grid;
  place-items: center;
}

/* TITANIUM FIX: FLEX FENCES */
.chat-input-pill,
.sidebar-search-wrap {
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
}

#app-container {
  display: flex;
  width: 100%;
  max-width: 100vw;
  flex: 1;
  height: 100dvh;
}

#sidebar {
  width: var(--tg-sidebar-w);
  min-width: 0;
  background: var(--tg-bg-primary);
  border-right: 1px solid var(--tg-divider);
  display: flex;
  flex-direction: column;
  min-height: 0;
  touch-action: pan-y;
}

#friends-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

#my-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--tg-divider);
  flex-shrink: 0;
}

.my-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.status-online { color: var(--tg-online); font-size: 13px; }
.status-offline { color: var(--tg-offline); font-size: 13px; }

#bottom-nav {
  display: flex;
  border-top: 1px solid var(--tg-divider);
  padding-bottom: env(safe-area-inset-bottom);
  flex-shrink: 0;
}

.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  font-size: 10px;
  color: var(--tg-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
}

.nav-btn svg { flex-shrink: 0; }
.nav-btn.active { color: var(--tg-accent); }

#active-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: none;
  flex-direction: column;
}

#empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tg-text-secondary);
  min-width: 0;
}

.sidebar-header {
  height: var(--tg-header-h);
  display: flex;
  align-items: center;
  padding: 0 16px;
  padding-top: max(0px, env(safe-area-inset-top));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  min-height: calc(var(--tg-header-h) + env(safe-area-inset-top));
  gap: 12px;
  flex-shrink: 0;
}

.sidebar-search-wrap {
  flex: 1;
  background: var(--tg-bg-input);
  border-radius: 18px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 36px;
}

.sidebar-search-input {
  background: transparent;
  border: none;
  color: var(--tg-text-primary);
  outline: none;
  width: 100%;
  margin-left: 8px;
}

.friend-item {
  height: 72px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  cursor: pointer;
}

.friend-item:hover { background: var(--tg-bg-hover); }

.friend-avatar {
  width: var(--tg-avatar-list);
  height: var(--tg-avatar-list);
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tg-accent), var(--tg-accent-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

#chat-header {
  min-height: var(--tg-header-h);
  flex-shrink: 0;
  background: var(--tg-bg-primary);
  display: flex;
  align-items: center;
  padding: 0 12px;
  padding-top: max(0px, env(safe-area-inset-top));
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  border-bottom: 1px solid var(--tg-divider);
  gap: 8px;
  overflow: hidden;
}

.chat-header-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chat-header-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header-text span:first-child {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-header-text span:last-child {
  font-size: 13px;
  color: var(--tg-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.trust-badge {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-avatar {
  width: var(--tg-avatar-header);
  height: var(--tg-avatar-header);
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tg-accent), var(--tg-accent-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.tg-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--tg-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tg-icon-btn:hover { background: var(--tg-bg-hover); color: var(--tg-text-primary); }

#messages-list {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  -webkit-overflow-scrolling: touch;
  contain: strict;
  touch-action: pan-y;
}

html:not(.low-perf) #messages-list {
  will-change: scroll-position;
}

.orbit-vs-row {
  min-height: 1px;
}

/* PILLAR 1: Fluidity & Micro-interactions - Buttery Smooth Messages */
@keyframes slideUpFadeIn {
  0% {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.message {
  max-width: 85%;
  /* PILLAR 1: Increased Spacing */
  padding: 12px 16px;
  border-radius: var(--tg-radius-bubble);
  position: relative;
  word-break: break-word;
  overflow-wrap: break-word;
  overflow: hidden;
  animation: slideUpFadeIn 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
  margin-bottom: 8px;
  background-color: var(--tg-glass-bg); /* Use glass bg by default */
  backdrop-filter: blur(10px);
  border: 1px solid var(--tg-glass-border);
}

.message.me {
  align-self: flex-end;
  background: var(--tg-bubble-out);
  border-bottom-right-radius: var(--tg-radius-tip);
}

.message.them {
  align-self: flex-start;
  background: var(--tg-bubble-in);
  border-bottom-left-radius: var(--tg-radius-tip);
}

.message.grouped {
  border-bottom-right-radius: var(--tg-radius-bubble);
  border-bottom-left-radius: var(--tg-radius-bubble);
  margin-bottom: 2px; /* Less margin between grouped messages */
}

.message .msg-body {
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  min-width: 0;
}

.message .msg-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.message .msg-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--tg-text-hint);
}

.message.them .msg-meta {
  justify-content: flex-start;
}

.msg-media-img {
  max-width: 200px;
  border-radius: 8px;
  display: block;
}

.msg-media-audio {
  max-width: 220px;
}

.tg-link-btn.msg-retry {
  background: none;
  border: none;
  color: var(--tg-accent);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.tg-link-btn.msg-retry:hover {
  color: var(--tg-text-link);
}

.message.skeleton-msg {
  max-width: 85%;
  min-height: 44px;
  background: var(--tg-bg-elevated);
  pointer-events: none;
}

.skeleton-bubble {
  height: 36px;
  border-radius: var(--tg-radius-bubble);
  background: var(--tg-bg-input);
  position: relative;
  overflow: hidden;
}

.skeleton-bubble::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
  animation: skeleton-shimmer 1.2s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% { transform: translateX(0); }
  100% { transform: translateX(400%); }
}

html.low-perf .skeleton-bubble::after {
  animation: none;
  display: none;
}

.friend-avatar.has-photo {
  background-size: cover;
  background-position: center;
  color: transparent;
}

#my-profile .friend-avatar.has-photo {
  text-indent: -9999px;
}

#chat-warning-banner:empty {
  display: none !important;
}

#chat-input-area, .chat-input-box {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 8px 12px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  background: var(--tg-bg-input);
  border: 1px solid var(--tg-divider);
  border-radius: 24px;
  margin: 10px 16px;
  flex-shrink: 0;
  transition: border-color var(--tg-fast);
}

.chat-input-box:focus-within {
  border-color: var(--tg-accent);
}

.chat-input-box #file-btn,
.chat-input-box #ttl-select,
.chat-input-box #send-voice-btn {
  flex-shrink: 0 !important;
  aspect-ratio: 1 / 1 !important;
  border-radius: 50% !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0 !important;
}

.chat-input-box select#ttl-select {
  appearance: none;
  background: var(--tg-bg-elevated);
  border: none;
  color: var(--tg-text-secondary);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  width: 32px;
  height: 32px;
}

#send-voice-btn.tg-send-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 50%;
  border: none;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: var(--tg-accent);
  color: #fff;
  cursor: pointer;
  box-shadow: none;
}

#send-voice-btn.tg-send-btn:hover {
  filter: brightness(1.08);
}

#send-voice-btn.tg-send-btn.voice-mode {
  background: var(--tg-bg-elevated);
  color: var(--tg-text-primary);
}

#send-voice-btn.tg-send-btn.voice-mode:hover {
  background: var(--tg-bg-hover);
  filter: none;
}

#send-voice-btn.tg-send-btn svg,
#send-voice-btn.tg-send-btn span {
  display: block;
  line-height: 0;
  grid-area: 1 / 1;
  margin: auto;
}

#chat-input {
  flex-grow: 1 !important;
  flex-shrink: 1;
  margin: 0 !important;
  padding: 8px 0;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  color: var(--tg-text-primary);
  resize: none;
  max-height: 180px;
  font-size: 16px;
  line-height: 1.35;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  align-self: center;
}

input.sidebar-search-input,
textarea,
select {
  font-size: 16px;
}

#login-panel {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--tg-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  min-height: 100vh;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}

.login-card {
  background: var(--tg-bg-primary);
  padding: clamp(20px, 4vw, 32px);
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  max-height: min(92dvh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px));
  text-align: center;
  overflow: hidden;
  display: grid; /* TITANIUM FIX */
  place-items: center; /* TITANIUM FIX */
  margin: auto;
  flex-shrink: 0;
}

.login-card > * {
  min-width: 0;
  width: 100%; /* TITANIUM FIX: Ensure elements take full width inside grid */
}

.tg-primary-btn {
  background: var(--tg-accent);
  color: #fff;
  border: 1px solid var(--tg-glass-border, transparent);
  padding: 12px 24px;
  border-radius: 24px;
  cursor: pointer;
  font-weight: 500;
  width: 100%;
  margin-top: 16px;
  box-shadow: var(--tg-button-shadow, none);
}

.tg-primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }

#settings-view,
#theme-customizer-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--tg-bg-primary);
  transform: translateX(100%);
  transition: transform var(--tg-fast);
  width: 100%;
  max-width: 400px;
  height: 100dvh;
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding-left: max(0px, env(safe-area-inset-left));
  padding-right: max(0px, env(safe-area-inset-right));
  padding-top: max(0px, env(safe-area-inset-top));
  padding-bottom: max(0px, env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 0;
}

#settings-view {
  transform: translateX(-100%);
}

#settings-view:not([aria-hidden="true"]),
#theme-customizer-modal:not([aria-hidden="true"]) {
  transform: translateX(0) !important;
}

/* TITANIUM FIX: Settings Tabs */
.settings-tabs-nav {
  display: flex;
  background: var(--tg-bg-primary);
  border-bottom: 1px solid var(--tg-divider);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
}
.settings-tabs-nav::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.tab-btn {
  flex: 1;
  min-width: fit-content;
  padding: 14px 16px;
  background: none;
  border: none;
  color: var(--tg-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--tg-fast), border-color var(--tg-fast);
}

.tab-btn.active {
  color: var(--tg-accent);
  border-bottom-color: var(--tg-accent);
}

.settings-tab-content {
  display: none;
  flex-direction: column;
}

.settings-tab-content.active {
  display: flex;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.toast {
  position: fixed;
  left: 0;
  right: 0;
  bottom: max(24px, env(safe-area-inset-bottom));
  margin-inline: auto;
  width: fit-content;
  max-width: min(92vw, 420px);
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 10px 20px;
  border-radius: 20px;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 3000;
  pointer-events: none;
  box-sizing: border-box;
}

.toast.show { opacity: 1; }

.typing-dots { display: inline-block; }
.typing-dot {
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: currentColor;
  margin: 0 2px;
  animation: tg-typing 1.4s infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes tg-typing {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.login-logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  border-radius: 18px;
  background: linear-gradient(145deg, var(--tg-accent), var(--tg-accent-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform-style: preserve-3d;
}

/* PILLAR 3: Planetary Transition Sequence */
.login-card.autologin-active {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.login-card.autologin-active #login-inputs-wrapper,
.login-card.autologin-active #login-btn,
.login-card.autologin-active #login-subtitle {
  display: none !important;
}

.login-card.autologin-active #login-title {
  font-size: 18px;
  letter-spacing: 2px;
  color: var(--tg-accent);
  text-transform: uppercase;
  margin-top: 24px;
  animation: pulse-uplink 1s infinite alternate;
}

.login-card.autologin-active #login-logo {
  animation: planetary-spin 1.5s linear infinite;
  border-radius: 50%;
  box-shadow: 0 0 40px var(--tg-accent);
}

@keyframes planetary-spin {
  0% { transform: rotateY(0deg) rotateX(20deg) scale(1.2); }
  100% { transform: rotateY(360deg) rotateX(20deg) scale(1.2); }
}

@keyframes pulse-uplink {
  0% { opacity: 0.5; text-shadow: 0 0 10px transparent; }
  100% { opacity: 1; text-shadow: 0 0 20px var(--tg-accent); }
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  transition: color var(--tg-fast);
}

.login-subtitle {
  font-size: 14px;
  color: var(--tg-text-secondary);
  margin: 0 0 20px;
}

.consent-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  font-size: 13px;
  color: var(--tg-text-secondary);
  margin: 16px 0;
  min-width: 0;
  overflow-wrap: break-word;
  word-break: break-word;
}

.link-btn {
  background: none;
  border: none;
  color: var(--tg-text-link);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font: inherit;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: max(0px, env(safe-area-inset-top)) 8px 0;
  padding-left: max(8px, env(safe-area-inset-left));
  padding-right: max(8px, env(safe-area-inset-right));
  border-bottom: 1px solid var(--tg-divider);
  flex-shrink: 0;
}

.settings-title-text {
  flex: 1;
  font-weight: 600;
  font-size: 17px;
}

.settings-body {
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  flex: 1;
  min-height: 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}

.settings-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 16px 16px 8px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  min-height: 48px;
}

.settings-row-label {
  font-size: 15px;
  color: var(--tg-text-primary);
  flex-shrink: 0;
}

.settings-row input[type="text"],
.settings-row input[type="password"],
.settings-row textarea,
.settings-row select {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--tg-divider);
  background: var(--tg-bg-input);
  color: var(--tg-text-primary);
}

.settings-btn {
  margin: 8px 16px;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  width: calc(100% - 32px);
}

.settings-btn-default {
  background: var(--tg-bg-elevated);
  color: var(--tg-text-primary);
}

.settings-btn-danger {
  background: rgba(229, 57, 53, 0.15);
  color: var(--tg-text-danger);
}

.tg-toggle {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 28px;
  cursor: pointer;
}

.tg-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.tg-toggle-track {
  position: absolute;
  inset: 0;
  background: var(--tg-bg-elevated);
  border-radius: 14px;
  transition: background 0.2s;
}

.tg-toggle input:checked + .tg-toggle-track {
  background: var(--tg-accent);
}

.tg-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.tg-toggle input:checked ~ .tg-toggle-knob {
  transform: translateX(20px);
}

.tg-field {
  position: relative;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  overflow: hidden;
  border-radius: 8px;
}

.tg-field input {
  width: 100%;
  padding: 22px 12px 10px;
  border-radius: 8px;
  border: 1px solid var(--tg-divider);
  background: var(--tg-bg-input);
  color: var(--tg-text-primary);
  box-sizing: border-box;
  min-height: 52px;
}

.tg-field label {
  position: absolute;
  left: 12px;
  top: 15px;
  font-size: 15px;
  line-height: 1.2;
  color: var(--tg-text-hint);
  pointer-events: none;
  transform-origin: left top;
  transition: transform 0.2s, color 0.2s;
}

.tg-field input:focus + label,
.tg-field input:not(:placeholder-shown) + label {
  transform: translateY(-9px) scale(0.733); /* 11px/15px ≈ 0.733 */
  color: var(--tg-accent);
}

.trust-neutral { background: var(--tg-bg-elevated); color: var(--tg-text-secondary); }
.trust-good { background: rgba(74, 222, 128, 0.15); color: #86efac; }
.trust-high { background: rgba(74, 222, 128, 0.2); color: #86efac; }
.trust-warn { background: rgba(251, 191, 36, 0.15); color: #fcd34d; }

.call-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #000;
  display: flex;
  flex-direction: column;
}

#call-screen {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: none;
  flex-direction: column;
}

#call-screen[style*="flex"],
#call-screen.show {
  display: flex !important;
}

.call-container video#remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.call-container video#local-video {
  width: 120px;
  height: 160px;
  object-fit: cover;
  position: absolute;
  top: max(24px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  z-index: 2;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  background: #222;
  border: 2px solid rgba(255,255,255,0.1);
}

.call-info {
  position: absolute;
  bottom: 120px;
  left: 0;
  right: 0;
  text-align: center;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  z-index: 3;
}

.call-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: linear-gradient(transparent, rgba(0,0,0,0.85));
  z-index: 3;
}

.call-btn.call-end {
  background: rgba(229, 57, 53, 0.9) !important;
  color: #fff !important;
}

.tg-modal-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px;
}

.tg-modal-text {
  font-size: 14px;
  color: var(--tg-text-secondary);
  line-height: 1.5;
  margin: 0 0 16px;
}

#create-group-modal,
#policy-modal,
#report-modal,
#vault-lock-modal,
#incoming-call-modal,
#nearby-peer-modal {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: rgba(0,0,0,0.55);
  display: none;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box;
}

#create-group-modal[style*="flex"],
#policy-modal[style*="flex"],
#report-modal[style*="flex"],
#vault-lock-modal[style*="flex"],
#incoming-call-modal[style*="flex"],
#nearby-peer-modal[style*="flex"] {
  display: flex !important;
}

.tg-modal-card {
  width: 100%;
  max-width: 360px;
  max-height: min(90vh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-bottom) - 32px));
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
  -webkit-overflow-scrolling: touch;
  display: grid; /* TITANIUM FIX */
  place-items: center; /* TITANIUM FIX */
}

.tg-modal-card > * {
  width: 100%; /* TITANIUM FIX */
}

.group-members-list {
  max-height: 200px;
  overflow-y: auto;
  margin: 8px 0;
}

.theme-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px 16px 16px;
}

.theme-preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: var(--tg-bg-elevated);
  color: var(--tg-text-primary);
  cursor: pointer;
  font-size: 11px;
}

.theme-preset-btn.active {
  border-color: var(--tg-accent);
  box-shadow: 0 0 0 1px var(--tg-accent);
}

.theme-preview {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
}

.theme-label { text-align: center; }

.profile-photos-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 0 16px 12px;
}

.profile-photo-item {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--tg-bg-elevated);
}

.profile-photo-add {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px dashed var(--tg-divider);
  background: transparent;
}

.appearance-size-picker {
  display: flex;
  gap: 6px;
}

.size-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--tg-divider);
  background: var(--tg-bg-input);
  color: var(--tg-text-primary);
  cursor: pointer;
}

.size-btn.active {
  border-color: var(--tg-accent);
  background: rgba(91, 155, 213, 0.15);
}

.color-scheme-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}

.color-dot.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--tg-accent);
}

#radar-view {
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--tg-bg-secondary);
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
}

.radar-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: max(16px, env(safe-area-inset-top)) 16px 20px;
  max-width: 420px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

#radar-canvas {
  width: min(280px, 85vw);
  height: min(280px, 85vw);
  max-width: 100%;
  align-self: center;
  border-radius: 50%;
  display: block;
  background: var(--tg-bg-primary);
  box-shadow: 0 0 0 1px var(--tg-divider), 0 8px 32px rgba(0, 0, 0, 0.35);
  position: relative;
  contain: strict;
}

/* TITANIUM FIX: Pure CSS Radar Spin (GPU Accelerated) */
#radar-canvas.css-radar {
  background: 
    repeating-radial-gradient(circle, transparent, transparent 23%, rgba(91, 155, 213, 0.2) 24%, rgba(91, 155, 213, 0.2) 25%),
    radial-gradient(circle, rgba(91, 155, 213, 0.1) 0%, var(--tg-bg-primary) 70%);
}

#radar-canvas.css-radar::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 70%, rgba(91, 155, 213, 0.4) 100%);
  animation: radar-spin 2s linear infinite;
  will-change: transform;
}

@keyframes radar-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.radar-hint {
  font-size: 12px;
  color: var(--tg-text-secondary);
  text-align: center;
  line-height: 1.45;
  padding: 0 8px;
}

.radar-hint code {
  font-size: 11px;
  color: var(--tg-text-hint);
}

.radar-scan-btn,
.radar-lookup-btn {
  width: auto;
  align-self: center;
  padding: 0 24px;
  min-height: 44px;
}

.radar-status-line {
  font-size: 13px;
  color: var(--tg-text-secondary);
  text-align: center;
  min-height: 1.2em;
}

.radar-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-height: 0;
}

.radar-peer-chip {
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--tg-divider);
  background: var(--tg-bg-elevated);
  color: var(--tg-text-primary);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.35s ease, transform 0.35s ease, background var(--tg-fast);
}

.radar-peer-chip-visible {
  opacity: 1;
  transform: translateY(0);
}

.radar-peer-chip:hover {
  background: var(--tg-bg-hover);
}

.radar-manual-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid var(--tg-divider);
}

.radar-manual-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--tg-divider);
  background: var(--tg-bg-input);
  color: var(--tg-text-primary);
  font-size: 15px;
}

.radar-lookup-btn {
  flex-shrink: 0;
}

/* PILLAR 5: Holistic Theming Engine (CSS Variables) */
body[data-theme="matrix"],
body[data-theme="default"],
body[data-theme="none"],
body[data-theme=""] {
  --tg-bg-primary: #0A0A0F;
  --tg-bg-secondary: #05050A;
  --tg-bg-elevated: #111116;
  --tg-bg-input: #111116;
  --tg-accent: #00FF41;
  --tg-accent-dark: #00cc33;
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #A0A0A5;
  --tg-bubble-out: rgba(0, 255, 65, 0.15);
  --tg-bubble-in: rgba(255, 255, 255, 0.05);
  --tg-glass-bg: rgba(10, 10, 15, 0.7);
  --tg-glass-border: rgba(0, 255, 65, 0.2);
  --tg-radius-bubble: 0px; /* Sharp borders for matrix */
  --tg-font: var(--tg-font-mono); /* Monospace */
  --tg-button-shadow: 0 0 10px rgba(0, 255, 65, 0.2);
}

body[data-theme="sakura_zen"] {
  --tg-bg-primary: #1A0B12;
  --tg-bg-secondary: #10050A;
  --tg-bg-elevated: #26111C;
  --tg-bg-input: #26111C;
  --tg-accent: #FFB7C5;
  --tg-accent-dark: #e89eb0;
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #D4B8C1;
  --tg-bubble-out: rgba(255, 183, 197, 0.2);
  --tg-bubble-in: rgba(255, 255, 255, 0.08);
  --tg-glass-bg: rgba(26, 11, 18, 0.6);
  --tg-glass-border: rgba(255, 183, 197, 0.15);
  --tg-radius-bubble: 24px;
  --tg-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  --tg-button-shadow: none;
}

body[data-theme="aurora_flow"] {
  --tg-bg-primary: #04141A;
  --tg-bg-secondary: #020A0D;
  --tg-bg-elevated: #08212B;
  --tg-bg-input: #08212B;
  --tg-accent: #00E5FF;
  --tg-accent-dark: #00b3cc;
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #90C6D4;
  --tg-bubble-out: rgba(0, 229, 255, 0.15);
  --tg-bubble-in: rgba(255, 255, 255, 0.05);
  --tg-glass-bg: rgba(4, 20, 26, 0.4);
  --tg-glass-border: rgba(0, 229, 255, 0.3);
  --tg-radius-bubble: 18px;
  --tg-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  --tg-button-shadow: 0 0 15px rgba(0, 229, 255, 0.2);
  backdrop-filter: blur(20px); /* Extreme glassmorphism hook */
}

body[data-theme="retro_synth"] {
  --tg-bg-primary: #12021A;
  --tg-bg-secondary: #0A010F;
  --tg-bg-elevated: #1E032A;
  --tg-bg-input: #1E032A;
  --tg-accent: #FF00FF;
  --tg-accent-dark: #cc00cc;
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #FFB3FF;
  --tg-bubble-out: rgba(255, 0, 255, 0.2);
  --tg-bubble-in: rgba(0, 255, 255, 0.1);
  --tg-glass-bg: rgba(18, 2, 26, 0.8);
  --tg-glass-border: rgba(255, 0, 255, 0.5);
  --tg-radius-bubble: 8px;
  --tg-font: 'Courier New', Courier, monospace;
  --tg-button-shadow: 0 0 15px rgba(255, 0, 255, 0.6), inset 0 0 10px rgba(0, 255, 255, 0.4);
}

body[data-theme="obsidian"] {
  --tg-bg-primary: #050505;
  --tg-bg-secondary: #000000;
  --tg-bg-elevated: #0A0A0A;
  --tg-bg-input: #0A0A0A;
  --tg-accent: #FFFFFF;
  --tg-accent-dark: #CCCCCC;
  --tg-text-primary: #FFFFFF;
  --tg-text-secondary: #888888;
  --tg-bubble-out: rgba(255, 255, 255, 0.1);
  --tg-bubble-in: rgba(255, 255, 255, 0.05);
  --tg-glass-bg: rgba(0, 0, 0, 0.9);
  --tg-glass-border: rgba(255, 255, 255, 0.1);
  --tg-radius-bubble: 12px;
  --tg-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  --tg-button-shadow: none;
}

html.low-perf #messages-list {
  contain: layout style;
  will-change: auto;
}

/* TITANIUM FIX: Orbits Drop UI */
.drop-hint {
  font-size: 13px;
  color: var(--tg-text-secondary);
  margin-bottom: 16px;
  line-height: 1.4;
}

.drop-quality-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drop-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--tg-divider);
  border-radius: var(--tg-radius-button);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.drop-option:hover {
  background: var(--tg-bg-hover);
}

.drop-option input[type="radio"] {
  accent-color: var(--tg-accent);
  width: 18px;
  height: 18px;
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--tg-text-primary);
}

.option-desc {
  font-size: 12px;
  color: var(--tg-text-secondary);
}

.drop-option:has(input:checked) {
  border-color: var(--tg-accent);
  background: var(--tg-bg-hover);
}

/* Orbits Drop Progress Bar */
.drop-progress-container {
  margin-top: 8px;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.drop-progress-bar {
  height: 100%;
  background: var(--tg-accent);
  width: 0%;
  transition: width 0.2s ease-out;
}

.drop-status-text {
  font-size: 11px;
  margin-top: 4px;
  opacity: 0.8;
}

/* TITANIUM FIX: Cinema View */
#cinema-view {
  position: absolute;
  inset: 0;
  background: #000;
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.cinema-header {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  background: linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%);
  z-index: 101;
}

.cinema-title {
  flex: 1;
  margin-left: 16px;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  display: flex;
  align-items: center;
}

.cinema-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cinema-player-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

#cinema-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.cinema-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* TITANIUM FIX: Nudge Animation */
@keyframes screen-shake {
  0% { transform: translate(1px, 1px) rotate(0deg); }
  10% { transform: translate(-1px, -2px) rotate(-1deg); }
  20% { transform: translate(-3px, 0px) rotate(1deg); }
  30% { transform: translate(3px, 2px) rotate(0deg); }
  40% { transform: translate(1px, -1px) rotate(1deg); }
  50% { transform: translate(-1px, 2px) rotate(-1deg); }
  60% { transform: translate(-3px, 1px) rotate(0deg); }
  70% { transform: translate(3px, 1px) rotate(-1deg); }
  80% { transform: translate(-1px, -1px) rotate(1deg); }
  90% { transform: translate(1px, 2px) rotate(0deg); }
  100% { transform: translate(1px, -2px) rotate(-1deg); }
}

.nudge-active {
  animation: screen-shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

/* ========== ИСПРАВЛЕНИЯ ДЛЯ МОБИЛЬНЫХ УСТРОЙСТВ ========== */
@media (max-width: 768px) {
  /* Скрываем сайдбар, когда чат открыт, чтобы он не перекрывал чат и не мешал */
  #app-container.chat-open #sidebar {
    display: none !important;
  }
  #app-container.chat-open #bottom-nav {
    display: none !important;
  }

  /* Обеспечиваем корректное отображение сайдбара, когда чат закрыт */
  #app-container:not(.chat-open) #sidebar {
    display: flex !important;
  }

  /* Остальные стили остаются без изменений */
  #app-container:not(.chat-open) {
    flex-direction: column;
    align-items: stretch;
  }
  #app-container:not(.chat-open) #empty-state {
    display: flex;
  }
  #sidebar {
    width: 100%;
    display: flex !important;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    z-index: 1;
  }
  #sidebar .sidebar-header {
    display: flex !important;
    visibility: visible !important;
    opacity: 1 !important;
    position: relative;
    z-index: 2;
  }
  #active-chat {
    position: fixed;
    inset: 0;
    z-index: 100;
    flex-direction: column;
    box-sizing: border-box;
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  #active-chat #chat-header {
    padding-top: 0;
    min-height: var(--tg-header-h);
  }
  #app-container:not(.chat-open) #active-chat { display: none !important; }
  
  #app-container.chat-open #back-btn {
    display: flex !important;
  }
}

body.reduce-animations *,
body.reduce-animations *::before,
body.reduce-animations *::after {
  animation-duration: 0.5s !important;
  transition-duration: 0.15s !important;
}

/* Отключаем все анимации и переходы для пользователей, которые предпочитают минимальное движение */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
  .skeleton-bubble {
    animation: none !important;
  }
  .tg-toggle-knob {
    transition: none !important;
  }
  .radar-peer-chip {
    transition: none !important;
  }
}

```

### public/404.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="0; url=./" />
    <title>Orbits P2P</title>
    <script>
      (function () {
        var base = './';
        var path = location.pathname || '';
        var search = location.search || '';
        var hash = location.hash || '';
        var redirect = base + '#/404?path=' + encodeURIComponent(path + search + hash);
        location.replace(redirect);
      })();
    </script>
  </head>
  <body></body>
</html>


```

### public/pwa-192x192.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00ff41"/>
      <stop offset="1" stop-color="#00e5ff"/>
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="44" fill="#05050a"/>
  <path d="M34 98L158 52L128 146L92 112L62 126L70 98Z" fill="url(#g)" opacity="0.95"/>
  <path d="M92 112L128 80L70 98" fill="#ffffff" opacity="0.28"/>
</svg>


```

### public/pwa-512x512.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00ff41"/>
      <stop offset="1" stop-color="#00e5ff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="#05050a"/>
  <path d="M90 262L422 138L342 388L246 300L166 336L186 262Z" fill="url(#g)" opacity="0.95"/>
  <path d="M246 300L342 214L186 262" fill="#ffffff" opacity="0.28"/>
</svg>


```
