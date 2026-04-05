import fs from 'fs';
import path from 'path';

const root = process.cwd();

const filesToEmbed = [
  'index.html',
  'vite.config.js',
  'src/main.js',
  'src/core/crypto.js',
  'src/core/base64.js',
  'src/core/wireCrypto.js',
  'src/workers/crypto.worker.js',
  'src/workers/themeWorker.js',
  'src/ui/themeManager.js',
  'src/core/orbitsDrop.js',
  'src/core/callManager.js',
  'src/styles/style.css',
  'public/404.html',
  'public/pwa-192x192.svg',
  'public/pwa-512x512.svg'
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function listFiles(dirRel) {
  const abs = path.join(root, dirRel);
  let out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dirRel.replace(/\\/g, '/'), ent.name);
    if (ent.isDirectory()) out = out.concat(listFiles(rel));
    else out.push(rel);
  }
  return out;
}

function listJsModules() {
  return listFiles('src').filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
}

function languageForFile(f) {
  if (f.endsWith('.css')) return 'css';
  if (f.endsWith('.html')) return 'html';
  if (f.endsWith('.svg')) return 'xml';
  return 'js';
}

const jsFiles = listJsModules();

let dependencyMap = '';
for (const f of jsFiles) {
  const txt = read(f);
  const imports = txt
    .split(/\r?\n/)
    .filter((l) => /^\s*import\s/.test(l))
    .map((l) => '`' + l.trim() + '`');
  dependencyMap += `\n### ${f}\n`;
  dependencyMap += imports.length ? imports.join('\n') + '\n' : '(no imports)\n';
}

const issues = `
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
`;

const checklist = `
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
`;

let out = '# Orbits P2P — Audit & Fix Report\n';
out += '\n## Dependency map (import graph, raw)\n';
out += dependencyMap;
out += issues;
out += checklist;
out += '\n## Полные файлы (изменённые/ключевые)\n';

for (const f of filesToEmbed) {
  out += `\n### ${f}\n\n\`\`\`${languageForFile(f)}\n`;
  out += read(f);
  out += '\n\`\`\`\n';
}

fs.writeFileSync(path.join(root, 'TRAE_AUDIT_REPORT.md'), out, 'utf8');
process.stdout.write('Wrote TRAE_AUDIT_REPORT.md\n');

