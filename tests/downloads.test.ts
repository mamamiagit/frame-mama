import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, link } from "node:fs/promises";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { Downloads } = require("../electron-dist/downloads.cjs");
const { Library } = require("../electron-dist/library.cjs");
const { downloadUrl, publicAddress, openDownload } = require("../electron-dist/download-network.cjs");
const { DatabaseSync } = require("node:sqlite");
const fixture = await readFile(new URL("./fixtures/sample.webm", import.meta.url));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function response(body = fixture, headers: Record<string, string> = { "content-type": "video/webm", "content-length": String(body.length) }) {
  return Object.assign(Readable.from([body]), { headers, statusCode: 200 });
}
async function setup(open = async () => response(), importFile?: (file: string, signal: AbortSignal) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "frame-downloads-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const folder = path.join(directory, "downloads");
  await mkdir(folder);
  const library = new Library(directory);
  await library.prepare();
  cleanups.push(async () => library.close());
  const file = path.join(directory, "downloads.sqlite");
  const deps = {
    encrypt: (url: string) => Buffer.from(url).toString("base64"),
    decrypt: (secret: string) => Buffer.from(secret, "base64").toString(),
    open,
    importFile: importFile || (async (file: string) => {
      const result = await library.importFiles([file], async () => ({ duration: 2, thumbnail: false, error: null }));
      if (result.failed) throw new Error("Import failed");
    }),
  };
  let manager = new Downloads(file, deps);
  cleanups.push(async () => manager.close());
  return { directory, folder, file, library, deps, get manager() { return manager; },
    async reopen() { await manager.close(); manager = new Downloads(file, deps); return manager; } };
}
async function state(manager: any, id: string, expected: string) {
  await expect.poll(() => manager.list().find((item: any) => item.id === id)?.state).toBe(expected);
}
const add = (manager: any, folder: string, suffix = "video.webm?token=private") => manager.add({ url: `https://media.example.com/${suffix}`, authorized: true }, folder);

