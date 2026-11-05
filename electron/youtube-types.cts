export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string | null;
  duration: number | null;
  views: string | null;
  publishedAt: string | null;
  embeddable: boolean | null;
  live: boolean;
}
export interface YouTubeQuery {
  query: string;
  region: string;
  pageToken?: string;
}
export type YouTubeCode =
  | "missing_key"
  | "offline"
  | "quota"
  | "invalid_key"
  | "forbidden"
  | "api_error";
export type YouTubeResult =
  | {
      ok: true;
      items: YouTubeVideo[];
      nextPageToken: string | null;
      savedIds?: string[];
    }
  | { ok: false; code: YouTubeCode; message: string };
export interface YouTubeStatus {
  configured: boolean;
  source: "environment" | "encrypted-file" | "none";
  secureStorage: boolean;
}
export interface SavedYouTubePage {
  items: (YouTubeVideo & { savedAt: number })[];
  total: number;
}
export interface EmbedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}
