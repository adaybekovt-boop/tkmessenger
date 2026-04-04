const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('orbitsElectron', {
  platform: process.platform,
});