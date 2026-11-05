export type LibrarySort = "newest" | "title" | "duration" | "size";
export interface LibraryQuery {
  search: string;
  sort: LibrarySort;
  offset: number;
}
export interface LocalVideo {
  id: string;
  title: string;
  fileName: string;
  directory: string;
  size: number;
  duration: number | null;
  importedAt: number;
  missing: boolean;
  metadataError: string | null;
  thumbnail: string | null;
}
export interface LibraryPage {
  items: LocalVideo[];
  total: number;
  totalBytes: number;
  missing: number;
}
export interface ImportResult {
  added: number;
  duplicates: number;
  failed: number;
  warnings: number;
  canceled: boolean;
}
