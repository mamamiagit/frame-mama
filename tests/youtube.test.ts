import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  YouTube,
  videoId,
  watchUrl,
  officialPlayerLink,
  durationSeconds,
} = require("../electron-dist/youtube.cjs");
const { SavedYouTube } = require("../electron-dist/youtube-saved.cjs");
const {
  YouTubeCredentials,
} = require("../electron-dist/youtube-credentials.cjs");
const id = "abcDEF123_-",
  second = "zyxWVU987_-";
const item = (videoId = id) => ({
  id: videoId,
  snippet: {
    title: "A public test video",
    channelTitle: "Test channel",
    description: "Plain description",
    publishedAt: "2026-01-01T12:00:00Z",
    liveBroadcastContent: "none",
  },
  contentDetails: { duration: "PT2M3S" },
  statistics: { viewCount: "12345" },
  status: { embeddable: true },
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function temporary() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frame-youtube-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("supported YouTube request boundary", () => {
  it("parses only supported video links and never accepts arbitrary destinations", () => {
    for (const value of [
      id,
      `https://youtu.be/${id}?t=30`,
      `https://www.youtube.com/watch?v=${id}&list=abc`,
      `https://m.youtube.com/shorts/${id}`,
      `https://youtube.com/live/${id}`,
    ])
      expect(videoId(value)).toBe(id);
    for (const value of [
      "https://evil.test/watch?v=" + id,
      "https://youtube.com.evil.test/watch?v=" + id,
      `https://user:pass@youtube.com/watch?v=${id}`,
      "javascript:alert(1)",
      `file:///${id}`,
      `https://youtu.be/${id}/extra`,
      "https://www.youtube.com/playlist?list=123",
      {},
      "../secrets",
    ])
      expect(() => videoId(value)).toThrow();
    expect(watchUrl(id)).toBe(`https://www.youtube.com/watch?v=${id}`);
    expect(officialPlayerLink('https://policies.google.com/privacy')).toBe('https://policies.google.com/privacy');
    expect(officialPlayerLink('https://evil.test/watch?v='+id)).toBeNull();
    expect(officialPlayerLink('file:///private')).toBeNull();
    expect(officialPlayerLink('https://www.youtube.com/redirect?q=https://evil.test')).toBeNull();
    expect(officialPlayerLink('https://www.youtube.com/watch?v='+id)).toBe(watchUrl(id));
    expect(durationSeconds("PT1H2M3S")).toBe(3723);
    expect(durationSeconds("P1DT2H")).toBe(93600);
    expect(durationSeconds("bad")).toBeNull();
  });
  it("requests popular metadata through the fixed API only, with a private header key and bounded caching", async () => {
    const fetcher = vi.fn(async () =>
      json({ items: [item()], nextPageToken: "NEXT_page" }),
    );
    const service = new YouTube(
      () => "unit-test-key-never-a-real-key",
      fetcher,
    );
    const result = await service.list({ query: "", region: "US" });
    expect(result).toMatchObject({
      ok: true,
      items: [
        {
          id,
          title: "A public test video",
          duration: 123,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        },
      ],
      nextPageToken: "NEXT_page",
    });
    const [url, options] = fetcher.mock.calls[0] as any;
    expect(new URL(url).origin).toBe("https://www.googleapis.com");
    expect(new URL(url).searchParams.get("chart")).toBe("mostPopular");
    expect(url).not.toContain("unit-test-key");
    expect(options.headers["X-Goog-Api-Key"]).toBe(
      "unit-test-key-never-a-real-key",
    );
    expect(options.redirect).toBe("error");
    expect(JSON.stringify(result)).not.toContain("unit-test-key");
    await service.list({ query: "", region: "US" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    service.clearCache();
    await service.list({ query: "", region: "US" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("hydrates searches, enforces supported embed filters, preserves order and drops non-embeddable items", async () => {
    const fetcher = vi.fn(async (url: string) =>
      new URL(url).pathname.endsWith("/search")
        ? json({
            items: [{ id: { videoId: id } }, { id: { videoId: second } }],
            nextPageToken: "PAGE2",
          })
        : json({
            items: [{ ...item(second), status: { embeddable: false } }, item()],
          }),
    );
    const service = new YouTube(() => "test-key", fetcher);
    const [result, duplicate] = await Promise.all([
      service.list({ query: "  design  ", region: "GB" }),
      service.list({ query: "design", region: "GB" }),
    ]);
    expect(result).toEqual(duplicate);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.items.map((video: any) => video.id)).toEqual([id]);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("videoEmbeddable")).toBe("true");
    expect(url.searchParams.get("videoSyndicated")).toBe("true");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("regionCode")).toBe("GB");
    expect(await service.detail(id)).toMatchObject({ id });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("returns redacted missing-key, offline, quota, key, forbidden and invalid-response errors", async () => {
    const noFetch = vi.fn();
    expect(
      await new YouTube(() => null, noFetch).list({ query: "", region: "US" }),
    ).toMatchObject({ ok: false, code: "missing_key" });
    expect(noFetch).not.toHaveBeenCalled();
    const cases = [
      { status: 403, reason: "quotaExceeded", code: "quota" },
      { status: 429, reason: "rateLimitExceeded", code: "quota" },
      { status: 400, reason: "keyInvalid", code: "invalid_key" },
      { status: 400, reason: "invalidPageToken", code: "api_error" },
      { status: 403, reason: "forbidden", code: "forbidden" },
    ];
    for (const test of cases) {
      const service = new YouTube(
        () => "sensitive-test-value",
        async () =>
          json(
            {
              error: {
                message: "secret sensitive-test-value",
                errors: [{ reason: test.reason }],
              },
            },
            test.status,
          ),
      );
      const result = await service.list({ query: "", region: "US" });
      expect(result).toMatchObject({ ok: false, code: test.code });
      expect(JSON.stringify(result)).not.toContain("sensitive-test-value");
    }
    expect(
      await new YouTube(
        () => "key",
        async () => {
          throw new Error("private token");
        },
      ).list({ query: "", region: "US" }),
    ).toMatchObject({ ok: false, code: "offline" });
    expect(
      await new YouTube(
        () => "key",
        async () => new Response("bad JSON"),
      ).list({ query: "", region: "US" }),
    ).toMatchObject({ ok: false, code: "api_error" });
    expect(
      await new YouTube(
        () => "key",
        async () => new Response("x".repeat(2_000_001)),
      ).list({ query: "", region: "US" }),
    ).toMatchObject({ ok: false, code: "api_error" });
  });
  it("rejects malformed requests before any network access", async () => {
    const fetcher = vi.fn(),
      service = new YouTube(() => "key", fetcher);
    for (const value of [
      null,
      {},
      { query: "x".repeat(201), region: "US" },
      { query: "a", region: "../" },
      { query: "a", region: "US", pageToken: "\nheader" },
    ])
      await expect(service.list(value)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("persistent user-saved YouTube links", () => {
  it("deduplicates, reopens, filters, and removes saved links without a key", async () => {
    const directory = await temporary(),
      file = path.join(directory, "saved.sqlite");
    let saved = new SavedYouTube(file);
    cleanups.push(async () => saved.close());
    saved.save(id, null);
    saved.save(id, null);
    expect(saved.list("", 0).total).toBe(1);
    saved.close();
    saved = new SavedYouTube(file);
    expect(saved.list("", 0).items[0]).toMatchObject({ id, thumbnail: null });
    expect(saved.flags([id, second])).toEqual([id]);
    expect(() => saved.flags(["bad"])).toThrow();
    expect(saved.list(id, 0).total).toBe(1);
    saved.remove(id);
    expect(saved.list("", 0).total).toBe(0);
  });
  it("purges API metadata after 30 days while retaining the user-saved ID/link", async () => {
    const directory = await temporary();
    let now = 1000000000000;
    const saved = new SavedYouTube(
      path.join(directory, "links.sqlite"),
      () => now,
    );
    cleanups.push(async () => saved.close());
    const service = new YouTube(
      () => "key",
      async () => json({ items: [item()] }),
    );
    const result = await service.list({ query: "", region: "US" });
    saved.save(id, result.items[0]);
    expect(saved.list("public", 0).total).toBe(1);
    now += 31 * 86400000;
    expect(saved.list("public", 0).total).toBe(0);
    expect(saved.list("", 0).items[0]).toMatchObject({
      id,
      thumbnail: null,
      description: "",
      duration: null,
    });
  });
});

describe("main-process credential storage", () => {
  const encryption = {
    available: () => true,
    encrypt: (value: string) =>
      Buffer.from("encrypted:" + Buffer.from(value).toString("base64")),
    decrypt: (value: Buffer) =>
      Buffer.from(value.toString().slice(10), "base64").toString(),
  };
  it("encrypts imported keys, reloads them, and reports status without disclosing the key", async () => {
    const directory = await temporary(),
      input = path.join(directory, "private.txt"),
      file = path.join(directory, "key.enc");
    await writeFile(input, "private-unit-test-key\n");
    const store = new YouTubeCredentials(file, encryption, () => undefined);
    await store.importFile(input);
    expect(store.get()).toBe("private-unit-test-key");
    expect((await readFile(file)).toString()).not.toContain(
      "private-unit-test-key",
    );
    expect(JSON.stringify(store.status())).not.toContain(
      "private-unit-test-key",
    );
    const restored = new YouTubeCredentials(file, encryption, () => undefined);
    await restored.load();
    expect(restored.get()).toBe("private-unit-test-key");
    await restored.clear();
    expect(restored.status().configured).toBe(false);
  });
  it("uses existing environment keys and refuses insecure/oversized imports", async () => {
    const directory = await temporary(),
      file = path.join(directory, "key.enc"),
      input = path.join(directory, "key.txt");
    await writeFile(input, "new-key");
    const env = new YouTubeCredentials(
      file,
      encryption,
      () => "environment-test-key",
    );
    expect(env.status().source).toBe("environment");
    await expect(env.importFile(input)).rejects.toThrow();
    const insecure = new YouTubeCredentials(
      file,
      { ...encryption, available: () => false },
      () => undefined,
    );
    await expect(insecure.importFile(input)).rejects.toThrow();
    const store = new YouTubeCredentials(file, encryption, () => undefined);
    await writeFile(input, "x".repeat(8193));
    await expect(store.importFile(input)).rejects.toThrow();
    await writeFile(input, "two\nlines");
    await expect(store.importFile(input)).rejects.toThrow();
  });
});
