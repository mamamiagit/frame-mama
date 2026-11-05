import type { LibraryQuery } from "./library-types.cjs";
import { contextBridge, ipcRenderer } from "electron";

// Fixed capabilities only: no arbitrary channels, URLs, paths, or Node APIs.
contextBridge.exposeInMainWorld(
  "frame",
  Object.freeze({
    getAppInfo: () => ipcRenderer.invoke("frame:info"),
    openYouTube: () => ipcRenderer.invoke("frame:youtube-home"),
    library: Object.freeze({
      list: (query: LibraryQuery) => ipcRenderer.invoke("library:list", query),
      importVideos: () => ipcRenderer.invoke("library:import"),
      refresh: () => ipcRenderer.invoke("library:refresh"),
      remove: (id: string) => ipcRenderer.invoke("library:remove", id),
      onProgress: (
        callback: (
          progress: { completed: number; total: number } | null,
        ) => void,
      ) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          progress: { completed: number; total: number } | null,
        ) => callback(progress);
        ipcRenderer.on("library:progress", listener);
        return () => ipcRenderer.removeListener("library:progress", listener);
      },
    }),
  }),
);
