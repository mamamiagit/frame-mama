import type { LocalVideo } from "./library-types.cjs";
export interface PlaybackProgress {
  position: number;
  duration: number;
  completed: boolean;
}
export interface PlaybackSession {
  token: string;
  url: string;
  video: LocalVideo;
  progress: PlaybackProgress | null;
}
export interface HistoryEntry {
  video: LocalVideo;
  position: number;
  duration: number;
  completed: boolean;
  lastWatched: number;
}
export interface HistoryPage {
  items: HistoryEntry[];
  total: number;
}
