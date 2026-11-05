import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, realpath, stat, unlink } from "node:fs/promises";
import type {
  LibraryPage,
  LibraryQuery,
  LocalVideo,
  ImportResult,
} from "./library-types.cjs";
import type { PlaybackProgress, HistoryPage } from "./playback-types.cjs";

export const extensions = [
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "ogv",
  "ogg",
];
export const isId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function validateQuery(value: unknown): LibraryQuery {
  if (!value || typeof value !== "object")
    throw new Error("Invalid library query");
  const q = value as Record<string, unknown>;
  if (
    typeof q.search !== "string" ||
    q.search.length > 300 ||
    typeof q.sort !== "string" ||
    !["newest", "title", "duration", "size"].includes(q.sort) ||
    !Number.isSafeInteger(q.offset) ||
    Number(q.offset) < 0
  )
    throw new Error("Invalid library query");
  return q as unknown as LibraryQuery;
}
export type Metadata = {
  duration: number | null;
  error: string | null;
  thumbnail: boolean;
};
function toVideo(row: Record<string, unknown>): LocalVideo {
  return {
    id: String(row.id),
    title: String(row.title),
    fileName: String(row.fileName),
    directory: String(row.directory),
    size: Number(row.size),
    duration: row.duration === null ? null : Number(row.duration),
    importedAt: Number(row.importedAt),
    missing: Boolean(row.missing),
    metadataError:
      row.metadataError === null ? null : String(row.metadataError),
    thumbnail: row.thumbnail ? `frame-thumb://cache/${row.id}` : null,
  };
}

