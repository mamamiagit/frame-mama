import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const temporary = await mkdtemp(path.join(os.tmpdir(), "frame-download-smoke-"));
const userData = path.join(temporary, "app-data"), folder = path.join(temporary, "videos");
await mkdir(folder);
await mkdir(path.join(root, "test-results"), { recursive: true });
let application;
const errors = [];
async function launch() {
  application = await electron.launch({ args: [root, `--user-data-dir=${userData}`], env: { ...process.env, FRAME_YOUTUBE_API_KEY: "" } });
  const page = await application.firstWindow();
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("heading", { name: "Find your next favorite" }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), userData);
  await application.evaluate(async ({ dialog, session }, { root, folder }) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_details, callback) => callback({ cancel: true }));
    // Test-only transport injection in the Node main context. Production has no
    // environment switch or renderer capability for bypassing network validation.
    const require = process.mainModule.require.bind(process.mainModule);
    const { Readable } = require("node:stream");
    const { readFileSync } = require("node:fs");
    const fixture = readFileSync(`${root}/tests/fixtures/sample.webm`);
    globalThis.downloadFixtureCalls = 0;
    require(`${root}/electron-dist/download-network.cjs`).openDownload = async (url, signal) => {
      globalThis.downloadFixtureCalls++;
      if (url.includes("fail.webm")) throw new Error("controlled transport failure");
      if (url.includes("slow.webm")) {
        const stream = new Readable({ read() {} });
        stream.push(fixture.subarray(0, 32));
        return Object.assign(stream, { statusCode: 200, headers: { "content-type": "video/webm" } });
      }
      signal.throwIfAborted();
      return Object.assign(Readable.from([fixture]), { statusCode: 200, headers: { "content-type": "video/webm", "content-length": String(fixture.length) } });
    };
  }, { root, folder });
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await page.getByRole("heading", { name: "Downloads", exact: true }).waitFor();
  return page;
}
async function add(page, name) {
  await page.getByLabel("Direct video URL").fill(`https://media.example.com/${name}?signature=private-sentinel`);
  await page.getByLabel("I own this media").check();
  await page.getByRole("button", { name: "Add to queue", exact: true }).click();
  await expect(page.getByLabel("Direct video URL")).toHaveValue("");
}
try {
  let page = await launch();
  await expect(page.getByRole("button", { name: "Add to queue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Choose download folder" }).click();
  await expect(page.locator(".download-folder")).toContainText(folder);
  await add(page, "first.webm");
  await expect(page.locator(".download-item").first()).toContainText("completed");
  let items = await page.evaluate(() => window.frame.downloads.list());
  const completed = items[0];
  assert.equal(completed.state, "completed");
  assert.equal(await application.evaluate(() => globalThis.downloadFixtureCalls), 1);
  assert.deepEqual(await readFile(path.join(folder, `${completed.id}.webm`)), await readFile(path.join(root, "tests/fixtures/sample.webm")));
  await page.getByRole("button", { name: "Offline Library", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.frame.library.list({ search: "", sort: "newest", offset: 0 })).total)).toBe(1);
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await add(page, "slow.webm");
  await add(page, "queued.webm");
  await expect(page.getByText("queued", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel queued.webm", exact: true }).click();
  await page.getByRole("button", { name: "Cancel slow.webm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry slow.webm", exact: true })).toBeVisible();
  assert.deepEqual(await readdir(folder), [`${completed.id}.webm`]);
  await add(page, "fail.webm");
  await expect(page.getByRole("button", { name: "Retry fail.webm", exact: true })).toBeVisible();
  // Main-process validation remains authoritative even for a crafted IPC call.
  assert.equal(await page.evaluate(async () => {
    try { await window.frame.downloads.add({ url: "https://127.0.0.1/a.mp4", authorized: true }); return false; } catch { return true; }
  }), true);
  await page.setViewportSize({ width: 900, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, "test-results/downloads-desktop.png") });
  await application.close(); application = null;
  // Inspect the closed SQLite bytes: signed source links are OS-encrypted.
  const database = await readFile(path.join(userData, "downloads.sqlite"));
  assert.equal(database.includes(Buffer.from("private-sentinel")), false);
  page = await launch();
  items = await page.evaluate(() => window.frame.downloads.list());
  assert.equal(items.length, 4);
  assert.equal(items[0].state, "completed");
  assert.equal(await page.evaluate(() => window.frame.organization.downloadDirectory()), folder);
  await page.getByRole("button", { name: "Remove from queue first.webm", exact: true }).click();
  await expect(page.locator(".download-item")).toHaveCount(3);
  assert.deepEqual(await readdir(folder), [`${completed.id}.webm`]);
  await page.getByRole("button", { name: "Retry queued.webm", exact: true }).click();
  await expect(page.locator(".download-item").filter({ hasText: "queued.webm" })).toContainText("completed");
  assert.equal((await page.evaluate(() => window.frame.library.list({ search: "", sort: "newest", offset: 0 }))).total, 2);
  assert.deepEqual(errors, []);
  console.log("PASS: Downloads form, real file writes, encrypted queue, cancel, retry, restart, library integration and file preservation (controlled transport).");
} finally {
  if (application) await application.close();
  await rm(temporary, { recursive: true, force: true });
}
