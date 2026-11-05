/// <reference types="vite/client" />
import type {
  LibraryPage,
  LibraryQuery,
  ImportResult,
} from "../electron/library-types.cjs";
export type ImportProgress = { completed: number; total: number } | null;
declare global {
  interface Window {
    frame?: {
      getAppInfo: () => Promise<{ version: string; platform: string }>;
      openYouTube: () => Promise<void>;
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
