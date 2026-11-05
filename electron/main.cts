import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const devUrl = !app.isPackaged && process.env.FRAME_DEV_URL === 'http://127.0.0.1:5173'
  ? process.env.FRAME_DEV_URL : undefined;
const appUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
let window: BrowserWindow | null = null;

function trustedSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || url?.split('#')[0] !== (devUrl ? `${devUrl}/` : appUrl)) {
    throw new Error('Untrusted IPC sender');
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 760, minHeight: 600,
    title: 'Frame', backgroundColor: '#101111', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== (devUrl ? `${devUrl}/` : appUrl)) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (devUrl) void window.loadURL(devUrl); else void window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('closed', () => { window = null; });
}

app.whenReady().then(() => {
  ipcMain.handle('frame:info', event => { trustedSender(event); return { version: app.getVersion(), platform: process.platform }; });
  ipcMain.handle('frame:youtube-home', async event => { trustedSender(event); await shell.openExternal('https://www.youtube.com/'); });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
