const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Файловые операции для Orbits Drop
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  saveFile: (data, defaultName) => ipcRenderer.invoke('dialog:saveFile', data, defaultName),

  // Информация о версии
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Проверка среды
  isElectron: true
});