import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  readFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { adjacentItem, orderQueue } from "../src/queue";
import type { PlaylistEntry } from "../electron/organization-types.cjs";
const require = createRequire(import.meta.url);
const {
  Organization,
  validateMediaRef,
} = require("../electron-dist/organization.cjs");
const { Library } = require("../electron-dist/library.cjs");
const { Playback } = require("../electron-dist/playback.cjs");
const { SavedYouTube } = require("../electron-dist/youtube-saved.cjs");
const { scanFolder } = require("../electron-dist/folder-scan.cjs");
const { DatabaseSync } = require("node:sqlite");
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function temporary() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frame-organization-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function setup() {
  const dir = await temporary(),
    file = path.join(dir, "organization.sqlite");
  let org = new Organization(file);
  cleanups.push(async () => org.close());
  return {
    dir,
    get org() {
      return org;
    },
    reopen() {
      org.close();
      org = new Organization(file);
      return org;
    },
  };
}
const local = { kind: "local", id: randomUUID() },
  youtube = { kind: "youtube", id: "abcdefghijk" };

describe("persistent organization", () => {
  it("upgrades a Phase 5 library and saved-link catalog without losing files, bookmarks or resume positions", async () => {
    const dir = await temporary(),
      source = path.join(dir, "existing.webm");
    await writeFile(source, "original bytes");
    let library = new Library(dir);
    await library.prepare();
    await library.importFiles([source], async () => ({
      duration: 120,
      error: null,
      thumbnail: false,
    }));
    const id = library.list({ search: "", sort: "newest", offset: 0 }).items[0]
      .id;
    library.saveProgress(id, { position: 23, duration: 120, completed: false });
    library.close();
    const legacy = new DatabaseSync(path.join(dir, "library.sqlite"));
    legacy.exec(
      "ALTER TABLE videos DROP COLUMN metadataCheckedAt; PRAGMA user_version=2;",
    );
    legacy.close();
    library = new Library(dir);
    cleanups.push(async () => library.close());
    expect(library.getProgress(id).position).toBe(23);
    expect(library.getVideo(id).title).toBe("existing");
    expect(library.previewCandidates()).toEqual([{ id, source }]);
    library.setMetadata(id, { duration: 121, error: null, thumbnail: true });
    expect(library.previewCandidates()).toEqual([]);
    library.clearThumbnail(id);
    expect(library.previewCandidates()).toHaveLength(1);
    expect(await readFile(source, "utf8")).toBe("original bytes");
    const links = path.join(dir, "links.sqlite"),
      db = new DatabaseSync(links);
    db.exec(
      "CREATE TABLE saved_links(id TEXT PRIMARY KEY,metadata TEXT,metadataAt INTEGER NOT NULL DEFAULT 0,savedAt INTEGER NOT NULL);",
    );
    db.prepare("INSERT INTO saved_links VALUES(?,NULL,0,?)").run(
      youtube.id,
      Date.now(),
    );
    db.close();
    const saved = new SavedYouTube(links);
    cleanups.push(async () => saved.close());
    expect(saved.flags([youtube.id])).toEqual([youtube.id]);
    expect(saved.list("", 0).total).toBe(1);
  });
  it("enforces playlist and bookmark bounds while allowing duplicate additions at capacity", async () => {
    const { org } = await setup(),
      playlist = org.create("Full collection");
    const ids = Array.from({ length: 500 }, () => randomUUID());
    for (const id of ids) {
      org.add(playlist.id, { kind: "local", id }, "Local video");
      org.saveLocalLater(id, true);
    }
    expect(() =>
      org.add(playlist.id, { kind: "local", id: ids[0] }, "Duplicate"),
    ).not.toThrow();
    expect(() => org.saveLocalLater(ids[0], true)).not.toThrow();
    expect(() => org.add(playlist.id, local, "Overflow")).toThrow();
    expect(() => org.saveLocalLater(local.id, true)).toThrow();
    expect(org.localLaterCount()).toBe(500);
  });
  it("persists mixed ordered playlists, deduplicates, rejects stale reorder, and deletes only membership", async () => {
    const state = await setup(),
      org = state.org,
      p = org.create("  My collection  ");
    const a = org.add(p.id, local, "Local story"),
      b = org.add(p.id, youtube, "API title");
    expect(org.add(p.id, local, "Duplicate")).toBe(a);
    expect(org.get(p.id)).toMatchObject({ name: "My collection", count: 2 });
    expect(org.members(p.id)[1].caption).toBe(""); // API metadata is kept in the expiring catalog only.
    for (const order of [[a], [a, a], [b, randomUUID()], null])
      expect(() => org.reorder(p.id, order)).toThrow();
    expect(org.members(p.id).map((v: any) => v.entryId)).toEqual([a, b]);
    org.reorder(p.id, [b, a]);
    org.rename(p.id, "Evening stories");
    const reopened = state.reopen();
    expect(reopened.get(p.id)).toMatchObject({
      name: "Evening stories",
      count: 2,
    });
    expect(reopened.members(p.id).map((v: any) => v.entryId)).toEqual([b, a]);
    reopened.removeEntry(p.id, b);
    expect(reopened.get(p.id).count).toBe(1);
    reopened.saveLocalLater(local.id, true);
    reopened.visit(youtube.id);
    reopened.remove(p.id);
    expect(reopened.list()).toEqual([]);
    expect(() => reopened.members(p.id)).toThrow();
    expect(reopened.isLocalLater(local.id)).toBe(true);
    expect(reopened.visits(0).total).toBe(1);
  });
  it("validates requests and migrates playback preferences once without overwriting saved defaults", async () => {
    const state = await setup(),
      org = state.org;
    for (const ref of [
      null,
      {},
      { kind: "local", id: "../file" },
      { kind: "youtube", id: "bad" },
    ])
      expect(() => validateMediaRef(ref)).toThrow();
    for (const name of ["", " ".repeat(2), "x".repeat(81), null])
      expect(() => org.create(name)).toThrow();
    for (const patch of [
      { repeat: ["one"] },
      { repeat: "forever" },
      { shuffle: 1 },
      { recordHistory: "yes" },
      { path: "/tmp" },
      [],
    ])
      expect(() => org.updateSettings(patch)).toThrow();
    const initial = { volume: 0.35, muted: true, speed: 1.5, autoplay: true };
    expect(org.initializePlayback(initial)).toEqual(initial);
    org.updatePlayback({ ...initial, speed: 2 });
    org.updateSettings({ shuffle: true, repeat: "all", autoAdvance: false });
    const reopened = state.reopen();
    expect(reopened.initializePlayback(initial).speed).toBe(2);
    expect(reopened.settings()).toMatchObject({
      shuffle: true,
      repeat: "all",
      autoAdvance: false,
    });
    for (const value of [
      { ...initial, volume: NaN },
      { ...initial, speed: 3 },
      { ...initial, muted: 0 },
    ])
      expect(() => reopened.updatePlayback(value)).toThrow();
  });
  it("persists local Watch Later, directories, history control, and future download location", async () => {
    const state = await setup(),
      org = state.org;
    org.saveLocalLater(local.id, true);
    org.saveLocalLater(local.id, true);
    expect(org.localLaterCount()).toBe(1);
    const directory = org.addDirectory(state.dir);
    expect(org.addDirectory(state.dir)).toBe(directory);
    org.setDownloadDirectory(state.dir);
    org.visit(youtube.id);
    org.updateSettings({ recordHistory: false });
    org.visit("zyxwvutsrqp");
    const reopened = state.reopen();
    expect(reopened.localLater()).toEqual([local.id]);
    expect(reopened.visits(0).total).toBe(1);
    expect(reopened.directory(directory)).toBe(state.dir);
    expect(reopened.downloadDirectory()).toBe(state.dir);
    expect(() => reopened.directory(state.dir)).toThrow();
    reopened.removeDirectory(directory);
    reopened.saveLocalLater(local.id, false);
    reopened.removeVisit(youtube.id);
    expect(reopened.directories()).toEqual([]);
    expect(reopened.localLaterCount()).toBe(0);
    expect(reopened.visits(0).total).toBe(0);
  });
  it("retains existing checkpoints while recording is paused and clears history without deleting media", async () => {
    const { dir, org } = await setup();
    await mkdir(path.join(dir, "library"));
    const library = new Library(path.join(dir, "library"));
    await library.prepare();
    cleanups.push(async () => library.close());
    const file = path.join(dir, "movie.webm");
    await writeFile(file, "original video");
    await library.importFiles([file], async () => ({
      duration: 120,
      error: null,
      thumbnail: false,
    }));
    const id = library.list({ search: "", sort: "newest", offset: 0 }).items[0]
        .id,
      playback = new Playback(library, () => org.settings().recordHistory),
      session = await playback.open(id);
    playback.save(session.token, {
      position: 15,
      duration: 120,
      completed: false,
    });
    org.updateSettings({ recordHistory: false });
    expect(() => playback.save(session.token, { position: -1 })).toThrow();
    playback.save(session.token, {
      position: 40,
      duration: 120,
      completed: false,
    });
    expect(library.getProgress(id).position).toBe(15);
    org.updateSettings({ recordHistory: true });
    playback.save(session.token, {
      position: 50,
      duration: 120,
      completed: false,
    });
    expect(library.getProgress(id).position).toBe(50);
    library.removeHistory(id);
    expect(library.getProgress(id)).toBeNull();
    playback.save(session.token, {
      position: 8,
      duration: 120,
      completed: false,
    });
    library.clearHistory();
    expect(library.history(0).total).toBe(0);
    expect(library.getVideo(id)).not.toBeNull();
    expect(await readFile(file, "utf8")).toBe("original video");
  });
  it("keeps playlist link metadata available after unsaving while respecting metadata expiry", async () => {
    const dir = await temporary();
    let now = 1000000000000;
    const saved = new SavedYouTube(path.join(dir, "links.sqlite"), () => now);
    cleanups.push(async () => saved.close());
    saved.save(youtube.id, null, false);
    expect(saved.get(youtube.id).id).toBe(youtube.id);
    expect(saved.list("", 0).total).toBe(0);
    saved.save(youtube.id, null);
    expect(saved.flags([youtube.id])).toEqual([youtube.id]);
    saved.remove(youtube.id);
    expect(saved.flags([youtube.id])).toEqual([]);
    expect(saved.get(youtube.id).id).toBe(youtube.id);
    now += 31 * 86400000;
    expect(saved.get(youtube.id).thumbnail).toBeNull();
  });
});

