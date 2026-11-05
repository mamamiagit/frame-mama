import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, rm, stat, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(
  path.join(os.tmpdir(), "frame-organization-smoke-"),
);
const userData = path.join(temporary, "app-data"),
  folder = path.join(temporary, "selected-folder");
const first = path.join(temporary, "First story.webm"),
  second = path.join(folder, "Second story.webm");
const youtubeId = "abcdefghijk";
await mkdir(folder);
await mkdir(path.join(root, "test-results"), { recursive: true });
await copyFile(path.join(root, "tests/fixtures/playback.webm"), first);
await copyFile(first, second);
let application;
const errors = [];
async function launch() {
  application = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
    env: { ...process.env, FRAME_YOUTUBE_API_KEY: "" },
  });
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("heading", { name: "Find your next favorite" })
    .waitFor();
  assert.equal(
    await application.evaluate(({ app }) => app.getPath("userData")),
    userData,
  );
  await application.evaluate(({ session }) => {
    // Everything stays offline. The official-player document is a controlled response only.
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    session
      .fromPartition("frame-youtube-player")
      .protocol.handle("https", (request) => {
        globalThis.lastOrganizationEmbed = request.url;
        return new Response(
          "<!doctype html><title>Controlled player fixture</title>",
          { headers: { "content-type": "text/html" } },
        );
      });
  });
  return page;
}
async function choose(filePaths) {
  await application.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, filePaths);
}
async function confirm(response) {
  await application.evaluate(({ dialog }, value) => {
    dialog.showMessageBox = async () => ({
      response: value,
      checkboxChecked: false,
    });
  }, response);
}
async function nav(page, name) {
  await page
    .getByRole("button", { name, exact: name !== "Watch Later" })
    .click();
}
async function pause(page) {
  if (await page.getByRole("button", { name: "Pause", exact: true }).count())
    await page.getByRole("button", { name: "Pause", exact: true }).click();
}
async function started(page, title) {
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video && video.videoWidth > 0 && video.currentTime > 0 && !video.paused
    );
  });
}
async function seek(page, value) {
  await page
    .getByRole("slider", { name: "Seek video", exact: true })
    .evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}
