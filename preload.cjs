/**
 * Electron preload: contextIsolation on, nodeIntegration off.
 * Expose only what the renderer needs later via contextBridge (currently empty).
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('orbitsElectron', {
    platform: process.platform,
});
