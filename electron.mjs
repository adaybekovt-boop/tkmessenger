import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Отключаем меню для большего эффекта приложения
  win.setMenuBarVisibility(false);

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    // В продакшене загружаем скомпилированный файл из Vite
    win.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(() => {
      win.loadFile(path.join(__dirname, 'index.html'));
    });
    
    // Инициализация автообновления
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdates().catch(() => {});
  }
}

autoUpdater.on('update-available', () => {
  console.log('[updater] update available');
});

autoUpdater.on('update-not-available', () => {
  console.log('[updater] app is up to date');
});

autoUpdater.on('error', (err) => {
  console.error('[updater] error', err?.message || err);
});

autoUpdater.on('update-downloaded', () => {
  console.log('[updater] update downloaded, restarting');
  setTimeout(() => autoUpdater.quitAndInstall(), 1500);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
