// Runs before the page, with access to a few Electron features. It exposes one small, safe object to the page:
//   window.daubDesktop.platform     'darwin' | 'win32' | 'linux'
//   window.daubDesktop.onMenu(cb)   called with an action name when a native menu item is chosen
//   window.daubDesktop.getInfo()    { version, platform }
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daubDesktop', {
  platform: process.platform,
  onMenu: (callback) => { ipcRenderer.on('menu', (_event, action) => callback(action)); },
  getInfo: () => ipcRenderer.invoke('app:info'),
});
