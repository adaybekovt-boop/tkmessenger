import { app, BrowserWindow, session, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (!fs.existsSync(indexPath)) {
      console.error('❌ dist/index.html not found. Run `npm run build` first.');
      app.quit();
      return;
    }
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'notifications'];
    callback(allowedPermissions.includes(permission));
  });

  ipcMain.handle('dialog:selectFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    return result;
  });

  ipcMain.handle('dialog:saveFile', async (event, data, defaultName) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, Buffer.from(data));
      return { success: true, path: result.filePath };
    }
    return { success: false };
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  createWindow();
  if (!isDev) {
    import('electron-updater').then(({ autoUpdater }) => {
      autoUpdater.checkForUpdatesAndNotify();
    }).catch(err => {
      console.warn('Auto-updater not available:', err.message);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});