describe("bounded folder indexing", () => {
  it("walks nested video files, excludes indexed paths and symlinks, and reports the next batch", async () => {
    const dir = await temporary(),
      nested = path.join(dir, "nested");
    await mkdir(nested);
    const known = path.join(dir, "indexed.webm");
    await writeFile(known, "x");
    await writeFile(path.join(nested, "story.MP4"), "x");
    await writeFile(path.join(dir, "notes.txt"), "x");
    await symlink(nested, path.join(dir, "loop"), "dir");
    const first = await scanFolder(dir, new Set([known]));
    expect(first.files).toEqual([path.join(nested, "story.MP4")]);
    expect(first.limited).toBe(false);
    for (let i = 0; i < 105; i++)
      await writeFile(path.join(nested, `${i}.webm`), "x");
    const batch = await scanFolder(dir, new Set([known]));
    expect(batch.files).toHaveLength(100);
    expect(batch.limited).toBe(true);
    const remainder = await scanFolder(dir, new Set([known, ...batch.files]));
    expect(remainder.files).toHaveLength(6);
    expect(remainder.limited).toBe(false);
  });
});

describe("mixed playback queue", () => {
  const entries = ["a", "b", "c", "d"].map((entryId, index) => ({
    entryId,
    available: index !== 1,
    source: { kind: index === 2 ? "youtube" : "local", id: entryId },
  })) as PlaylistEntry[];
  it("skips missing media, stops at queue end, wraps repeat-all, and repeats one only automatically", () => {
    expect(adjacentItem(entries, "a", 1, "none")?.entryId).toBe("c");
    expect(adjacentItem(entries, "d", 1, "none")).toBeNull();
    expect(adjacentItem(entries, "d", 1, "all")?.entryId).toBe("a");
    expect(adjacentItem(entries, "a", -1, "all")?.entryId).toBe("d");
    expect(adjacentItem(entries, "c", 1, "one", true)?.entryId).toBe("c");
    expect(adjacentItem(entries, "c", 1, "one")?.entryId).toBe("d");
    expect(adjacentItem([], "a", 1, "all")).toBeNull();
  });
  it("shuffles without dropping entries, keeps the current item, and leaves playlist order untouched", () => {
    const queue = orderQueue(entries, true, "c", () => 0);
    expect(queue[0].entryId).toBe("c");
    expect(new Set(queue.map((v) => v.entryId))).toEqual(
      new Set(["a", "b", "c", "d"]),
    );
    expect(entries.map((v) => v.entryId)).toEqual(["a", "b", "c", "d"]);
    expect(orderQueue(entries, false)).toEqual(entries);
  });
});
