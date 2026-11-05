import type {
  MediaRef,
  OrganizationSettings,
  PlaybackPreferences,
} from "./organization-types.cjs";
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
    downloads: Object.freeze({
      list: () => ipcRenderer.invoke("downloads:list"),
      add: (value: { url: string; authorized: boolean }) => ipcRenderer.invoke("downloads:add", value),
      cancel: (id: string) => ipcRenderer.invoke("downloads:cancel", id),
      retry: (id: string) => ipcRenderer.invoke("downloads:retry", id),
      remove: (id: string) => ipcRenderer.invoke("downloads:remove", id),
    }),
    organization: Object.freeze({
      list: () => ipcRenderer.invoke("organization:list"),
      create: (name: string) => ipcRenderer.invoke("organization:create", name),
      rename: (id: string, name: string) =>
        ipcRenderer.invoke("organization:rename", id, name),
      delete: (id: string) => ipcRenderer.invoke("organization:delete", id),
      detail: (id: string) => ipcRenderer.invoke("organization:detail", id),
      add: (id: string, source: MediaRef) =>
        ipcRenderer.invoke("organization:add", id, source),
      removeEntry: (id: string, entry: string) =>
        ipcRenderer.invoke("organization:remove-entry", id, entry),
      reorder: (id: string, order: string[]) =>
        ipcRenderer.invoke("organization:reorder", id, order),
      localLater: () => ipcRenderer.invoke("organization:local-later"),
      isLocalLater: (id: string) =>
        ipcRenderer.invoke("organization:is-local-later", id),
      localLaterCount: () =>
        ipcRenderer.invoke("organization:local-later-count"),
      saveLocalLater: (id: string, save: boolean) =>
        ipcRenderer.invoke("organization:save-local-later", id, save),
      settings: () => ipcRenderer.invoke("organization:settings"),
      updateSettings: (patch: Partial<OrganizationSettings>) =>
        ipcRenderer.invoke("organization:update-settings", patch),
      initializePlayback: (prefs: PlaybackPreferences) =>
        ipcRenderer.invoke("organization:initialize-playback", prefs),
      updatePlayback: (prefs: PlaybackPreferences) =>
        ipcRenderer.invoke("organization:update-playback", prefs),
      youtubeVisits: (offset: number) =>
        ipcRenderer.invoke("organization:youtube-visits", offset),
      removeVisit: (id: string) =>
        ipcRenderer.invoke("organization:remove-visit", id),
      removeHistory: (id: string) =>
        ipcRenderer.invoke("organization:remove-history", id),
      clearHistory: () => ipcRenderer.invoke("organization:clear-history"),
      directories: () => ipcRenderer.invoke("organization:directories"),
      addDirectory: () => ipcRenderer.invoke("organization:add-directory"),
      removeDirectory: (id: string) =>
        ipcRenderer.invoke("organization:remove-directory", id),
      scanDirectory: (id: string) =>
        ipcRenderer.invoke("organization:scan-directory", id),
      downloadDirectory: () =>
        ipcRenderer.invoke("organization:download-directory"),
      chooseDownloadDirectory: () =>
        ipcRenderer.invoke("organization:choose-download-directory"),
      storage: () => ipcRenderer.invoke("organization:storage"),
      clearThumbnails: () =>
        ipcRenderer.invoke("organization:clear-thumbnails"),
      rebuildThumbnails: () =>
        ipcRenderer.invoke("organization:rebuild-thumbnails"),
    }),
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
      playerOpen: (id: string, loop = false) =>
        ipcRenderer.invoke("youtube:player-open", id, loop),
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
