import { app, BrowserWindow, ipcMain, shell, dialog, protocol } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Library, extensions, isId, validateQuery } from "./library.cjs";
import { MetadataExtractor } from "./metadata.cjs";
import { Playback } from "./playback.cjs";
import { readSubtitle } from "./subtitle-file.cjs";
import { pathToFileURL } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "frame-playback",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
  {
    scheme: "frame-thumb",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "frame-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const devUrl =
  !app.isPackaged && process.env.FRAME_DEV_URL === "http://127.0.0.1:5173"
    ? process.env.FRAME_DEV_URL
    : undefined;
const appUrl = pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
let window: BrowserWindow | null = null;
let library: Library;
let extractor: MetadataExtractor;
let playback: Playback;
let busy = false;
let progress: { completed: number; total: number } | null = null;
function notifyProgress() {
  if (window && !window.isDestroyed())
    window.webContents.send("library:progress", progress);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

function trustedSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    url?.split("#")[0] !== (devUrl ? `${devUrl}/` : appUrl)
  ) {
    throw new Error("Untrusted IPC sender");
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 600,
    title: "Frame",
    backgroundColor: "#101111",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== (devUrl ? `${devUrl}/` : appUrl))
      event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback, details) =>
      callback(
        permission === "fullscreen" &&
          contents === window?.webContents &&
          details.requestingUrl?.split("#")[0] ===
            (devUrl ? `${devUrl}/` : appUrl),
      ),
  );
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, "../dist/index.html"));
  window.on("closed", () => {
    window = null;
    extractor?.dispose();
  });
}

app
  .whenReady()
  .then(async () => {
    const directory = path.join(app.getPath("userData"), "library");
    mkdirSync(directory, { recursive: true });
    library = new Library(directory);
    await library.prepare();
    extractor = new MetadataExtractor();
    playback = new Playback(library);
    protocol.handle("frame-playback", (request) => playback.stream(request));
    ipcMain.handle("playback:open", (event, id: unknown) => {
      trustedSender(event);
      return playback.open(id);
    });
    ipcMain.handle("playback:save", (event, token: unknown, value: unknown) => {
      trustedSender(event);
      playback.save(token, value);
    });
    ipcMain.handle("playback:close", (event, token: unknown) => {
      trustedSender(event);
      if (!isId(token)) throw new Error("Invalid session");
      playback.close(token);
    });
    ipcMain.handle("playback:history", (event, offset: unknown) => {
      trustedSender(event);
      return library.history(offset);
    });
    ipcMain.handle("playback:subtitles", async (event, token: unknown) => {
      trustedSender(event);
      playback.requireToken(token);
      const result = await dialog.showOpenDialog(window!, {
        title: "Load local subtitles",
        properties: ["openFile"],
        filters: [{ name: "UTF-8 subtitles", extensions: ["vtt", "srt"] }],
      });
      if (result.canceled || !result.filePaths.length) return null;
      playback.requireToken(token);
      return readSubtitle(result.filePaths[0]);
    });
    protocol.handle("frame-thumb", async (request) => {
      const url = new URL(request.url);
      const id = url.pathname.slice(1);
      if (request.method !== "GET" || url.hostname !== "cache" || !isId(id))
        return new Response(null, { status: 404 });
      try {
        if (!library.getSource(id)) return new Response(null, { status: 404 });
        return new Response(await readFile(library.thumbnailPath(id)), {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    ipcMain.handle("library:list", (event, query: unknown) => {
      trustedSender(event);
      return { ...library.list(validateQuery(query)), progress, busy };
    });
    ipcMain.handle("library:refresh", async (event) => {
      trustedSender(event);
      if (busy)
        throw new Error("An import or library scan is already running.");
      busy = true;
      try {
        await library.refresh();
      } finally {
        busy = false;
        notifyProgress();
      }
    });
    ipcMain.handle("library:import", async (event) => {
      trustedSender(event);
      if (busy)
        throw new Error("An import or library scan is already running.");
      busy = true;
      try {
        const result = await dialog.showOpenDialog(window!, {
          title: "Import videos into Frame",
          properties: ["openFile", "multiSelections"],
          filters: [{ name: "Video files", extensions }],
        });
        if (result.canceled)
          return {
            added: 0,
            duplicates: 0,
            failed: 0,
            warnings: 0,
            canceled: true,
          };
        if (result.filePaths.length > 100)
          throw new Error("Please select at most 100 videos per import.");
        progress = { completed: 0, total: result.filePaths.length };
        notifyProgress();
        let completed = 0;
        return await library.importFiles(
          result.filePaths,
          (source, id) => extractor.extract(source, library.thumbnailPath(id)),
          () => {
            progress = {
              completed: ++completed,
              total: result.filePaths.length,
            };
            notifyProgress();
          },
        );
      } finally {
        busy = false;
        progress = null;
        extractor.dispose();
        notifyProgress();
      }
    });
    ipcMain.handle("library:remove", async (event, id: unknown) => {
      trustedSender(event);
      if (!isId(id)) throw new Error("Invalid video ID");
      if (busy)
        throw new Error("Wait for the current import or scan to finish.");
      if (!library.getSource(id)) return false;
      busy = true;
      try {
        const answer = await dialog.showMessageBox(window!, {
          type: "question",
          title: "Remove from library?",
          message: "Remove this video from your Frame library?",
          detail:
            "The original video file will stay on your computer. Only the library entry and its cached thumbnail will be removed.",
          buttons: ["Keep video", "Remove from library"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (answer.response !== 1) return false;
        await library.remove(id);
        return true;
      } finally {
        busy = false;
        notifyProgress();
      }
    });
    ipcMain.handle("frame:info", (event) => {
      trustedSender(event);
      return { version: app.getVersion(), platform: process.platform };
    });
    ipcMain.handle("frame:youtube-home", async (event) => {
      trustedSender(event);
      await shell.openExternal("https://www.youtube.com/");
    });
    // Show the app immediately; rescan stored paths asynchronously so offline drives do not delay launch.
    busy = true;
    createWindow();
    void library
      .refresh()
      .catch(() => {})
      .finally(() => {
        busy = false;
        notifyProgress();
      });
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch(() => {
    dialog.showErrorBox(
      "Frame could not open its library",
      "Your library database or cache could not be opened. Check free disk space and permissions for Frame’s application-data folder, then restart. Your original videos have not been changed.",
    );
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  extractor?.dispose();
  library?.close();
});
