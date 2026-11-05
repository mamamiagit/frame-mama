import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const { Library } = require("../electron-dist/library.cjs");
const { Playback } = require("../electron-dist/playback.cjs");
const { toWebVtt } = require("../electron-dist/subtitles.cjs");
const { readSubtitle } = require("../electron-dist/subtitle-file.cjs");
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frame-playback-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let library = new Library(directory);
  await library.prepare();
  cleanups.push(async () => library.close());
  const source = path.join(directory, "movie.webm");
  await writeFile(source, "0123456789");
  await library.importFiles([source], async () => ({
    duration: 120,
    error: null,
    thumbnail: false,
  }));
  const id = library.list({ search: "", sort: "newest", offset: 0 }).items[0]
    .id;
  return {
    directory,
    source,
    id,
    library,
    playback: new Playback(library),
    reopen() {
      library.close();
      library = new Library(directory);
      return library;
    },
  };
}

describe("local playback access and persistence", () => {
  it("opens only imported IDs, supports ranged playback, and revokes old sessions", async () => {
    const { playback, id } = await setup();
    await expect(playback.open("../secret")).rejects.toThrow();
    const first = await playback.open(id);
    const response = await playback.stream(
      new Request(first.url, { headers: { range: "bytes=2-5" } }),
    );
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("2345");
    const second = await playback.open(id);
    expect((await playback.stream(new Request(first.url))).status).toBe(404);
    expect(() =>
      playback.save(first.token, {
        position: 5,
        duration: 120,
        completed: false,
      }),
    ).toThrow();
    playback.close(first.token);
    expect((await playback.stream(new Request(second.url))).status).toBe(200);
    playback.close(second.token);
    expect((await playback.stream(new Request(second.url))).status).toBe(404);
    expect(
      (
        await playback.stream(
          new Request("frame-playback://video/../../secret"),
        )
      ).status,
    ).toBe(404);
  });
  it("does not record merely opening, persists resume/history after restart, and cascades removal", async () => {
    const state = await setup();
    const session = await state.playback.open(state.id);
    expect(state.library.history(0).total).toBe(0);
    state.playback.save(session.token, {
      position: 33.5,
      duration: 120,
      completed: false,
    });
    state.playback.close(session.token);
    const library = state.reopen();
    expect(library.getProgress(state.id)).toEqual({
      position: 33.5,
      duration: 120,
      completed: false,
    });
    expect(library.history(0).items[0]).toMatchObject({
      video: { id: state.id },
      position: 33.5,
    });
    library.saveProgress(state.id, {
      position: 120,
      duration: 120,
      completed: true,
    });
    expect(library.getProgress(state.id)).toEqual({
      position: 0,
      duration: 120,
      completed: true,
    });
    await library.remove(state.id);
    expect(library.history(0).total).toBe(0);
  });
  it("rejects invalid progress/history values, supersedes concurrent opens, and handles removed sources", async () => {
    const { playback, library, source, id } = await setup();
    const results = await Promise.allSettled([
      playback.open(id),
      playback.open(id),
    ]);
    expect(results.map((item) => item.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    const session = await playback.open(id);
    for (const progress of [
      null,
      {},
      { position: -1, duration: 5, completed: false },
      { position: 6, duration: 5, completed: false },
      { position: NaN, duration: 5, completed: false },
      { position: 0, duration: Infinity, completed: false },
      { position: 0, duration: 0, completed: false },
      { position: 0, duration: 5, completed: "yes" },
    ])
      expect(() => playback.save(session.token, progress)).toThrow();
    for (const value of [-1, "0", 0.5, NaN])
      expect(() => library.history(value)).toThrow();
    await rename(source, `${source}.gone`);
    expect((await playback.stream(new Request(session.url))).status).toBe(404);
    await expect(playback.open(id)).rejects.toThrow();
  });
  it("upgrades a Phase 3 database without losing videos", async () => {
    const state = await setup();
    state.library.close();
    const db = new DatabaseSync(path.join(state.directory, "library.sqlite"));
    db.exec("DROP TABLE watch_history; PRAGMA user_version=1;");
    db.close();
    // setup cleanup closes the original reference; replace its method for this migration test.
    state.library.close = () => {};
    const upgraded = new Library(state.directory);
    cleanups.push(async () => upgraded.close());
    expect(upgraded.getVideo(state.id).title).toBe("movie");
    upgraded.saveProgress(state.id, {
      position: 4,
      duration: 120,
      completed: false,
    });
    expect(upgraded.history(0).total).toBe(1);
  });
});

describe("local subtitle files", () => {
  it("normalizes WebVTT and converts multi-line SRT cues with UTF-8 text", () => {
    expect(
      toWebVtt("\uFEFFWEBVTT\r\n\r\n00:00:00.000 --> 00:00:02.000\r\nHello"),
    ).toContain("WEBVTT\n\n");
    const converted = toWebVtt(
      "1\n00:00:01,250 --> 00:00:02,500\nHéllo\nworld\n\n2\n00:01:00,000 --> 00:01:03,000\nNext",
    );
    expect(converted).toContain("00:00:01.250 --> 00:00:02.500\nHéllo\nworld");
    expect(converted).toContain("00:01:00.000 --> 00:01:03.000");
    expect(() => toWebVtt("<script>oops</script>")).toThrow();
  });
  it("enforces format, UTF-8 and bounded reads", async () => {
    const { directory } = await setup();
    const file = path.join(directory, "captions.srt");
    await writeFile(file, "1\n00:00:00,000 --> 00:00:05,000\nHello");
    expect((await readSubtitle(file)).text).toContain("WEBVTT");
    await writeFile(file, Buffer.from([255, 255]));
    await expect(readSubtitle(file)).rejects.toThrow();
    await writeFile(file, Buffer.alloc(2 * 1024 * 1024 + 1));
    await expect(readSubtitle(file)).rejects.toThrow();
    await expect(
      readSubtitle(path.join(directory, "secret.txt")),
    ).rejects.toThrow();
  });
});
