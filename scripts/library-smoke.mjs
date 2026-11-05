import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  copyFile,
  writeFile,
  rename,
  stat,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(
  path.join(os.tmpdir(), "frame-desktop-library-"),
);
const userData = path.join(temporary, "app-data");
const first = path.join(temporary, "Weekend film #1.webm");
const second = path.join(temporary, "Blue sky.mp4");
const broken = path.join(temporary, "Unsupported video.mp4");
await copyFile(path.join(root, "tests/fixtures/sample.webm"), first);
await copyFile(path.join(root, "tests/fixtures/sample.mp4"), second);
await writeFile(broken, "This is not a valid media file");
let application;
async function launch() {
  application = await electron.launch({
    args: [root, `--user-data-dir=${userData}`],
  });
  const page = await application.firstWindow();
  await page
    .getByRole("heading", { name: "Find your next favorite" })
    .waitFor();
  assert.equal(
    await application.evaluate(({ app }) => app.getPath("userData")),
    userData,
    "The test must use isolated app data",
  );
  return page;
}
async function chooseFiles(files) {
  await application.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, files);
}
const query = { search: "", sort: "title", offset: 0 };
try {
  let page = await launch();
  await chooseFiles([first, second, broken]);
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
  const result = await page.evaluate(
    (q) => window.frame.library.list(q),
    query,
  );
  assert.equal(result.total, 3);
  for (const video of result.items.filter(
    (item) => item.title !== "Unsupported video",
  )) {
    assert.ok(video.duration >= 1.9, JSON.stringify(video));
    assert.ok(
      video.thumbnail?.startsWith("frame-thumb://cache/"),
      JSON.stringify(video),
    );
    assert.equal(video.metadataError, null, JSON.stringify(video));
  }
  const corrupt = result.items.find(
    (item) => item.title === "Unsupported video",
  );
  assert.ok(corrupt.metadataError);
  assert.equal(corrupt.thumbnail, null);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".local-thumbnail img")].filter(
        (image) => image.complete && image.naturalWidth === 480,
      ).length === 2,
  );
  await page.screenshot({ path: "test-results/library-imported.png" });
  const duplicates = await page.evaluate(() =>
    window.frame.library.importVideos(),
  );
  assert.equal(duplicates.duplicates, 3);
  assert.equal(duplicates.added, 0);
  // Reject arbitrary IPC payloads; no renderer-provided file paths are accepted.
  assert.ok(
    await page.evaluate(async () => {
      try {
        await window.frame.library.list({
          search: "",
          sort: "invalid",
          offset: 0,
        });
        return false;
      } catch {
        return true;
      }
    }),
  );
  assert.ok(
    await page.evaluate(async () => {
      try {
        await window.frame.library.remove("../outside");
        return false;
      } catch {
        return true;
      }
    }),
  );
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  assert.equal(
    (await page.evaluate(() => window.frame.library.importVideos())).canceled,
    true,
  );
  assert.equal(
    await application.evaluate(
      async ({ net }) =>
        (await net.fetch("frame-thumb://cache/invalid")).status,
    ),
    404,
  );
  await application.close();
  application = null;
  page = await launch();
  assert.equal(
    (await page.evaluate((q) => window.frame.library.list(q), query)).total,
    3,
  );
  await page
    .getByRole("button", { name: "Offline Library", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search local videos" })
    .fill("Weekend");
  await page
    .getByRole("heading", { name: "Weekend film #1", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".local-card").length === 1,
  );
  await rename(first, `${first}.away`);
  await page.getByRole("button", { name: "Check files", exact: true }).click();
  await page.getByText("File unavailable", { exact: true }).waitFor();
  assert.equal(
    (await page.evaluate((q) => window.frame.library.list(q), query)).missing,
    1,
  );
  await rename(`${first}.away`, first);
  await page.evaluate(() => window.frame.library.refresh());
  assert.equal(
    (await page.evaluate((q) => window.frame.library.list(q), query)).missing,
    0,
  );
  // Native confirmation is mocked only by the test, not bypassed by the application.
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
  const id = result.items.find((item) => item.title === "Weekend film #1").id;
  assert.equal(
    await page.evaluate((id) => window.frame.library.remove(id), id),
    false,
  );
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await page
    .getByRole("button", { name: "Remove Weekend film #1 from library" })
    .click();
  await page
    .getByText("Library entry removed. Your original file was kept.")
    .waitFor();
  assert.ok((await stat(first)).isFile());
  assert.equal(
    (await page.evaluate((q) => window.frame.library.list(q), query)).total,
    2,
  );
  console.log(
    "PASS: native import flow, actual WebM/MP4 decoding, PNG thumbnails, SQLite restart persistence, search, deduplication, missing/restored files, IPC validation, confirmed removal, and original-file preservation.",
  );
} finally {
  if (application) await application.close();
  await rm(temporary, { recursive: true, force: true });
}
