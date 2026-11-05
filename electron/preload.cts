import type { YouTubeQuery, EmbedBounds } from "./youtube-types.cjs";
import type { PlaybackProgress } from "./playback-types.cjs";
import type { LibraryQuery } from "./library-types.cjs";
import { contextBridge, ipcRenderer } from "electron";

// Fixed capabilities only: no arbitrary channels, URLs, paths, or Node APIs.
contextBridge.exposeInMainWorld(
  "frame",
  Object.freeze({
    getAppInfo: () => ipcRenderer.invoke("frame:info"),
    openYouTube: () => ipcRenderer.invoke("frame:youtube-home"),
    youtube: Object.freeze({
      status: () => ipcRenderer.invoke("youtube:status"),
      importKey: () => ipcRenderer.invoke("youtube:import-key"),
      clearKey: () => ipcRenderer.invoke("youtube:clear-key"),
      list: (query: YouTubeQuery) => ipcRenderer.invoke("youtube:list", query),
      savedFlags: (ids: string[]) =>
        ipcRenderer.invoke("youtube:saved-flags", ids),
      save: (value: string) => ipcRenderer.invoke("youtube:save", value),
      unsave: (id: string) => ipcRenderer.invoke("youtube:unsave", id),
      saved: (search: string, offset: number) =>
        ipcRenderer.invoke("youtube:saved", search, offset),
      openBrowser: (id: string) =>
        ipcRenderer.invoke("youtube:open-browser", id),
      playerOpen: (id: string) => ipcRenderer.invoke("youtube:player-open", id),
      playerBounds: (token: string, bounds: EmbedBounds) =>
        ipcRenderer.invoke("youtube:player-bounds", token, bounds),
      playerClose: (token: string) =>
        ipcRenderer.invoke("youtube:player-close", token),
      onPlayerState: (
        callback: (state: { token: string; error: string | null }) => void,
      ) => {
        const listener = (
          _event: Electron.IpcRendererEvent,
          state: { token: string; error: string | null },
        ) => callback(state);
        ipcRenderer.on("youtube:player-state", listener);
        return () =>
          ipcRenderer.removeListener("youtube:player-state", listener);
      },
    }),
    playback: Object.freeze({
      open: (id: string) => ipcRenderer.invoke("playback:open", id),
      save: (token: string, progress: PlaybackProgress) =>
        ipcRenderer.invoke("playback:save", token, progress),
      close: (token: string) => ipcRenderer.invoke("playback:close", token),
      history: (offset: number) =>
        ipcRenderer.invoke("playback:history", offset),
      subtitles: (token: string) =>
        ipcRenderer.invoke("playback:subtitles", token),
    }),
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
