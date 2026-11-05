import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { isId } from "./library.cjs";
import { isYouTubeId } from "./youtube.cjs";
import type {
  LibraryDirectory,
  MediaRef,
  OrganizationSettings,
  PlaybackPreferences,
  Playlist,
} from "./organization-types.cjs";
export const playbackDefaults: PlaybackPreferences = {
  volume: 0.8,
  muted: false,
  speed: 1,
  autoplay: false,
};
const settingDefaults: OrganizationSettings = {
  recordHistory: true,
  shuffle: false,
  repeat: "none",
  autoAdvance: true,
};
export function validateMediaRef(value: unknown): MediaRef {
  if (!value || typeof value !== "object")
    throw new Error("Invalid media reference");
  const ref = value as Record<string, unknown>;
  if (ref.kind === "local" && isId(ref.id))
    return { kind: "local", id: ref.id };
  if (ref.kind === "youtube" && isYouTubeId(ref.id))
    return { kind: "youtube", id: ref.id };
  throw new Error("Invalid media reference");
}
export function validatePlayback(value: unknown): PlaybackPreferences {
  if (!value || typeof value !== "object")
    throw new Error("Invalid playback preferences");
  const p = value as Record<string, unknown>;
  if (
    typeof p.volume !== "number" ||
    !Number.isFinite(p.volume) ||
    p.volume < 0 ||
    p.volume > 1 ||
    typeof p.muted !== "boolean" ||
    typeof p.autoplay !== "boolean" ||
    ![0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(p.speed as number)
  )
    throw new Error("Invalid playback preferences");
  return {
    volume: p.volume,
    muted: p.muted,
    speed: p.speed as number,
    autoplay: p.autoplay,
  };
}
function name(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new Error("Use a playlist name between 1 and 80 characters");
  return value.trim();
}
function validId(value: unknown): asserts value is string {
  if (!isId(value)) throw new Error("Invalid identifier");
}
export class Organization {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY,name TEXT NOT NULL,updatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,playlistId TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,kind TEXT NOT NULL,sourceId TEXT NOT NULL,caption TEXT NOT NULL,position INTEGER NOT NULL,UNIQUE(playlistId,kind,sourceId));
      CREATE INDEX IF NOT EXISTS member_order ON members(playlistId,position);
      CREATE TABLE IF NOT EXISTS local_later(sourceId TEXT PRIMARY KEY,savedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS directories(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS youtube_visits(sourceId TEXT PRIMARY KEY,openedAt INTEGER NOT NULL);`);
  }
  private value(key: string) {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return row ? JSON.parse(String(row.value)) : null;
  }
  private set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  settings(): OrganizationSettings {
    return { ...settingDefaults, ...this.value("organization") };
  }
  updateSettings(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid settings");
    const patch = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(patch)) {
      if (
        !["recordHistory", "shuffle", "repeat", "autoAdvance"].includes(key) ||
        (key === "repeat"
          ? typeof val !== "string" || !["none", "all", "one"].includes(val)
          : typeof val !== "boolean")
      )
        throw new Error("Invalid setting");
    }
    const next = { ...this.settings(), ...patch } as OrganizationSettings;
    this.set("organization", next);
    return next;
  }
  initializePlayback(value: unknown): PlaybackPreferences {
    const stored = this.value("playback");
    if (stored) return validatePlayback(stored);
    const prefs = validatePlayback(value);
    this.set("playback", prefs);
    return prefs;
  }
  playback(): PlaybackPreferences {
    return this.value("playback") || playbackDefaults;
  }
  updatePlayback(value: unknown) {
    const next = validatePlayback(value);
    this.set("playback", next);
    return next;
  }
  list(): Playlist[] {
    return this.db
      .prepare(
        "SELECT p.*,count(m.id) AS count FROM playlists p LEFT JOIN members m ON m.playlistId=p.id GROUP BY p.id ORDER BY p.updatedAt DESC,p.id",
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        updatedAt: Number(row.updatedAt),
        count: Number(row.count),
      }));
  }
  get(id: unknown): Playlist {
    validId(id);
    const row = this.db
      .prepare(
        "SELECT p.*,count(m.id) AS count FROM playlists p LEFT JOIN members m ON m.playlistId=p.id WHERE p.id=? GROUP BY p.id",
      )
      .get(id);
    if (!row) throw new Error("Playlist not found");
    return {
      id: String(row.id),
      name: String(row.name),
      updatedAt: Number(row.updatedAt),
      count: Number(row.count),
    };
  }
  create(value: unknown) {
    if (this.list().length >= 200) throw new Error("Playlist limit reached");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO playlists VALUES(?,?,?)")
      .run(id, name(value), Date.now());
    return this.get(id);
  }
  rename(id: unknown, value: unknown) {
    const playlist = this.get(id);
    this.db
      .prepare("UPDATE playlists SET name=?,updatedAt=? WHERE id=?")
      .run(name(value), Date.now(), playlist.id);
    return this.get(id);
  }
  remove(id: unknown) {
    validId(id);
    this.db.prepare("DELETE FROM playlists WHERE id=?").run(id);
  }
  members(id: unknown) {
    this.get(id);
    return this.db
      .prepare("SELECT * FROM members WHERE playlistId=? ORDER BY position,id")
      .all(id as string)
      .map((row) => ({
        entryId: String(row.id),
        source: {
          kind: String(row.kind),
          id: String(row.sourceId),
        } as MediaRef,
        caption: String(row.caption),
      }));
  }
  add(id: unknown, value: unknown, caption: string) {
    const playlist = this.get(id),
      ref = validateMediaRef(value);
    const existing = this.db
      .prepare(
        "SELECT id FROM members WHERE playlistId=? AND kind=? AND sourceId=?",
      )
      .get(playlist.id, ref.kind, ref.id);
    if (existing) return String(existing.id);
    if (playlist.count >= 500)
      throw new Error("A playlist can contain at most 500 items");
    const entryId = randomUUID();
    this.db
      .prepare("INSERT INTO members VALUES(?,?,?,?,?,?)")
      .run(
        entryId,
        playlist.id,
        ref.kind,
        ref.id,
        ref.kind === "local" ? caption.slice(0, 500) : "",
        Number(
          this.db
            .prepare(
              "SELECT COALESCE(max(position),-1)+1 AS n FROM members WHERE playlistId=?",
            )
            .get(playlist.id)!.n,
        ),
      );
    this.touch(playlist.id);
    return entryId;
  }
  private touch(id: string) {
    this.db
      .prepare("UPDATE playlists SET updatedAt=? WHERE id=?")
      .run(Date.now(), id);
  }
  removeEntry(id: unknown, entry: unknown) {
    const playlist = this.get(id);
    validId(entry);
    this.db
      .prepare("DELETE FROM members WHERE playlistId=? AND id=?")
      .run(playlist.id, entry);
    this.touch(playlist.id);
  }
  reorder(id: unknown, order: unknown) {
    const playlist = this.get(id),
      members = this.members(id);
    if (
      !Array.isArray(order) ||
      order.length !== members.length ||
      new Set(order).size !== order.length ||
      order.some((value) => !isId(value)) ||
      members.some((item) => !order.includes(item.entryId))
    )
      throw new Error("Playlist changed. Refresh and try reordering again");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const update = this.db.prepare(
        "UPDATE members SET position=? WHERE playlistId=? AND id=?",
      );
      order.forEach((entry, index) => update.run(index, playlist.id, entry));
      this.touch(playlist.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  saveLocalLater(id: unknown, save: unknown) {
    validId(id);
    if (typeof save !== "boolean")
      throw new Error("Invalid Watch Later operation");
    if (save) {
      if (!this.isLocalLater(id) && this.localLaterCount() >= 500)
        throw new Error("Watch Later can contain at most 500 local videos");
      this.db
        .prepare("INSERT OR IGNORE INTO local_later VALUES(?,?)")
        .run(id, Date.now());
    } else this.db.prepare("DELETE FROM local_later WHERE sourceId=?").run(id);
  }
  isLocalLater(id: unknown) {
    validId(id);
    return Boolean(
      this.db.prepare("SELECT 1 FROM local_later WHERE sourceId=?").get(id),
    );
  }
  localLaterCount() {
    return Number(
      this.db.prepare("SELECT count(*) AS n FROM local_later").get()!.n,
    );
  }
  localLater() {
    return this.db
      .prepare(
        "SELECT sourceId FROM local_later ORDER BY savedAt DESC,sourceId",
      )
      .all()
      .map((row) => String(row.sourceId));
  }
  visit(id: unknown) {
    if (!isYouTubeId(id)) throw new Error("Invalid YouTube ID");
    if (!this.settings().recordHistory) return;
    this.db
      .prepare(
        "INSERT INTO youtube_visits VALUES(?,?) ON CONFLICT(sourceId) DO UPDATE SET openedAt=excluded.openedAt",
      )
      .run(id, Date.now());
  }
  visits(offset: unknown) {
    if (!Number.isSafeInteger(offset) || Number(offset) < 0)
      throw new Error("Invalid history page");
    return {
      items: this.db
        .prepare(
          "SELECT * FROM youtube_visits ORDER BY openedAt DESC,sourceId LIMIT 48 OFFSET ?",
        )
        .all(Number(offset))
        .map((row) => ({
          id: String(row.sourceId),
          openedAt: Number(row.openedAt),
        })),
      total: Number(
        this.db.prepare("SELECT count(*) AS n FROM youtube_visits").get()!.n,
      ),
    };
  }
  removeVisit(id: unknown) {
    if (!isYouTubeId(id)) throw new Error("Invalid YouTube ID");
    this.db.prepare("DELETE FROM youtube_visits WHERE sourceId=?").run(id);
  }
  clearVisits() {
    this.db.exec("DELETE FROM youtube_visits");
  }
  directories(): LibraryDirectory[] {
    return this.db
      .prepare("SELECT * FROM directories ORDER BY path")
      .all()
      .map((row) => ({ id: String(row.id), path: String(row.path) }));
  }
  addDirectory(folder: string) {
    const existing = this.db
      .prepare("SELECT id FROM directories WHERE path=?")
      .get(folder);
    if (existing) return String(existing.id);
    if (this.directories().length >= 50)
      throw new Error("Directory limit reached");
    const id = randomUUID();
    this.db.prepare("INSERT INTO directories VALUES(?,?)").run(id, folder);
    return id;
  }
  directory(id: unknown) {
    validId(id);
    const row = this.db
      .prepare("SELECT path FROM directories WHERE id=?")
      .get(id);
    if (!row) throw new Error("Directory not found");
    return String(row.path);
  }
  removeDirectory(id: unknown) {
    validId(id);
    this.db.prepare("DELETE FROM directories WHERE id=?").run(id);
  }
  downloadDirectory(): string | null {
    return this.value("downloadDirectory");
  }
  setDownloadDirectory(folder: string) {
    this.set("downloadDirectory", folder);
  }
  close() {
    this.db.close();
  }
}
