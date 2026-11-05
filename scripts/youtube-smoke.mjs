import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "frame-youtube-smoke-"));
const userData = path.join(temporary, "app-data"),
  id = "abcDEF123_-",
  second = "zyxWVU987_-";
const sentinel = "synthetic-test-key-not-a-live-key";
let application;
async function launch(configured = true) {
  application = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
    env: { ...process.env, FRAME_YOUTUBE_API_KEY: configured ? sentinel : "" },
  });
  const page = await application.firstWindow();
  await page
    .getByRole("heading", { name: "Find your next favorite" })
    .waitFor();
  assert.equal(
    await application.evaluate(({ app }) => app.getPath("userData")),
    userData,
  );
  // Local controlled protocol responses. No real Google API/player response is used.
  await application.evaluate(
    ({ session }, { id, second }) => {
      globalThis.youtubeRequests = [];
      globalThis.embedRequests = [];
      const api = session.fromPartition("frame-youtube-api");
      const item = (videoId, title) => ({
        id: videoId,
        snippet: {
          title,
          channelTitle: "Controlled API channel",
          description: "Test-only metadata; not a live YouTube result.",
          publishedAt: "2026-01-01T12:00:00Z",
        },
        contentDetails: { duration: "PT2M3S" },
        statistics: { viewCount: "12345" },
        status: { embeddable: true },
      });
      api.protocol.handle("https", (request) => {
        const url = new URL(request.url);
        if (url.origin !== "https://www.googleapis.com")
          return new Response(null, { status: 404 });
        globalThis.youtubeRequests.push({
          path: url.pathname,
          query: url.searchParams.get("q"),
          page: url.searchParams.get("pageToken"),
          hasKey: request.headers.has("x-goog-api-key"),
          keyInUrl: url.searchParams.has("key"),
        });
        const q = url.searchParams.get("q");
        if (q === "offline") throw new Error("Controlled offline response");
        if (q === "quota")
          return new Response(
            JSON.stringify({
              error: { errors: [{ reason: "quotaExceeded" }] },
            }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        let body;
        if (url.pathname.endsWith("/search"))
          body = {
            items:
              q === "empty"
                ? []
                : [{ id: { videoId: id } }, { id: { videoId: second } }],
            nextPageToken: q === "empty" ? undefined : "PAGE2",
          };
        else if (url.searchParams.has("id"))
          body = {
            items: [
              item(id, "First public video"),
              item(second, "Second public video"),
            ].filter((item) =>
              url.searchParams.get("id").split(",").includes(item.id),
            ),
          };
        else
          body = {
            items: url.searchParams.get("pageToken")
              ? [item(second, "Second public video")]
              : [item(id, "First public video")],
            nextPageToken: url.searchParams.get("pageToken")
              ? undefined
              : "PAGE2",
          };
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      });
      session.defaultSession.protocol.handle("https", (request) =>
        new URL(request.url).hostname === "i.ytimg.com"
          ? new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#354b5c"/><text x="60" y="145" fill="white" font-size="20">Controlled thumbnail fixture</text></svg>',
              { headers: { "content-type": "image/svg+xml" } },
            )
          : new Response(null, { status: 404 }),
      );
      session
        .fromPartition("frame-youtube-player")
        .protocol.handle("https", (request) => {
          const url = new URL(request.url);
          if (url.origin !== "https://www.youtube-nocookie.com")
            return new Response(null, { status: 404 });
          globalThis.embedRequests.push({
            url: request.url,
            referer: request.headers.get("referer"),
            referrer: request.referrer,
            hasKey: request.headers.has("x-goog-api-key"),
          });
          return new Response(
            '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Controlled player fixture</title></head><body style="margin:0;background:#142335;color:#d7e5f4;font:18px sans-serif;display:grid;place-items:center;height:100vh"><div>Controlled official-player response<br><small>No live YouTube playback is being tested.</small></div></body></html>',
            { headers: { "content-type": "text/html" } },
          );
        });
    },
    { id, second },
  );
  return page;
}
async function nativeState() {
  return application.evaluate(({ BrowserWindow, WebContentsView }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const view = window.contentView.children.find(
      (child) =>
        child instanceof WebContentsView &&
        child.webContents
          .getURL()
          .startsWith("https://www.youtube-nocookie.com/embed/"),
    );
    return view
      ? {
          visible: view.getVisible(),
          bounds: view.getBounds(),
          url: view.webContents.getURL(),
          preferences: view.webContents.getLastWebPreferences(),
        }
      : null;
  });
}
async function waitState(predicate) {
  for (let i = 0; i < 100; i++) {
    const state = await nativeState();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Native player did not reach expected state");
}
try {
  let page = await launch();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("API key configured", { exact: true }).waitFor();
  assert.ok(!(await page.content()).includes(sentinel));
  assert.deepEqual(
    await page
      .evaluate(() => window.frame.youtube.status())
      .then((status) => ({
        configured: status.configured,
        source: status.source,
      })),
    { configured: true, source: "environment" },
  );
  await page
    .getByRole("button", { name: "YouTube Discovery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Watch First public video", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Watch Second public video", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search YouTube", exact: true })
    .fill("design");
  await page
    .locator(".youtube-search")
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Results for “design”", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Watch Second public video", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Save First public video", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unsave First public video", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Watch First public video", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load official player", exact: true })
    .click();
  const state = await waitState((state) => state?.visible);
  assert.ok(
    state.url.startsWith(`https://www.youtube-nocookie.com/embed/${id}`),
  );
  assert.equal(state.preferences.nodeIntegration, false);
  assert.equal(state.preferences.contextIsolation, true);
  assert.equal(state.preferences.sandbox, true);
  assert.ok(!state.preferences.preload);
  const isolation = await application.evaluate(async ({ webContents }) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) =>
        item.getURL().startsWith("https://www.youtube-nocookie.com/embed/"),
      );
    return contents.executeJavaScript(
      "({node:typeof require,bridge:typeof window.frame})",
    );
  });
  assert.deepEqual(isolation, { node: "undefined", bridge: "undefined" });
  await application.evaluate(async ({shell,webContents})=>{
    globalThis.externalPlayerLinks=[];
    shell.openExternal=async url=>{globalThis.externalPlayerLinks.push(url);};
    const contents=webContents.getAllWebContents().find(item=>item.getURL().startsWith('https://www.youtube-nocookie.com/embed/'));
    await contents.executeJavaScript("window.open('https://www.youtube.com/watch?v=abcDEF123_-');window.open('https://evil.test/');undefined",true);
  });
  await page.waitForTimeout(150);
  assert.deepEqual(await application.evaluate(()=>globalThis.externalPlayerLinks),['https://www.youtube.com/watch?v=abcDEF123_-']);
  const request = await application.evaluate(() => globalThis.embedRequests[0]);
  assert.equal(request.hasKey, false);
  assert.equal(
    request.referer || request.referrer,
    "https://app.frame.offline/",
    JSON.stringify(request),
  );
  const slot = await page.locator(".youtube-player-slot").boundingBox();
  assert.ok(Math.abs(state.bounds.width - slot.width) <= 1);
  await page.screenshot({ path: "test-results/youtube-player-fixture.png" });
  await page
    .getByRole("button", { name: "About Frame", exact: true })
    .first()
    .click();
  await waitState((state) => state && !state.visible);
  await page.getByRole("button", { name: "Close about", exact: true }).click();
  await waitState((state) => state?.visible);
  assert.ok(
    await page.evaluate(async () => {
      try {
        await window.frame.youtube.playerOpen("https://evil.test");
        return false;
      } catch {
        return true;
      }
    }),
  );
  assert.ok(
    await page.evaluate(async () => {
      try {
        await window.frame.youtube.playerBounds("bad", {
          x: 0,
          y: 0,
          width: Infinity,
          height: 400,
          visible: true,
        });
        return false;
      } catch {
        return true;
      }
    }),
  );
  await page.reload();
  await page.getByRole('heading', {name:'Find your next favorite'}).waitFor();
  await waitState(state=>state===null);
  await page
    .getByRole("button", { name: "Watch Later", exact: false })
    .first()
    .click();
  await waitState((state) => state === null);
  await page
    .getByRole("button", { name: "Watch First public video", exact: true })
    .waitFor();
  const requests = await application.evaluate(() => globalThis.youtubeRequests);
  assert.ok(
    requests.length >= 3 &&
      requests.every((item) => item.hasKey && !item.keyInUrl),
  );
  await page
    .getByRole("button", { name: "YouTube Discovery", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search YouTube", exact: true })
    .fill("quota");
  await page
    .locator(".youtube-search")
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page
    .getByText("The API quota or request limit has been reached.", {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Offline Library", exact: true })
    .waitFor();
  await application.close();
  application = null;

  page = await launch(false);
  await page
    .getByRole("button", { name: "YouTube Discovery", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Connect your YouTube API key.",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Watch Later", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Watch First public video", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "YouTube video link", exact: true })
    .fill(`https://youtu.be/${second}`);
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Watch Saved YouTube video · ${second}`,
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await page.evaluate(() => window.frame.youtube.saved("", 0))).total,
    2,
  );
  await page
    .getByRole("button", { name: "Unsave First public video", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Watch First public video", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await page.evaluate(() => window.frame.youtube.saved("", 0))).total,
    1,
  );
  assert.ok(!(await page.content()).includes(sentinel));
  console.log(
    "PASS (controlled API/player responses): popular/search/paging, metadata, redacted key status, saved links across restart without a key, quota fallback, isolated native embed URL/Referer, no Node/IPC in remote content, bounds validation, modal visibility, and cleanup. Live Google API requests and real YouTube playback are NOT verified by this test.",
  );
} finally {
  if (application) await application.close();
  await rm(temporary, { recursive: true, force: true });
}
