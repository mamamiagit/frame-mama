import type { LocalVideo } from "./library-types.cjs";
import type { YouTubeVideo } from "./youtube-types.cjs";
export interface MediaRef {
  kind: "local" | "youtube";
  id: string;
}
export interface Playlist {
  id: string;
  name: string;
  count: number;
  updatedAt: number;
}
export interface PlaylistEntry {
  entryId: string;
  source: MediaRef;
  title: string;
  available: boolean;
  local: LocalVideo | null;
  youtube: YouTubeVideo | null;
}
export interface PlaylistDetail {
  playlist: Playlist;
  items: PlaylistEntry[];
}
export interface PlaybackPreferences {
  volume: number;
  muted: boolean;
  speed: number;
  autoplay: boolean;
}
export interface OrganizationSettings {
  recordHistory: boolean;
  shuffle: boolean;
  repeat: "none" | "all" | "one";
  autoAdvance: boolean;
}
export interface LibraryDirectory {
  id: string;
  path: string;
}
export interface StorageUsage {
  indexedBytes: number;
  thumbnailBytes: number;
  thumbnailCount: number;
  databaseBytes: number;
}
export interface YouTubeVisit {
  video: YouTubeVideo;
  openedAt: number;
}
export interface OrganizationAPI {
  list: () => Promise<Playlist[]>;
  create: (name: string) => Promise<Playlist>;
  rename: (id: string, name: string) => Promise<Playlist>;
  delete: (id: string) => Promise<boolean>;
  detail: (id: string) => Promise<PlaylistDetail>;
  add: (id: string, source: MediaRef) => Promise<string>;
  removeEntry: (id: string, entry: string) => Promise<void>;
  reorder: (id: string, order: string[]) => Promise<void>;
  localLater: () => Promise<PlaylistEntry[]>;
  isLocalLater: (id: string) => Promise<boolean>;
  localLaterCount: () => Promise<number>;
  saveLocalLater: (id: string, save: boolean) => Promise<void>;
  settings: () => Promise<OrganizationSettings>;
  updateSettings: (
    patch: Partial<OrganizationSettings>,
  ) => Promise<OrganizationSettings>;
  initializePlayback: (
    prefs: PlaybackPreferences,
  ) => Promise<PlaybackPreferences>;
  updatePlayback: (prefs: PlaybackPreferences) => Promise<PlaybackPreferences>;
  youtubeVisits: (
    offset: number,
  ) => Promise<{ items: YouTubeVisit[]; total: number }>;
  removeVisit: (id: string) => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<boolean>;
  directories: () => Promise<LibraryDirectory[]>;
  addDirectory: () => Promise<string | null>;
  removeDirectory: (id: string) => Promise<void>;
  scanDirectory: (
    id: string,
  ) => Promise<{
    added: number;
    duplicates: number;
    failed: number;
    warnings: number;
    limited: boolean;
  }>;
  downloadDirectory: () => Promise<string | null>;
  chooseDownloadDirectory: () => Promise<string | null>;
  storage: () => Promise<StorageUsage>;
  clearThumbnails: () => Promise<{ cleared: number; failed: number } | null>;
  rebuildThumbnails: () => Promise<{ processed: number; failed: number }>;
}
