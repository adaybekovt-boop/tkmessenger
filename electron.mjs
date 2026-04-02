import { app, BrowserWindow, powerMonitor } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;
let lastIdleStorageClear = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    show: false,
    backgroundThrottling: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      v8CacheOptions: 'bypassHeatCheck',
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
      .catch(() => mainWindow.loadFile(path.join(__dirname, 'index.html')));
    autoUpdater.checkForUpdatesAndNotify();
  }
}

app.whenReady().then(() => {
  createWindow();
  setInterval(() => {
    try {
      const idle = powerMonitor.getSystemIdleTime?.() ?? 0;
      if (idle < 900) return;
      const now = Date.now();
      if (now - lastIdleStorageClear < 3600000) return;
      lastIdleStorageClear = now;
      mainWindow?.webContents?.session.clearStorageData({ storages: ['cachestorage'] }).catch(() => {});
    } catch (_) {}
  }, 300000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});