import { app, BrowserWindow, powerMonitor } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Better WebRTC / GPU decode on some hardware (use with care). */
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const isDev = process.env.NODE_ENV === 'development';

/** Main window reference for idle session cleanup. */
let mainWindow = null;
let lastIdleStorageClear = 0;

function createWindow() {
  let splash = null;
  if (!isDev) {
    splash = new BrowserWindow({
      width: 360,
      height: 200,
      frame: false,
      show: true,
      center: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    splash.loadFile(path.join(__dirname, 'splash.html'));
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundThrottling: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) {
      splash.destroy();
      splash = null;
    }
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow
      .loadFile(path.join(__dirname, 'dist', 'index.html'))
      .catch(() => mainWindow.loadFile(path.join(__dirname, 'index.html')));
    autoUpdater.checkForUpdatesAndNotify();
  }
}

app.whenReady().then(() => {
  createWindow();

  /** Periodically clear Cache Storage when the machine has been idle (15+ min) to cap disk use. */
  setInterval(() => {
    try {
      const idle = typeof powerMonitor.getSystemIdleTime === 'function' ? powerMonitor.getSystemIdleTime() : 0;
      if (idle < 900) return;
      const now = Date.now();
      if (now - lastIdleStorageClear < 60 * 60 * 1000) return;
      const sess = mainWindow?.webContents?.session;
      if (!sess) return;
      lastIdleStorageClear = now;
      sess.clearStorageData({ storages: ['cachestorage'] }).catch(() => {});
    } catch (_) {}
  }, 5 * 60 * 1000);
});

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
