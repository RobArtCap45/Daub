// Daub desktop app (Electron main process).
// It opens app/index.html in a window, adds a native menu, and keeps the page locked down:
// no Node.js in the page, no navigation away from the app, links open in your browser.
'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';
const smokeTest = process.argv.includes('--smoke-test'); // used by CI: open the app, check it works, exit
const REPO = 'https://github.com/RobArtCap45/Daub';

let win = null;

if (!smokeTest && !app.requestSingleInstanceLock()) app.quit(); // one Daub window per user; a second launch focuses the first
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
if (smokeTest) app.disableHardwareAcceleration();

app.setName('Daub');
app.setAboutPanelOptions({ applicationName: 'Daub', applicationVersion: app.getVersion(), copyright: 'Released under CC0', website: REPO });

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#f3f3f1',
    title: 'Daub',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !smokeTest, // the smoke test never shows its window; keep timers and animation running
    },
  });
  win.once('ready-to-show', () => { if (!smokeTest) win.show(); });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  const openExternal = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file://')) { event.preventDefault(); openExternal(url); } });
  win.on('closed', () => { win = null; });
}

// ---- native menu. Items send a command to the page, which clicks the matching button.
const send = (action) => { if (win) win.webContents.send('menu', action); };

function buildMenu() {
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Sketch…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Save Sketch…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { type: 'separator' },
        { label: 'Import SVG…', accelerator: 'CmdOrCtrl+I', click: () => send('importSvg') },
        { label: 'Export PNG', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('png') },
        { label: 'Export SVG', click: () => send('svg') },
        { label: 'Export Video (WebM)…', click: () => send('video') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/redo go to the page so it can choose: text undo in a text box, or undo of your sketch.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: () => send('redo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', visible: false, acceleratorWorksWhenHidden: true, click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { label: 'Window', submenu: isMac ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : [{ role: 'minimize' }, { role: 'maximize' }] },
    {
      role: 'help',
      submenu: [
        ...(isMac ? [] : [
          { label: 'About Daub', click: () => dialog.showMessageBox(win, { type: 'info', title: 'About Daub', message: 'Daub ' + app.getVersion(), detail: 'Released under CC0 (public domain).\n' + REPO }) },
          { type: 'separator' },
        ]),
        { label: 'Documentation', click: () => shell.openExternal(REPO + '/tree/main/docs') },
        { label: 'Report an Issue', click: () => shell.openExternal(REPO + '/issues/new/choose') },
        { label: 'Daub on GitHub', click: () => shell.openExternal(REPO) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- smoke test: load the app, exercise each workspace, and exit 0 (ok) or 1 (broken)
function runSmokeTest() {
  const fail = (message) => { console.error('SMOKE TEST FAILED: ' + message); app.exit(1); };
  setTimeout(() => fail('timed out after 60 seconds'), 60000);
  // Newer Electron passes one event object ({ level, message }); older versions passed (event, level, message).
  win.webContents.on('console-message', (e, ...old) => {
    const level = e.level !== undefined ? e.level : old[0], message = e.message !== undefined ? e.message : old[1];
    if (level === 'error' || level >= 3) console.error('page error: ' + message);
  });
  win.webContents.once('did-fail-load', (_e, code, desc) => fail('page failed to load: ' + desc));
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = { desktopBridge: !!(window.daubDesktop && window.daubDesktop.platform), tabs: document.querySelectorAll('.tabs button').length };
        out.nodesExample = Daub.evaluate(Daub.app.editor.project, { time: 0 }).geo.length;
        for (const tab of ['design', 'script', 'code', 'nodes']) { Daub.app.setMode(tab); await wait(150); }
        out.scriptRoundTrip = Daub.script.compile(Daub.script.decompile(Daub.app.editor.project)).nodes.length;
        // regression: load an example while another tab is open; the node graph must still be framed when you return
        Daub.app.setMode('design'); await wait(100);
        document.querySelector('#exMenu summary').click(); [...document.querySelectorAll('#exList button')].find((b) => b.textContent === 'Star field').click(); await wait(400);
        { const g = document.querySelector('#graph').getBoundingClientRect(), nodes = [...document.querySelectorAll('#graph .node')];
          out.graphFits = nodes.length > 0 && nodes.every((n) => { const q = n.getBoundingClientRect(); return q.left >= g.left - 2 && q.right <= g.right + 2 && q.top >= g.top - 2 && q.bottom <= g.bottom + 2; }); }
        const code = Daub.examples.code.find((e) => e.name === 'Flocking');
        Daub.app.setMode('code'); document.querySelector('#code').value = code.code; document.querySelector('#run').click(); await wait(400);
        out.codeStatus = document.querySelector('#status').textContent;
        out.canvasHasColor = (() => { const c = document.querySelector('#cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 211) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return seen.size > 1; })();
        return out;
      })()`);
      console.log('smoke test result: ' + JSON.stringify(result));
      if (!result.desktopBridge) return fail('desktop bridge (preload) is missing');
      if (result.tabs !== 4) return fail('expected 4 workspace tabs, found ' + result.tabs);
      if (!(result.nodesExample > 0)) return fail('the default sketch drew nothing');
      if (!(result.scriptRoundTrip > 0)) return fail('script round trip failed');
      if (!result.graphFits) return fail('the node graph is not framed after loading an example from another tab');
      if (/⚠/.test(result.codeStatus)) return fail('code sketch error: ' + result.codeStatus);
      if (!result.canvasHasColor) return fail('the canvas is blank');
      console.log('SMOKE TEST PASSED');
      app.exit(0);
    } catch (err) { fail(err && err.message ? err.message : String(err)); }
  });
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

app.whenReady().then(() => {
  // The app needs no camera, microphone, location or notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  buildMenu();
  createWindow();
  if (smokeTest) runSmokeTest();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
