import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, writeFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const temporary = await mkdtemp(
  path.join(os.tmpdir(), "frame-playback-smoke-"),
);
const userData = path.join(temporary, "app-data");
const first = path.join(temporary, "First story.webm");
const next = path.join(temporary, "Next story.webm");
const corrupt = path.join(temporary, "Broken movie.mp4");
const captions = path.join(temporary, "Local captions.srt");
await copyFile(path.join(root, "tests/fixtures/playback.webm"), first);
await copyFile(first, next);
await writeFile(corrupt, "Not a movie");
await writeFile(
  captions,
  "1\n00:00:00,000 --> 00:00:18,000\nLocal captions — entirely offline.",
);
let application;
const errors = [];
async function launch() {
  application = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
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
  // Explicitly block all HTTP(S): playback and subtitles must still work.
  await application.evaluate(({ session }) => {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*"] },
      (_details, callback) => callback({ cancel: true }),
    );
  });
  return page;
}
async function choose(files) {
  await application.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, files);
}
async function range(page, name, value) {
  await page
    .getByRole("slider", { name, exact: true })
    .evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(element, String(value));
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}
async function pause(page) {
  if (await page.getByRole("button", { name: "Pause", exact: true }).count())
    await page.getByRole("button", { name: "Pause", exact: true }).click();
}
async function started(page, title) {
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.currentTime > 0 && !v.paused;
  });
}
try {
  let page = await launch();
  await choose([first, next, corrupt]);
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import videos", exact: true })
    .click();
  await page
    .getByText(
      "3 imported · 0 already in library · 0 could not be imported · 1 with metadata warnings",
      { exact: true },
    )
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("combobox", { name: "Sort local videos" })
    .selectOption("title");
  await page
    .getByRole("button", { name: "Play First story", exact: true })
    .click();
  await started(page, "First story");
  await pause(page);
  const firstUrl = await page.locator("video").getAttribute("src");
  await range(page, "Seek video", 6);
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 6) < 0.1,
  );
  await range(page, "Volume", 0.35);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  assert.equal(
    await page.locator("video").evaluate((video) => video.muted),
    true,
  );
  await page.locator(".player-shell").focus();
  await page.keyboard.press("m");
  assert.equal(
    await page.locator("video").evaluate((video) => video.muted),
    false,
  );
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 1) < 0.1,
  );
  await page.keyboard.press("l");
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 11) < 0.1,
  );
  await page.keyboard.press("j");
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 1) < 0.1,
  );
  await page.keyboard.press("k");
  await page.waitForFunction(() => !document.querySelector("video").paused);
  await page.keyboard.press("k");
  await page.waitForFunction(() => document.querySelector("video").paused);
  await range(page, "Seek video", 6);
  await page
    .getByRole("combobox", { name: "Playback speed" })
    .selectOption("1.5");
  assert.equal(
    await page.locator("video").evaluate((video) => video.playbackRate),
    1.5,
  );
  await page.getByRole("button", { name: "Theater mode", exact: true }).click();
  assert.ok(
    await page
      .locator(".local-watch")
      .evaluate((element) => element.classList.contains("theater-mode")),
  );
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  // Fullscreen controls overlay the video and disappear only during idle playback.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.mouse.move(400, 170);
  await page.waitForFunction(() =>
    document
      .querySelector(".player-shell")
      .classList.contains("controls-hidden"),
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".player-controls")).opacity ===
      "0",
  );
  assert.equal(
    await page
      .locator("video")
      .evaluate((video) => getComputedStyle(video).cursor),
    "none",
  );
  const fillsScreen = await page.locator("video").evaluate((video) => {
    const r = video.getBoundingClientRect();
    return r.width >= innerWidth - 1 && r.height >= innerHeight - 1;
  });
  assert.ok(fillsScreen);
  await page.screenshot({ path: "test-results/fullscreen-idle.png" });
  await page.mouse.move(420, 190);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".player-controls")).opacity ===
      "1",
  );
  await pause(page);
  await page.waitForTimeout(2900);
  assert.ok(
    await page
      .locator(".player-shell")
      .evaluate((element) => element.classList.contains("controls-visible")),
  );
  await range(page, "Seek video", 0);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.mouse.move(400, 170);
  await page.getByRole("button", { name: "Pause", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.waitForTimeout(2900);
  assert.ok(
    await page
      .locator(".player-shell")
      .evaluate((element) => element.classList.contains("controls-visible")),
    "Keyboard-focused controls must stay visible",
  );
  await pause(page);
  await range(page, "Seek video", 6);

  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await choose([captions]);
  await page
    .getByRole("button", { name: "Load subtitles", exact: true })
    .click();
  await page
    .getByText("Subtitles: Local captions.srt", { exact: false })
    .waitFor();
  await page.waitForFunction(() => {
    const track = document.querySelector("video").textTracks[0];
    return (
      track?.cues?.length === 1 &&
      track.mode === "showing" &&
      track.cues[0].text.includes("entirely offline")
    );
  });
  await page
    .getByRole("button", { name: "Hide subtitles", exact: true })
    .click();
  assert.equal(
    await page.locator("video").evaluate((video) => video.textTracks[0].mode),
    "disabled",
  );
  await page
    .getByRole("button", { name: "Show subtitles", exact: true })
    .click();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.fullscreenElement &&
      document.querySelector("video").textTracks[0].cues[0].line === 82,
  );
  await page.screenshot({ path: "test-results/fullscreen-captions.png" });
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.fullscreenElement &&
      document.querySelector("video").textTracks[0].cues[0].line === "auto",
  );
  await page.screenshot({ path: "test-results/local-player.png" });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume First story", exact: true })
    .waitFor();
  let history = await page.evaluate(() => window.frame.playback.history(0));
  assert.equal(history.total, 1);
  assert.ok(Math.abs(history.items[0].position - 6) < 0.2);
  assert.equal(
    await application.evaluate(
      async ({ net }, url) => (await net.fetch(url)).status,
      firstUrl,
    ),
    404,
  );
  await application.close();
  application = null;

  page = await launch();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume First story", exact: true })
    .click();
  await started(page, "First story");
  await pause(page);
  assert.ok(
    await page
      .locator("video")
      .evaluate((video) => video.currentTime >= 6 && video.currentTime < 9),
  );
  assert.equal(
    await page.locator("video").evaluate((video) => video.playbackRate),
    1.5,
  );
  assert.ok(
    Math.abs(
      (await page.locator("video").evaluate((video) => video.volume)) - 0.35,
    ) < 0.01,
  );
  // Open from the complete library page to build a two-video autoplay queue.
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Sort local videos" })
    .selectOption("title");
  await page
    .getByRole("button", { name: "Play First story", exact: true })
    .click();
  await started(page, "First story");
  await pause(page);
  await page
    .getByRole("checkbox", { name: "Autoplay next", exact: true })
    .check();
  await range(page, "Seek video", 17.7);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await started(page, "Next story");
  await pause(page);
  await range(page, "Seek video", 17.7);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("video").ended);
  await page
    .getByRole("heading", { name: "Next story", exact: true })
    .waitFor();
  history = await page.evaluate(() => window.frame.playback.history(0));
  assert.equal(history.total, 2);
  assert.ok(history.items.every((item) => item.completed));
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play Broken movie", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "could not be played" })
    .waitFor();
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await rename(first, `${first}.away`);
  await page
    .getByRole("button", { name: "Play First story", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "file is unavailable" })
    .waitFor();
  await rename(`${first}.away`, first);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await started(page, "First story");
  assert.ok(
    await page.evaluate(async () => {
      try {
        await window.frame.playback.open("file:///etc/passwd");
        return false;
      } catch {
        return true;
      }
    }),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real offline decoding, play/pause, seek, volume/mute, keyboard shortcuts, speed, theater/fullscreen, idle fade/cursor hiding, movement/pause/keyboard wake, SRT captions, saved history/resume across restart, autoplay/end-of-queue, expired URL rejection, corrupt/missing-file errors, and recovery.",
  );
} finally {
  if (application) await application.close();
  await rm(temporary, { recursive: true, force: true });
}
