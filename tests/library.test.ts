import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  writeFile,
  rename,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Library, validateQuery } = require("../electron-dist/library.cjs");
const { serveMedia } = require("../electron-dist/media.cjs");

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frame-library-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  let library = new Library(directory);
  await library.prepare();
  cleanups.push(async () => library.close());
  return {
    directory,
    get library() {
      return library;
    },
    reopen() {
      library.close();
      library = new Library(directory);
      return library;
    },
  };
}
const query = { search: "", sort: "newest" as const, offset: 0 };
const metadata = async () => ({ duration: 42, thumbnail: false, error: null });

describe("SQLite local library", () => {
  it("imports, deduplicates canonical paths, persists after reopen, and keeps originals on removal", async () => {
    const state = await setup();
    const file = path.join(state.directory, "A movie.mp4");
    await writeFile(file, "video fixture");
    const first = await state.library.importFiles([file, file], metadata);
    expect(first).toMatchObject({ added: 1, duplicates: 1, failed: 0 });
    state.reopen();
    const page = state.library.list(query);
    expect(page).toMatchObject({ total: 1, totalBytes: 13, missing: 0 });
    expect(page.items[0]).toMatchObject({
      title: "A movie",
      duration: 42,
      missing: false,
    });
    await writeFile(state.library.thumbnailPath(page.items[0].id), "thumbnail");
    await state.library.remove(page.items[0].id);
    expect(state.library.list(query).total).toBe(0);
    expect(await readFile(file, "utf8")).toBe("video fixture");
    await expect(
      stat(state.library.thumbnailPath(page.items[0].id)),
    ).rejects.toThrow();
  });
  it("detects unavailable and restored files", async () => {
    const { library, directory } = await setup();
    const file = path.join(directory, "movie.webm");
    await writeFile(file, "video");
    await library.importFiles([file], metadata);
    await rename(file, `${file}.away`);
    await library.refresh();
    expect(library.list(query)).toMatchObject({
      missing: 1,
      items: [{ missing: true }],
    });
    await rename(`${file}.away`, file);
    await library.refresh();
    expect(library.list(query).missing).toBe(0);
  });
  it("searches literal wildcard characters, sorts, and paginates", async () => {
    const { library, directory } = await setup();
    const paths = await Promise.all(
      Array.from({ length: 51 }, async (_, i) => {
        const file = path.join(
          directory,
          i === 0 ? "100%_real.mp4" : `Video ${String(i).padStart(2, "0")}.mp4`,
        );
        await writeFile(file, Buffer.alloc(i + 1));
        return file;
      }),
    );
    await library.importFiles(paths, metadata);
    expect(library.list(query).items).toHaveLength(48);
    expect(library.list({ ...query, offset: 48 }).items).toHaveLength(3);
    expect(library.list({ ...query, search: "%_" }).items).toHaveLength(1);
    expect(library.list({ ...query, sort: "size" }).items[0].size).toBe(51);
    expect(library.list({ ...query, sort: "title" }).items[0].title).toBe(
      "100%_real",
    );
    expect(library.list({ ...query, search: "' OR 1=1 --" }).total).toBe(0);
  });
  it("reports unsupported, unreadable, and metadata-warning inputs separately", async () => {
    const { library, directory } = await setup();
    const good = path.join(directory, "codec.mp4"),
      text = path.join(directory, "not-video.txt");
    await writeFile(good, "invalid media");
    await writeFile(text, "text");
    let progress = 0;
    const result = await library.importFiles(
      [good, text, path.join(directory, "gone.mp4")],
      async () => ({
        duration: null,
        thumbnail: false,
        error: "Unsupported codec",
      }),
      () => progress++,
    );
    expect(result).toMatchObject({ added: 1, warnings: 1, failed: 2 });
    expect(progress).toBe(3);
    expect(library.list(query).items[0].metadataError).toBe(
      "Unsupported codec",
    );
  });
  it("rejects malformed IPC values and path traversal IDs", async () => {
    const { library } = await setup();
    for (const value of [
      null,
      {},
      { ...query, sort: "DROP TABLE videos" },
      { ...query, offset: -1 },
      { ...query, offset: 1.5 },
      { ...query, search: "x".repeat(301) },
    ])
      expect(() => validateQuery(value)).toThrow();
    expect(() => library.getSource("../secret")).toThrow();
    expect(() => library.thumbnailPath("../secret")).toThrow();
  });
});

describe("bounded decoder media streaming", () => {
  it("serves full, head, range and suffix requests and rejects invalid ranges", async () => {
    const { directory } = await setup();
    const file = path.join(directory, "stream.webm");
    await writeFile(file, "0123456789");
    const request = (range?: string, method = "GET") =>
      new Request("frame-media://import/test", {
        method,
        headers: range ? { Range: range } : {},
      });
    expect(await (await serveMedia(file, request())).text()).toBe("0123456789");
    const partial = await serveMedia(file, request("bytes=2-4"));
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("234");
    expect(partial.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await (await serveMedia(file, request("bytes=-3"))).text()).toBe(
      "789",
    );
    expect(
      await (await serveMedia(file, request(undefined, "HEAD"))).text(),
    ).toBe("");
    for (const range of [
      "bytes=20-",
      "bytes=4-2",
      "bytes=0-1,3-4",
      "bytes=-0",
      "nonsense",
    ])
      expect((await serveMedia(file, request(range))).status).toBe(416);
    expect((await serveMedia(file, request(undefined, "POST"))).status).toBe(
      405,
    );
  });
});