export class Library {
  private db: DatabaseSync;
  readonly thumbnails: string;
  constructor(directory: string) {
    this.thumbnails = path.join(directory, "thumbnails");
    this.db = new DatabaseSync(path.join(directory, "library.sqlite"));
    if (
      Number(this.db.prepare("PRAGMA user_version").get()!.user_version) > 3
    ) {
      this.db.close();
      throw new Error("This library requires a newer version of Frame.");
    }
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY, source TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
        fileName TEXT NOT NULL, directory TEXT NOT NULL, size REAL NOT NULL,
        duration REAL, importedAt REAL NOT NULL, missing INTEGER NOT NULL DEFAULT 0,
        metadataError TEXT, thumbnail INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS watch_history (
        videoId TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
        position REAL NOT NULL, duration REAL NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, lastWatched REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_recent ON watch_history(lastWatched DESC);
      PRAGMA user_version=3;`);
    if (
      !this.db
        .prepare("PRAGMA table_info(videos)")
        .all()
        .some((row) => row.name === "metadataCheckedAt")
    )
      this.db.exec(
        "ALTER TABLE videos ADD COLUMN metadataCheckedAt REAL NOT NULL DEFAULT 0",
      );
  }
  removeHistory(id: unknown) {
    if (!isId(id)) throw new Error("Invalid video ID");
    this.db.prepare("DELETE FROM watch_history WHERE videoId=?").run(id);
  }
  clearHistory() {
    this.db.exec("DELETE FROM watch_history");
  }
  sources() {
    return new Set(
      this.db
        .prepare("SELECT source FROM videos")
        .all()
        .map((row) => String(row.source)),
    );
  }
  previewCandidates() {
    return this.db
      .prepare(
        "SELECT id,source FROM videos WHERE thumbnail=0 AND missing=0 ORDER BY metadataCheckedAt,id LIMIT 100",
      )
      .all()
      .map((row) => ({ id: String(row.id), source: String(row.source) }));
  }
  setMetadata(id: string, metadata: Metadata) {
    if (!isId(id)) throw new Error("Invalid ID");
    this.db
      .prepare(
        "UPDATE videos SET duration=?,metadataError=?,thumbnail=?,metadataCheckedAt=? WHERE id=?",
      )
      .run(
        metadata.duration,
        metadata.error,
        Number(metadata.thumbnail),
        Date.now(),
        id,
      );
  }
  thumbnailIds() {
    return this.db
      .prepare("SELECT id FROM videos WHERE thumbnail=1")
      .all()
      .map((row) => String(row.id));
  }
  clearThumbnail(id: string) {
    if (!isId(id)) throw new Error("Invalid ID");
    this.db
      .prepare("UPDATE videos SET thumbnail=0,metadataCheckedAt=0 WHERE id=?")
      .run(id);
  }
  async prepare() {
    await mkdir(this.thumbnails, { recursive: true });
  }
  close() {
    this.db.close();
  }
  thumbnailPath(id: string) {
    if (!isId(id)) throw new Error("Invalid video ID");
    return path.join(this.thumbnails, `${id}.png`);
  }
  getSource(id: string): string | null {
    if (!isId(id)) throw new Error("Invalid video ID");
    const row = this.db.prepare("SELECT source FROM videos WHERE id=?").get(id);
    return row ? String(row.source) : null;
  }
  getVideo(id: string): LocalVideo | null {
    if (!isId(id)) throw new Error("Invalid video ID");
    const row = this.db.prepare("SELECT * FROM videos WHERE id=?").get(id);
    return row ? toVideo(row) : null;
  }
  getProgress(id: string): PlaybackProgress | null {
    if (!isId(id)) throw new Error("Invalid video ID");
    const row = this.db
      .prepare("SELECT * FROM watch_history WHERE videoId=?")
      .get(id);
    return row
      ? {
          position: Number(row.position),
          duration: Number(row.duration),
          completed: Boolean(row.completed),
        }
      : null;
  }
  saveProgress(id: string, value: unknown, record = true) {
    if (!isId(id) || !this.getSource(id)) throw new Error("Video not found");
    if (!value || typeof value !== "object")
      throw new Error("Invalid progress");
    const p = value as Record<string, unknown>;
    if (
      typeof p.position !== "number" ||
      !Number.isFinite(p.position) ||
      typeof p.duration !== "number" ||
      !Number.isFinite(p.duration) ||
      p.duration <= 0 ||
      p.position < 0 ||
      p.position > p.duration ||
      typeof p.completed !== "boolean"
    )
      throw new Error("Invalid progress");
    if (!record) return;
    this.db
      .prepare(
        `INSERT INTO watch_history(videoId,position,duration,completed,lastWatched) VALUES(?,?,?,?,?)
      ON CONFLICT(videoId) DO UPDATE SET position=excluded.position,duration=excluded.duration,completed=excluded.completed,lastWatched=excluded.lastWatched`,
      )
      .run(
        id,
        p.completed ? 0 : p.position,
        p.duration,
        Number(p.completed),
        Date.now(),
      );
  }
  history(offset: unknown): HistoryPage {
    if (!Number.isSafeInteger(offset) || Number(offset) < 0)
      throw new Error("Invalid history page");
    const rows = this.db
      .prepare(
        `SELECT videos.*, watch_history.position, watch_history.duration AS playedDuration, watch_history.completed, watch_history.lastWatched
      FROM watch_history JOIN videos ON videos.id=watch_history.videoId ORDER BY lastWatched DESC, videoId LIMIT 48 OFFSET ?`,
      )
      .all(Number(offset));
    return {
      items: rows.map((row) => ({
        video: toVideo(row),
        position: Number(row.position),
        duration: Number(row.playedDuration),
        completed: Boolean(row.completed),
        lastWatched: Number(row.lastWatched),
      })),
      total: Number(
        this.db.prepare("SELECT count(*) AS n FROM watch_history").get()!.n,
      ),
    };
  }
  list(query: LibraryQuery): LibraryPage {
    const q = validateQuery(query);
    // LIKE wildcards are escaped so searches behave like literal substring matching.
    const pattern = `%${q.search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const where =
      "WHERE title LIKE ? ESCAPE '\\' OR fileName LIKE ? ESCAPE '\\'";
    const sort = {
      newest: "importedAt DESC, id",
      title: "title COLLATE NOCASE, id",
      duration: "duration DESC, id",
      size: "size DESC, id",
    }[q.sort];
    const rows = this.db
      .prepare(
        `SELECT * FROM videos ${where} ORDER BY ${sort} LIMIT 48 OFFSET ?`,
      )
      .all(pattern, pattern, q.offset);
    const items = rows.map(toVideo);
    const total = Number(
      this.db
        .prepare(`SELECT count(*) AS n FROM videos ${where}`)
        .get(pattern, pattern)!.n,
    );
    const summary = this.db
      .prepare(
        "SELECT COALESCE(sum(size),0) AS bytes, COALESCE(sum(missing),0) AS missing FROM videos",
      )
      .get()!;
    return {
      items,
      total,
      totalBytes: Number(summary.bytes),
      missing: Number(summary.missing),
    };
  }
  async importFiles(
    files: string[],
    extract: (source: string, id: string) => Promise<Metadata>,
    onProgress: () => void = () => {},
  ): Promise<ImportResult> {
    const result: ImportResult = {
      added: 0,
      duplicates: 0,
      failed: 0,
      warnings: 0,
      canceled: false,
    };
    // One decoder at a time bounds memory/CPU even for large selections.
    for (const file of files) {
      let id: string | undefined;
      try {
        const source = await realpath(file);
        if (!extensions.includes(path.extname(source).slice(1).toLowerCase()))
          throw new Error("Unsupported extension");
        const info = await stat(source);
        if (!info.isFile()) throw new Error("Not a file");
        const key =
          process.platform === "win32" ? source.toLowerCase() : source;
        if (this.db.prepare("SELECT id FROM videos WHERE source=?").get(key)) {
          result.duplicates++;
          continue;
        }
        id = randomUUID();
        const metadata = await extract(source, id);
        const fileName = path.basename(source);
        this.db
          .prepare(
            "INSERT INTO videos (id,source,title,fileName,directory,size,duration,importedAt,metadataError,thumbnail) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            key,
            path.parse(fileName).name,
            fileName,
            path.dirname(source),
            info.size,
            metadata.duration,
            Date.now(),
            metadata.error,
            Number(metadata.thumbnail),
          );
        result.added++;
        if (metadata.error) result.warnings++;
      } catch {
        result.failed++;
        if (id) await unlink(this.thumbnailPath(id)).catch(() => {});
      } finally {
        onProgress();
      }
    }
    return result;
  }
  async refresh() {
    const rows = this.db.prepare("SELECT id,source,size FROM videos").all();
    const update = this.db.prepare("UPDATE videos SET missing=? WHERE id=?");
    for (const row of rows) {
      let missing = true;
      try {
        missing = !(await stat(String(row.source))).isFile();
      } catch {
        /* Inaccessible paths are reported as unavailable. */
      }
      update.run(Number(missing), row.id);
    }
  }
  async remove(id: string) {
    if (!isId(id)) throw new Error("Invalid video ID");
    this.db.prepare("DELETE FROM videos WHERE id=?").run(id);
    await unlink(this.thumbnailPath(id)).catch(() => {});
  }
}
