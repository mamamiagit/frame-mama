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
import type {
  YouTubeStatus,
  YouTubeQuery,
  YouTubeResult,
  SavedYouTubePage,
  EmbedBounds,
  EmbedVisibility,
} from "../electron/youtube-types.cjs";
import type { OrganizationAPI } from "../electron/organization-types.cjs";
export type ImportProgress = { completed: number; total: number } | null;
declare global {
  interface Window {
    frame?: {
      getAppInfo: () => Promise<{ version: string; platform: string }>;
      openYouTube: () => Promise<void>;
      organization: OrganizationAPI;
      youtube: {
        status: () => Promise<YouTubeStatus>;
        importKey: () => Promise<YouTubeStatus>;
        clearKey: () => Promise<YouTubeStatus>;
        list: (query: YouTubeQuery) => Promise<YouTubeResult>;
        savedFlags: (ids: string[]) => Promise<string[]>;
        save: (value: string) => Promise<void>;
        unsave: (id: string) => Promise<void>;
        saved: (search: string, offset: number) => Promise<SavedYouTubePage>;
        openBrowser: (id: string) => Promise<void>;
        playerOpen: (id: string, loop?: boolean) => Promise<string>;
        playerBounds: (
          token: string,
          bounds: EmbedBounds,
        ) => Promise<EmbedVisibility>;
        playerClose: (token: string) => Promise<void>;
        onPlayerState: (
          callback: (state: { token: string; error: string | null }) => void,
        ) => () => void;
      };
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