describe("direct-download boundary", () => {
  it("rejects non-HTTPS, credentials, local addresses, alternate ports and YouTube", () => {
    for (const url of ["http://media.example.com/a.mp4", "file:///a", "https://user:secret@example.com/a", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/a", "https://[::ffff:127.0.0.1]/a", "https://example.com:444/a", "https://youtube.com/watch?v=abc", "https://youtube.com./watch?v=abc", "https://a.googlevideo.com./a", "https://a.googlevideo.com/a", "https://a.local/a", "https://youtu.be/abc", "https://example.com/a#x"])
      expect(() => downloadUrl(url), url).toThrow();
    expect(downloadUrl("https://media.example.com/video.mp4?signature=abc").hostname).toBe("media.example.com");
    expect(downloadUrl("https://[2606:4700:4700::1111]/video.mp4").protocol).toBe("https:");
  });
  it("allows public addresses and blocks non-public IPv4 and IPv6", () => {
    for (const address of ["0.1.2.3", "10.1.2.3", "100.64.0.1", "127.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "198.18.1.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:8.8.8.8", "2001:db8::1", "2002:0808:0808::1"])
      expect(publicAddress(address), address).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("pins validated DNS and checks redirect DNS without sending credentials", async () => {
    const dns = require("node:dns/promises"), https = require("node:https");
    const oldLookup = dns.lookup, oldRequest = https.request;
    const calls: string[] = [];
    dns.lookup = async (host: string) => [{ address: host === "private.example.com" ? "127.0.0.1" : "8.8.8.8", family: 4 }];
    https.request = (url: URL, options: any, callback: any) => {
      calls.push(url.hostname);
      expect(options.agent).toBe(false);
      expect(options.headers.Authorization).toBeUndefined();
      expect(options.headers.Cookie).toBeUndefined();
      options.lookup(url.hostname, {}, (error: any, ip: string, family: number) => {
        expect(error).toBeNull(); expect(ip).toBe("8.8.8.8"); expect(family).toBe(4);
      });
      const req = Object.assign(new EventEmitter(), {
        setTimeout() {},
        end() { callback(Object.assign(response(), { statusCode: 302, headers: { location: "https://private.example.com/file.webm" } })); },
      });
      return req;
    };
    try {
      await expect(openDownload("https://public.example.com/file", new AbortController().signal)).rejects.toThrow("public internet");
      expect(calls).toEqual(["public.example.com"]);
    } finally { dns.lookup = oldLookup; https.request = oldRequest; }
  });
  it("cancels promptly while DNS is pending", async () => {
    const dns = require("node:dns/promises"), oldLookup = dns.lookup;
    dns.lookup = () => new Promise(() => {});
    const controller = new AbortController();
    try {
      const pending = openDownload("https://media.example.com/a.webm", controller.signal);
      controller.abort(new Error("Canceled while resolving"));
      await expect(pending).rejects.toThrow("Canceled while resolving");
    } finally { dns.lookup = oldLookup; }
  });
});

describe("persistent download queue", () => {
  it("publishes exact bytes, imports to the real library, and preserves files after queue removal/restart", async () => {
    const ctx = await setup();
    await add(ctx.manager, ctx.folder);
    const item = ctx.manager.list()[0];
    expect(JSON.stringify(item)).not.toContain("token");
    expect(JSON.stringify(item)).not.toContain("folder");
    ctx.manager.start();
    await state(ctx.manager, item.id, "completed");
    expect(await readFile(path.join(ctx.folder, `${item.id}.webm`))).toEqual(fixture);
    expect(await readdir(ctx.folder)).toEqual([`${item.id}.webm`]);
    expect(ctx.library.list({ search: "", sort: "newest", offset: 0 }).total).toBe(1);
    await ctx.reopen();
    expect(ctx.manager.list()[0].state).toBe("completed");
    await ctx.manager.remove(item.id);
    expect(await readFile(path.join(ctx.folder, `${item.id}.webm`))).toEqual(fixture);
    expect(ctx.library.list({ search: "", sort: "newest", offset: 0 }).total).toBe(1);
  });
  it("requires authorization and a native-selected destination", async () => {
    const ctx = await setup();
    await expect(ctx.manager.add({ url: "https://media.example.com/a.mp4", authorized: false }, ctx.folder)).rejects.toThrow("permission");
    await expect(add(ctx.manager, null as any)).rejects.toThrow("folder");
    expect(ctx.manager.list()).toEqual([]);
    expect(() => ctx.manager.retry("../bad")).toThrow();
  });
  it("accepts an MP4 container and unknown-length generic binary media", async () => {
    const mp4 = await readFile(new URL("./fixtures/sample.mp4", import.meta.url));
    const ctx = await setup(async () => response(mp4, { "content-type": "application/octet-stream" }));
    await add(ctx.manager, ctx.folder, "movie.mp4");
    const id = ctx.manager.list()[0].id;
    ctx.manager.start();
    await state(ctx.manager, id, "completed");
    expect(ctx.manager.list()[0].total).toBeNull();
    expect(await readFile(path.join(ctx.folder, `${id}.mp4`))).toEqual(mp4);
  });
  it("rejects HTML, invalid signatures, truncation, oversized and empty files", async () => {
    const samples = [
      response(Buffer.from("<html>oops</html>"), { "content-type": "text/html" }),
      response(Buffer.from("<html>fake</html>"), { "content-type": "video/webm" }),
      response(fixture, { "content-type": "constructor" }),
      response(fixture, { "content-type": "video/webm", "content-length": String(fixture.length + 5) }),
      response(fixture, { "content-type": "video/webm", "content-length": String(11 * 1024 ** 3) }),
      response(Buffer.alloc(0)),
    ];
    for (const sample of samples) {
      const ctx = await setup(async () => sample);
      await add(ctx.manager, ctx.folder);
      const id = ctx.manager.list()[0].id;
      ctx.manager.start();
      await state(ctx.manager, id, "failed");
      expect(await readdir(ctx.folder)).toEqual([]);
      expect(ctx.library.list({ search: "", sort: "newest", offset: 0 }).total).toBe(0);
    }
  });
  it("cancels an active transfer, removes its staging file and advances the queue", async () => {
    let calls = 0;
    const ctx = await setup(async () => {
      if (++calls > 1) return response();
      const stream = new Readable({ read() {} });
      stream.push(fixture.subarray(0, 32));
      return Object.assign(stream, { statusCode: 200, headers: { "content-type": "video/webm" } }) as any;
    });
    await add(ctx.manager, ctx.folder); await add(ctx.manager, ctx.folder, "second.webm");
    const [first, second] = ctx.manager.list();
    ctx.manager.start();
    await expect.poll(() => ctx.manager.list()[0].received).toBe(32);
    await ctx.manager.cancel(first.id);
    await state(ctx.manager, first.id, "canceled");
    await state(ctx.manager, second.id, "completed");
    expect(await readdir(ctx.folder)).toEqual([`${second.id}.webm`]);
    ctx.manager.retry(first.id);
    await state(ctx.manager, first.id, "completed");
    expect(calls).toBe(3);
  });
  it("keeps queued work across restart, supports queued cancel, and does not overwrite existing files", async () => {
    const ctx = await setup();
    await add(ctx.manager, ctx.folder);
    const id = ctx.manager.list()[0].id;
    await ctx.reopen();
    expect(ctx.manager.list()[0].state).toBe("queued");
    await ctx.manager.cancel(id);
    expect(ctx.manager.list()[0].state).toBe("canceled");
    await writeFile(path.join(ctx.folder, `${id}.webm`), "existing user file");
    ctx.manager.retry(id);
    ctx.manager.start();
    await state(ctx.manager, id, "failed");
    expect(await readFile(path.join(ctx.folder, `${id}.webm`), "utf8")).toBe("existing user file");
  });
  it("retries saved-file import without redownloading after restart", async () => {
    let calls = 0, imports = 0;
    const ctx = await setup(async () => { calls++; return response(); }, async () => { if (++imports === 1) throw new Error("Busy"); });
    await add(ctx.manager, ctx.folder);
    const id = ctx.manager.list()[0].id;
    ctx.manager.start();
    await state(ctx.manager, id, "failed");
    expect(ctx.manager.list()[0].error).toContain("file was saved");
    await ctx.reopen();
    ctx.manager.retry(id); ctx.manager.start();
    await state(ctx.manager, id, "completed");
    expect(calls).toBe(1); expect(imports).toBe(2);
  });
  it("recovers interrupted jobs as retryable failures and redacts transport errors", async () => {
    const ctx = await setup(async () => { throw new Error("https://secret.example/key?password=xyz"); });
    await add(ctx.manager, ctx.folder);
    const id = ctx.manager.list()[0].id;
    // Simulate the on-disk state left by a terminated process.
    const db = new DatabaseSync(ctx.file);
    const row = db.prepare("SELECT payload FROM downloads WHERE id=?").get(id);
    const payload = JSON.parse(row.payload);
    payload.state = "downloading";
    db.prepare("UPDATE downloads SET payload=? WHERE id=?").run(JSON.stringify(payload), id);
    db.close();
    await writeFile(path.join(ctx.folder, `.frame-${id}.part`), "partial");
    await ctx.reopen();
    expect(ctx.manager.list()[0].state).toBe("failed");
    ctx.manager.retry(id); ctx.manager.start();
    await state(ctx.manager, id, "failed");
    expect(JSON.stringify(ctx.manager.list())).not.toContain("password");
    expect(await readdir(ctx.folder)).toEqual([]);
  });
  it("recovers a publication interrupted before the saved-file checkpoint without replacing anything", async () => {
    let calls = 0;
    const ctx = await setup(async () => { calls++; return response(); });
    await add(ctx.manager, ctx.folder);
    const id = ctx.manager.list()[0].id;
    const db = new DatabaseSync(ctx.file);
    const payload = JSON.parse(db.prepare("SELECT payload FROM downloads WHERE id=?").get(id).payload);
    payload.state = "downloading";
    payload.extension = "webm";
    db.prepare("UPDATE downloads SET payload=? WHERE id=?").run(JSON.stringify(payload), id);
    db.close();
    const partial = path.join(ctx.folder, `.frame-${id}.part`);
    await writeFile(partial, fixture);
    await link(partial, path.join(ctx.folder, `${id}.webm`));
    await ctx.reopen();
    ctx.manager.retry(id); ctx.manager.start();
    await state(ctx.manager, id, "completed");
    expect(calls).toBe(0);
    expect(await readdir(ctx.folder)).toEqual([`${id}.webm`]);
    expect(ctx.library.list({ search: "", sort: "newest", offset: 0 }).total).toBe(1);
  });
});
