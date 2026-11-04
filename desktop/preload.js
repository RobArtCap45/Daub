// Runs before the page, with access to a few Electron features. It exposes one small, safe object to the page:
//   window.loomDesktop.platform     'darwin' | 'win32' | 'linux'
//   window.loomDesktop.onMenu(cb)   called with an action name when a native menu item is chosen
//   window.loomDesktop.getInfo()    { version, platform }
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loomDesktop', {
  platform: process.platform,
  onMenu: (callback) => { ipcRenderer.on('menu', (_event, action) => callback(action)); },
  getInfo: () => ipcRenderer.invoke('app:info'),
});