async function playlist(page) {
  await nav(page, "Playlists");
  await page
    .getByRole("heading", { name: "Evening stories", exact: true })
    .waitFor();
}
try {
  let page = await launch();
  await choose([first]);
  await nav(page, "Offline Library");
  await nav(page, "Import videos");
  await page
    .getByText("1 imported · 0 already in library · 0 could not be imported", {
      exact: true,
    })
    .waitFor({ timeout: 30000 });
  await nav(page, "Save First story for later");
  await page
    .getByRole("button", { name: "Unsave First story for later", exact: true })
    .waitFor();
  await nav(page, "Add First story to playlist");
  await page
    .getByRole("textbox", { name: "New playlist name" })
    .fill("Evening stories");
  await nav(page, "Add video");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const savedPlaylist = (
    await page.evaluate(() => window.frame.organization.list())
  )[0];
  const localId = (
    await page.evaluate(() =>
      window.frame.library.list({ search: "", sort: "newest", offset: 0 }),
    )
  ).items[0].id;
  await nav(page, "Watch Later");
  await page
    .getByRole("button", { name: "Play saved First story", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "YouTube video link" })
    .fill(`https://youtu.be/${youtubeId}`);
  await nav(page, "Save link");
  const linkTitle = (
    await page.evaluate(() => window.frame.youtube.saved("", 0))
  ).items[0].title;
  await nav(page, `Add ${linkTitle} to playlist`);
  await page
    .getByRole("combobox", { name: "Choose playlist" })
    .selectOption(savedPlaylist.id);
  await nav(page, "Add video");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await playlist(page);
  assert.equal(await page.locator(".playlist-entry").count(), 2);
  await nav(page, `Move ${linkTitle} up`);
  await page.waitForFunction(() =>
    document
      .querySelector(".playlist-entry .entry-title")
      ?.textContent.includes("YouTube"),
  );
  await page
    .locator(".playlist-entry")
    .first()
    .dragTo(page.locator(".playlist-entry").last());
  await page.waitForFunction(() =>
    document
      .querySelector(".playlist-entry .entry-title")
      ?.textContent.includes("First story"),
  );
  await nav(page, "Rename playlist");
  await page
    .getByRole("textbox", { name: "Playlist name" })
    .fill("Evening stories renamed");
  await nav(page, "Save playlist");
  await page
    .getByRole("heading", { name: "Evening stories renamed", exact: true })
    .waitFor();
  await nav(page, "Rename playlist");
  await page
    .getByRole("textbox", { name: "Playlist name" })
    .fill("Evening stories");
  await nav(page, "Save playlist");
  await page
    .getByRole("heading", { name: "Evening stories", exact: true })
    .waitFor();
  await page.screenshot({ path: "test-results/playlists.png" });
  console.log("Playlist create/add/reorder/rename passed.");
  await nav(page, "Play playlist");
  await started(page, "First story");
  await pause(page);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "test-results/playlist-local.png" });
  await seek(page, 6);
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 6) < 0.2,
  );
  await page
    .getByRole("combobox", { name: "Playlist repeat mode" })
    .selectOption("one");
  await seek(page, 17.8);
  await nav(page, "Play");
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video && !video.paused && video.currentTime < 3 && video.currentTime > 0
    );
  });
  await pause(page);
  await nav(page, "Shuffle playlist");
  await expect(
    page.getByRole("button", { name: "Shuffle playlist" }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav(page, "Next playlist item");
  await page.getByRole("heading", { name: linkTitle, exact: true }).waitFor();
  await nav(page, "Load official player");
  await page.waitForFunction(
    async () => (await window.frame.organization.youtubeVisits(0)).total === 1,
  );
  assert.ok(
    (
      await application.evaluate(() => globalThis.lastOrganizationEmbed)
    ).includes("&loop=1&playlist=abcdefghijk"),
  );
  await nav(page, `Add ${linkTitle} to playlist`);
  await page.getByRole("dialog").waitFor();
  // Custom collection dialogs must hide the native YouTube view.
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.every(
          (view) => !view.getVisible(),
        ),
      ),
    )
    .toBe(true);
  await nav(page, "Close dialog");
  await page.screenshot({ path: "test-results/playlist-online.png" });
  await playlist(page);
  console.log(
    "Mixed playback, local repeat/shuffle and controlled online view passed.",
  );
  // Unsave keeps a playlist reference; removing a local library entry preserves its unavailable slot.
  await page.evaluate((id) => window.frame.youtube.unsave(id), youtubeId);
  let detail = await page.evaluate(
    (id) => window.frame.organization.detail(id),
    savedPlaylist.id,
  );
  assert.equal(
    detail.items.find((item) => item.source.kind === "youtube").youtube.id,
    youtubeId,
  );
  await rename(first, `${first}.away`);
  await page.evaluate(() => window.frame.library.refresh());
  await nav(page, "Home");
  await playlist(page);
  await page.getByText("Local file unavailable", { exact: true }).waitFor();
  await rename(`${first}.away`, first);
  await page.evaluate(() => window.frame.library.refresh());
  await nav(page, "Settings");
  await page
    .getByRole("combobox", { name: "Default playback speed" })
    .selectOption("1.5");
  await page.getByRole("checkbox", { name: "Start muted" }).check();
  await page.waitForFunction(
    async () =>
      (
        await window.frame.organization.initializePlayback({
          volume: 0.8,
          muted: false,
          speed: 1,
          autoplay: false,
        })
      ).muted === true,
  );
  await choose([folder]);
  await nav(page, "Add library directory");
  await page
    .getByRole("button", { name: `Scan ${folder}`, exact: true })
    .click();
  await page
    .getByText("1 imported · 0 failed · 0 metadata warnings", { exact: true })
    .waitFor({ timeout: 30000 });
  await nav(page, "Choose folder");
  await expect
    .poll(() =>
      page.evaluate(() => window.frame.organization.downloadDirectory()),
    )
    .toBe(folder);
  const before = await page.evaluate(() => window.frame.organization.storage());
  assert.equal(before.thumbnailCount, 2);
  await confirm(0);
  await nav(page, "Clear previews");
  await page
    .getByRole("button", { name: "Clear previews", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    async () =>
      (await window.frame.organization.storage()).thumbnailCount === 2,
  );
  await confirm(1);
  await nav(page, "Clear previews");
  await page
    .getByText("2 previews cleared · 0 could not be cleared.", { exact: true })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.frame.organization.storage()))
      .thumbnailCount,
    0,
  );
  await nav(page, "Rebuild previews");
  await page
    .getByText(
      "2 previews processed · 0 unavailable. Run again for the next batch if needed.",
      { exact: true },
    )
    .waitFor({ timeout: 30000 });
  assert.equal(
    (await page.evaluate(() => window.frame.organization.storage()))
      .thumbnailCount,
    2,
  );
  assert.equal((await stat(first)).size, (await stat(second)).size);
  await page.screenshot({ path: "test-results/organization-settings.png" });
  console.log("Settings, directories, defaults and thumbnail cache passed.");
  // Exercise automatic transitions through two real local files into an online-only entry.
  const secondLocal = (
    await page.evaluate(() =>
      window.frame.library.list({
        search: "Second story",
        sort: "title",
        offset: 0,
      }),
    )
  ).items[0];
  const addedEntry = await page.evaluate(
    ({ playlistId, videoId }) =>
      window.frame.organization.add(playlistId, { kind: "local", id: videoId }),
    { playlistId: savedPlaylist.id, videoId: secondLocal.id },
  );
  detail = await page.evaluate(
    (id) => window.frame.organization.detail(id),
    savedPlaylist.id,
  );
  const localEntry = detail.items.find(
    (item) => item.source.id === localId,
  ).entryId;
  const onlineEntry = detail.items.find(
    (item) => item.source.kind === "youtube",
  ).entryId;
  await page.evaluate(
    ({ id, order }) => window.frame.organization.reorder(id, order),
    { id: savedPlaylist.id, order: [localEntry, addedEntry, onlineEntry] },
  );
  await playlist(page);
  await nav(page, "Play playlist");
  await started(page, "First story");
  await pause(page);
  await nav(page, "Shuffle playlist");
  await expect(
    page.getByRole("button", { name: "Shuffle playlist" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("combobox", { name: "Playlist repeat mode" })
    .selectOption("none");
  await seek(page, 17.8);
  await nav(page, "Play");
  await started(page, "Second story");
  await pause(page);
  await seek(page, 17.8);
  await nav(page, "Play");
  await page.getByRole("heading", { name: linkTitle, exact: true }).waitFor();
  await expect(
    page.getByRole("button", { name: "Load official player", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next playlist item" }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Playlist repeat mode" })
    .selectOption("all");
  await nav(page, "Next playlist item");
  await started(page, "First story");
  await pause(page);
  await page
    .getByRole("checkbox", { name: "Auto advance local videos" })
    .uncheck();
  await seek(page, 17.8);
  await nav(page, "Play");
  await page.waitForFunction(
    () => document.querySelector("video")?.ended === true,
  );
  await expect(
    page.getByRole("heading", { name: "First story", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Auto advance local videos" })
    .check();
  await page
    .getByRole("combobox", { name: "Playlist repeat mode" })
    .selectOption("one");
  await nav(page, "Shuffle playlist");
  await page.evaluate(
    ({ id, entry }) => window.frame.organization.removeEntry(id, entry),
    { id: savedPlaylist.id, entry: addedEntry },
  );
  console.log(
    "Local playlist auto-advance, stop, repeat-all wrap and disabled auto-advance passed.",
  );
  await nav(page, "History");
  await page.getByRole("tab", { name: "YouTube visits" }).click();
  await page
    .getByRole("button", { name: `Open ${linkTitle}`, exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Record history", exact: true })
    .uncheck();
  await page.getByText("History is paused.", { exact: false }).waitFor();
  const history = await page.evaluate(() => window.frame.playback.history(0));
  assert.equal(history.total, 2);
  await page.getByRole("tab", { name: "Local playback" }).click();
  await nav(page, "Forget Second story");
  await page
    .getByRole("button", { name: "Forget Second story", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await page.evaluate(() => window.frame.playback.history(0))).total,
    1,
  );
  await nav(page, "Offline Library");
  await nav(page, "Play Second story");
  await started(page, "Second story");
  await pause(page);
  assert.equal(
    (await page.evaluate(() => window.frame.playback.history(0))).total,
    1,
  );
  assert.equal(
    await page.locator("video").evaluate((video) => video.playbackRate),
    1.5,
  );
  assert.equal(
    await page.locator("video").evaluate((video) => video.muted),
    true,
  );
  await nav(page, "History");
  await page
    .getByRole("checkbox", { name: "Record history", exact: true })
    .check();
  await nav(page, "Clear all history");
  await page.waitForFunction(
    async () => (await window.frame.playback.history(0)).total === 0,
  );
  assert.equal(
    (await page.evaluate(() => window.frame.organization.youtubeVisits(0)))
      .total,
    0,
  );
  // All new filesystem capabilities accept IDs, never renderer paths.
  const invalid = await page.evaluate(async () => {
    const api = window.frame.organization;
    const attempts = [
      () => api.scanDirectory("/etc"),
      () => api.detail("../file"),
      () => api.updateSettings({ repeat: ["all"] }),
      () => api.saveLocalLater("file:///etc/passwd", true),
      () => api.add("bad", { kind: "local", id: "bad" }),
    ];
    return Promise.all(
      attempts.map(async (fn) => {
        try {
          await fn();
          return false;
        } catch {
          return true;
        }
      }),
    );
  });
  assert.ok(invalid.every(Boolean));
  await application.close();
  application = null;
  page = await launch();
  await playlist(page);
  detail = await page.evaluate(
    (id) => window.frame.organization.detail(id),
    savedPlaylist.id,
  );
  assert.deepEqual(
    detail.items.map((item) => item.source.kind),
    ["local", "youtube"],
  );
  assert.equal(
    await page.evaluate(
      (id) => window.frame.organization.isLocalLater(id),
      localId,
    ),
    true,
  );
  assert.equal(
    (await page.evaluate(() => window.frame.organization.settings())).shuffle,
    true,
  );
  assert.equal(
    (await page.evaluate(() => window.frame.organization.settings())).repeat,
    "one",
  );
  await nav(page, "Settings");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Default playback speed" })
      .inputValue(),
    "1.5",
  );
  assert.equal(
    await page.getByRole("checkbox", { name: "Start muted" }).isChecked(),
    true,
  );
  assert.equal(
    (await page.evaluate(() => window.frame.organization.directories())).length,
    1,
  );
  await playlist(page);
  await confirm(0);
  await nav(page, "Delete playlist");
  assert.equal(
    (await page.evaluate(() => window.frame.organization.list())).length,
    1,
  );
  await confirm(1);
  await nav(page, "Delete playlist");
  await page
    .getByRole("heading", { name: "A place for every mood." })
    .waitFor();
  assert.equal(
    (
      await page.evaluate(() =>
        window.frame.library.list({ search: "", sort: "newest", offset: 0 }),
      )
    ).total,
    2,
  );
  await stat(first);
  await stat(second);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real offline mixed-playlist UI, local bookmarks, drag/arrow reorder, rename, local repeat-one, shuffle/manual next, controlled YouTube loop/visit/modal isolation, unavailable files, folder scan, defaults, cache clear/rebuild, history pause/clear, native cancellation, request validation, restart persistence, and original-file preservation. Live YouTube playback is not tested.",
  );
} catch (error) {
  if (application) {
    const page = await application.firstWindow();
    await page.screenshot({ path: "test-results/organization-failure.png" });
    console.log(await page.locator("main").innerText());
  }
  throw error;
} finally {
  if (application) await application.close();
  await rm(temporary, { recursive: true, force: true });
}
