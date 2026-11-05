import { DatabaseSync } from "node:sqlite";
import { fallbackVideo, isYouTubeId } from "./youtube.cjs";
import type { SavedYouTubePage, YouTubeVideo } from "./youtube-types.cjs";

export class SavedYouTube {
  private db: DatabaseSync;
  constructor(
    file: string,
    private now = () => Date.now(),
  ) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS saved_links(id TEXT PRIMARY KEY,metadata TEXT,metadataAt INTEGER NOT NULL DEFAULT 0,savedAt INTEGER NOT NULL);",
    );
    this.expire();
  }
  private expire() {
    this.db
      .prepare(
        "UPDATE saved_links SET metadata=NULL,metadataAt=0 WHERE metadata IS NOT NULL AND metadataAt<?",
      )
      .run(this.now() - 30 * 86400000);
  }
  save(id: string, metadata: YouTubeVideo | null) {
    if (!isYouTubeId(id) || (metadata && metadata.id !== id))
      throw new Error("Invalid saved video");
    this.expire();
    this.db
      .prepare(
        `INSERT INTO saved_links(id,metadata,metadataAt,savedAt) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=COALESCE(excluded.metadata,saved_links.metadata),metadataAt=CASE WHEN excluded.metadata IS NULL THEN saved_links.metadataAt ELSE excluded.metadataAt END`,
      )
      .run(
        id,
        metadata ? JSON.stringify(metadata) : null,
        metadata ? this.now() : 0,
        this.now(),
      );
  }
  flags(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 50 || !value.every(isYouTubeId))
      throw new Error("Invalid saved video IDs");
    const query = this.db.prepare("SELECT id FROM saved_links WHERE id=?");
    return value.filter((id) => Boolean(query.get(id)));
  }
  remove(id: string) {
    if (!isYouTubeId(id)) throw new Error("Invalid saved video");
    this.db.prepare("DELETE FROM saved_links WHERE id=?").run(id);
  }
  list(search: unknown, offset: unknown): SavedYouTubePage {
    if (
      typeof search !== "string" ||
      search.length > 200 ||
      !Number.isSafeInteger(offset) ||
      Number(offset) < 0
    )
      throw new Error("Invalid saved video query");
    this.expire();
    const pattern = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const where =
      "WHERE id LIKE ? ESCAPE '\\' OR COALESCE(json_extract(metadata,'$.title'),'Saved YouTube video') LIKE ? ESCAPE '\\'";
    const rows = this.db
      .prepare(
        `SELECT * FROM saved_links ${where} ORDER BY savedAt DESC,id LIMIT 48 OFFSET ?`,
      )
      .all(pattern, pattern, Number(offset));
    return {
      items: rows.map((row) => ({
        ...(row.metadata
          ? JSON.parse(String(row.metadata))
          : fallbackVideo(String(row.id))),
        savedAt: Number(row.savedAt),
      })),
      total: Number(
        this.db
          .prepare(`SELECT count(*) AS n FROM saved_links ${where}`)
          .get(pattern, pattern)!.n,
      ),
    };
  }
  close() {
    this.db.close();
  }
}
