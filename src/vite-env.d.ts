/// <reference types="vite/client" />
import type {
  LibraryPage,
  LibraryQuery,
  ImportResult,
} from "../electron/library-types.cjs";
import type {
  PlaybackSession,
  PlaybackProgress,
  HistoryPage,
} from "../electron/playback-types.cjs";
export type ImportProgress = { completed: number; total: number } | null;
declare global {
  interface Window {
    frame?: {
      getAppInfo: () => Promise<{ version: string; platform: string }>;
      openYouTube: () => Promise<void>;
      playback: {
        open: (id: string) => Promise<PlaybackSession>;
        save: (token: string, progress: PlaybackProgress) => Promise<void>;
        close: (token: string) => Promise<void>;
        history: (offset: number) => Promise<HistoryPage>;
        subtitles: (
          token: string,
        ) => Promise<{ name: string; text: string } | null>;
      };
      library: {
        list: (
          query: LibraryQuery,
        ) => Promise<LibraryPage & { progress: ImportProgress; busy: boolean }>;
        importVideos: () => Promise<ImportResult>;
        refresh: () => Promise<void>;
        remove: (id: string) => Promise<boolean>;
        onProgress: (
          callback: (progress: ImportProgress) => void,
        ) => () => void;
      };
    };
  }
}
