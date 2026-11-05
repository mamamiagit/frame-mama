import { ipcMain, dialog, type BrowserWindow } from "electron";
import { realpath, stat, opendir, unlink } from "node:fs/promises";
import path from "node:path";
import type { Library } from "./library.cjs";
import { Organization, validateMediaRef } from "./organization.cjs";
import type {
  PlaylistEntry,
  PlaylistDetail,
  StorageUsage,
} from "./organization-types.cjs";
import type { YouTube } from "./youtube.cjs";
import { fallbackVideo } from "./youtube.cjs";
import type { SavedYouTube } from "./youtube-saved.cjs";
import type { MetadataExtractor } from "./metadata.cjs";
import { scanFolder } from "./folder-scan.cjs";

export function installOrganizationIpc(deps: {
  window: () => BrowserWindow | null;
  trusted: (event: Electron.IpcMainInvokeEvent) => void;
  library: Library;
  organization: Organization;
  youtube: YouTube;
  saved: SavedYouTube;
  extractor: MetadataExtractor;
  job: <T>(
    run: (progress: (completed: number, total: number) => void) => Promise<T>,
  ) => Promise<T>;
  dataDirectory: string;
}) {
  const { library, organization: org, saved, youtube } = deps;
  function handle(name: string, callback: (...args: unknown[]) => unknown) {
    ipcMain.handle(`organization:${name}`, (event, ...args) => {
      deps.trusted(event);
      return callback(...args);
    });
  }
  const resolve = (
    source: unknown,
    entryId: string,
    caption = "",
  ): PlaylistEntry => {
    const ref = validateMediaRef(source);
    if (ref.kind === "local") {
      const video = library.getVideo(ref.id);
      return {
        entryId,
        source: ref,
        title: video?.title || caption || "Unavailable local video",
        available: Boolean(video && !video.missing),
        local: video,
        youtube: null,
      };
    }
    const video =
      saved.get(ref.id) || youtube.known(ref.id) || fallbackVideo(ref.id);
    return {
      entryId,
      source: ref,
      title: video.title,
      available: true,
      local: null,
      youtube: { ...video, description: "" },
    };
  };
  async function confirm(title: string, detail: string) {
    const window = deps.window();
    if (!window) return false;
    return (
      (
        await dialog.showMessageBox(window, {
          type: "question",
          title,
          message: title,
          detail,
          buttons: ["Cancel", "Confirm"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
      ).response === 1
    );
  }
  handle("list", () => org.list());
  handle("create", (name: unknown) => org.create(name));
  handle("rename", (id: unknown, name: unknown) => org.rename(id, name));
  handle("delete", async (id: unknown) => {
    const playlist = org.get(id);
    if (
      !(await confirm(
        `Delete “${playlist.name}”?`,
        "Only the playlist is removed. Videos, saved links, and original files are kept.",
      ))
    )
      return false;
    org.remove(id);
    return true;
  });
  handle(
    "detail",
    (id: unknown): PlaylistDetail => ({
      playlist: org.get(id),
      items: org
        .members(id)
        .map((item) => resolve(item.source, item.entryId, item.caption)),
    }),
  );
  handle("add", async (id: unknown, value: unknown) => {
    org.get(id);
    const ref = validateMediaRef(value);
    let caption = "";
    if (ref.kind === "local") {
      const video = library.getVideo(ref.id);
      if (!video) throw new Error("Import this local video first");
      caption = video.title;
    } else if (!saved.get(ref.id))
      saved.save(ref.id, await youtube.detail(ref.id), false);
    return org.add(id, ref, caption);
  });
  handle("remove-entry", (id: unknown, entry: unknown) =>
    org.removeEntry(id, entry),
  );
  handle("reorder", (id: unknown, order: unknown) => org.reorder(id, order));
  handle("local-later", () =>
    org.localLater().map((id) => resolve({ kind: "local", id }, id)),
  );
  handle("is-local-later", (id: unknown) => org.isLocalLater(id));
  handle("local-later-count", () => org.localLaterCount());
  handle("save-local-later", (id: unknown, save: unknown) => {
    if (save && !library.getVideo(id as string))
      throw new Error("Video not found");
    org.saveLocalLater(id, save);
  });
  handle("settings", () => org.settings());
  handle("update-settings", (value: unknown) => org.updateSettings(value));
  handle("initialize-playback", (value: unknown) =>
    org.initializePlayback(value),
  );
  handle("update-playback", (value: unknown) => org.updatePlayback(value));
  handle("youtube-visits", (offset: unknown) => {
    const page = org.visits(offset);
    return {
      total: page.total,
      items: page.items.map((row) => ({
        video: saved.get(row.id) || fallbackVideo(row.id),
        openedAt: row.openedAt,
      })),
    };
  });
  handle("remove-visit", (id: unknown) => org.removeVisit(id));
  handle("remove-history", (id: unknown) => library.removeHistory(id));
  handle("clear-history", async () => {
    if (
      !(await confirm(
        "Clear history and resume positions?",
        "Local watch history, resume positions, and YouTube visit history will be removed. Playlists and original files are kept.",
      ))
    )
      return false;
    library.clearHistory();
    org.clearVisits();
    return true;
  });
  handle("directories", () => org.directories());
  handle("add-directory", async () => {
    const window = deps.window();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      title: "Choose a library directory",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folder = await realpath(result.filePaths[0]);
    if (!(await stat(folder)).isDirectory())
      throw new Error("Choose a directory");
    return org.addDirectory(folder);
  });
  handle("remove-directory", (id: unknown) => org.removeDirectory(id));
  handle("scan-directory", async (id: unknown) => {
    const folder = org.directory(id);
    return deps.job(async (progress) => {
      const scan = await scanFolder(folder, library.sources());
      let completed = 0;
      progress(0, scan.files.length);
      const result = await library.importFiles(
        scan.files,
        (source, id) =>
          deps.extractor.extract(source, library.thumbnailPath(id)),
        () => progress(++completed, scan.files.length),
      );
      await library.refresh();
      return { ...result, limited: scan.limited };
    });
  });
  handle("download-directory", () => org.downloadDirectory());
  handle("choose-download-directory", async () => {
    const window = deps.window();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      title: "Choose download location",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length)
      return org.downloadDirectory();
    const folder = await realpath(result.filePaths[0]);
    org.setDownloadDirectory(folder);
    return folder;
  });
  handle("storage", async (): Promise<StorageUsage> => {
    let thumbnailBytes = 0,
      thumbnailCount = 0,
      databaseBytes = 0;
    for await (const entry of await opendir(library.thumbnails)) {
      if (!entry.isFile() || !entry.name.endsWith(".png")) continue;
      const info = await stat(path.join(library.thumbnails, entry.name));
      thumbnailBytes += info.size;
      thumbnailCount++;
    }
    for (const file of [
      "library/library.sqlite",
      "organization.sqlite",
      "downloads.sqlite",
      "youtube/saved-links.sqlite",
    ])
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          databaseBytes += (
            await stat(path.join(deps.dataDirectory, file + suffix))
          ).size;
        } catch {}
      }
    return {
      thumbnailBytes,
      thumbnailCount,
      databaseBytes,
      indexedBytes: library.list({ search: "", sort: "newest", offset: 0 })
        .totalBytes,
    };
  });
  handle("clear-thumbnails", async () => {
    if (
      !(await confirm(
        "Clear cached thumbnails?",
        "Original videos and metadata stay in your library. Use Rebuild previews afterward to regenerate the cache.",
      ))
    )
      return null;
    return deps.job(async () => {
      let cleared = 0,
        failed = 0;
      for (const id of library.thumbnailIds()) {
        try {
          await unlink(library.thumbnailPath(id)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          library.clearThumbnail(id);
          cleared++;
        } catch {
          failed++;
        }
      }
      return { cleared, failed };
    });
  });
  handle("rebuild-thumbnails", async () =>
    deps.job(async (progress) => {
      const videos = library.previewCandidates();
      let completed = 0,
        failed = 0;
      progress(0, videos.length);
      for (const video of videos) {
        const metadata = await deps.extractor.extract(
          video.source,
          library.thumbnailPath(video.id),
        );
        library.setMetadata(video.id, metadata);
        if (!metadata.thumbnail) failed++;
        progress(++completed, videos.length);
      }
      return { processed: videos.length, failed };
    }),
  );
}
