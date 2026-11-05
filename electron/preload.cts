import { contextBridge, ipcRenderer } from 'electron';

// Fixed capabilities only: no arbitrary channels, URLs, paths, or Node APIs.
contextBridge.exposeInMainWorld('frame', Object.freeze({
  getAppInfo: () => ipcRenderer.invoke('frame:info'),
  openYouTube: () => ipcRenderer.invoke('frame:youtube-home'),
}));
