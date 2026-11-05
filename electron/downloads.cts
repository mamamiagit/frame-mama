import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { open, realpath, stat, unlink, link } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { downloadUrl, openDownload } from "./download-network.cjs";
import { isId } from "./library.cjs";
import type { DownloadItem, DownloadState } from "./download-types.cjs";

type Job = DownloadItem & { secret: string; folder: string; extension: string; downloaded: boolean };
type Dependencies = {
  encrypt: (url: string) => string;
  decrypt: (secret: string) => string;
  importFile: (file: string, signal: AbortSignal) => Promise<void>;
  open?: typeof openDownload;
};
const MAX_BYTES = 10 * 1024 ** 3;
const formats: Record<string, string> = {
  "video/mp4": "mp4", "video/x-m4v": "m4v", "video/webm": "webm",
  "video/x-matroska": "mkv", "video/quicktime": "mov", "video/x-msvideo": "avi",
  "video/ogg": "ogv", "application/ogg": "ogg",
};
class DownloadProblem extends Error {}
function mediaHeader(bytes: Buffer, extension: string) {
  if (["mp4", "m4v", "mov"].includes(extension)) return bytes.subarray(4, 8).toString() === "ftyp";
  if (["webm", "mkv"].includes(extension)) return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (["ogg", "ogv"].includes(extension)) return bytes.subarray(0, 4).toString() === "OggS";
  return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "AVI ";
}

export class Downloads {
  private db: DatabaseSync;
  private jobs: Job[];
  private active: { id: string; controller: AbortController; promise: Promise<void> } | null = null;
  private stopped = true;
  private removing = new Set<string>();
  constructor(file: string, private deps: Dependencies) {
    this.db = new DatabaseSync(file);
    if (Number(this.db.prepare("PRAGMA user_version").get()!.user_version) > 1) {
      this.db.close();
      throw new Error("This download queue requires a newer version of Frame.");
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      PRAGMA user_version=1;`);
    this.jobs = this.db.prepare("SELECT payload FROM downloads ORDER BY rowid").all().map(row => JSON.parse(String(row.payload)) as Job);
    for (const job of this.jobs) {
      if (["downloading", "importing"].includes(job.state)) {
        job.state = "failed";
        job.error = "Interrupted when Frame closed. Retry to restart or finish library import.";
        this.save(job);
      }
    }
  }
  list(): DownloadItem[] {
    return this.jobs.map(({ id, name, host, state, received, total, error, createdAt }) =>
      ({ id, name, host, state, received, total, error, createdAt }));
  }
  private save(job: Job) {
    this.db.prepare("INSERT INTO downloads(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(job.id, JSON.stringify(job));
  }
  private get(id: unknown) {
    if (!isId(id)) throw new Error("Invalid download ID.");
    const job = this.jobs.find(item => item.id === id);
    if (!job) throw new Error("Download not found.");
    if (this.removing.has(id)) throw new Error("This queue entry is being removed.");
    return job;
  }
  async add(value: unknown, directory: string | null) {
    if (!value || typeof value !== "object" || (value as { authorized?: unknown }).authorized !== true)
      throw new Error("Confirm you have permission to download this media.");
    const url = downloadUrl((value as { url?: unknown }).url);
    // Encrypt before the first asynchronous operation; no plaintext links on disk.
    const secret = this.deps.encrypt(url.href);
    if (!directory) throw new Error("Choose a download folder first.");
    const folder = await realpath(directory);
    if (!(await stat(folder)).isDirectory()) throw new Error("The download folder is unavailable.");
    if (this.jobs.length >= 200) throw new Error("The queue holds up to 200 entries. Remove finished entries first.");
    let name = "Video";
    try { name = decodeURIComponent(path.posix.basename(url.pathname)).replace(/[\x00-\x1f]/g, "").slice(0, 150) || name; } catch {}
    const job: Job = { id: randomUUID(), name, host: url.hostname, secret, folder, extension: "", downloaded: false,
      state: "queued", received: 0, total: null, error: null, createdAt: Date.now() };
    this.save(job);
    this.jobs.push(job);
    this.pump();
  }
  async cancel(id: unknown) {
    const job = this.get(id);
    if (job.state === "importing") throw new Error("Wait for library import to finish.");
    if (job.state === "downloading" && this.active?.id === job.id) {
      this.active.controller.abort();
      await this.active.promise;
    } else if (job.state === "queued") {
      job.state = "canceled";
      this.save(job);
    }
  }
  retry(id: unknown) {
    const job = this.get(id);
    if (!["failed", "canceled"].includes(job.state)) throw new Error("Only failed or canceled downloads can be retried.");
    job.state = "queued";
    job.error = null;
    this.save(job);
    this.pump();
  }
  async remove(id: unknown) {
    const job = this.get(id);
    if (["queued", "downloading", "importing"].includes(job.state)) throw new Error("Cancel this download first.");
    this.removing.add(job.id);
    try {
      await unlink(path.join(job.folder, `.frame-${job.id}.part`)).catch(error => { if (error.code !== "ENOENT") throw error; });
      this.db.prepare("DELETE FROM downloads WHERE id=?").run(job.id);
      this.jobs = this.jobs.filter(item => item !== job);
    } finally { this.removing.delete(job.id); }
    // Completed files and library entries are always preserved.
  }
  start() { this.stopped = false; this.pump(); }
  private pump() {
    if (this.stopped || this.active) return;
    const job = this.jobs.find(item => item.state === "queued");
    if (!job) return;
    const controller = new AbortController();
    const promise = this.run(job, controller.signal).catch(() => {
      // A full disk can prevent even the failure checkpoint. Keep the app and
      // following jobs alive; the last durable checkpoint remains recoverable.
      job.state = "failed";
      job.error = "Could not save the download queue. Check free disk space and app-data permissions, then retry.";
    }).finally(() => {
      this.active = null;
      this.pump();
    });
    this.active = { id: job.id, controller, promise };
  }
  private async run(job: Job, signal: AbortSignal) {
    const partial = path.join(job.folder, `.frame-${job.id}.part`);
    let outcome: DownloadState = "failed";
    let errorMessage: string | null = null;
    try {
      job.state = "downloading";
      this.save(job);
      if (!job.downloaded && job.extension) {
        // Recover an exclusive publication interrupted between link() and its
        // SQLite checkpoint. Matching inodes prove the final file is our staging file.
        const staged = await stat(partial).catch(() => null);
        const published = await stat(path.join(job.folder, `${job.id}.${job.extension}`)).catch(() => null);
        if (staged && published && staged.size > 0 && staged.ino === published.ino && staged.dev === published.dev) {
          job.downloaded = true;
          this.save(job);
        }
      }
      // Only this queue entry's UUID-named staging file is ever deleted.
      await unlink(partial).catch(error => { if (error.code !== "ENOENT") throw error; });
      if (!job.downloaded) {
        job.received = 0;
        job.total = null;
        const timeout = setTimeout(() => signal.aborted || this.active?.controller.abort(new DownloadProblem("The transfer exceeded the two-hour limit. Retry to start again.")), 2 * 60 * 60 * 1000);
        try {
          const response = await (this.deps.open || openDownload)(this.deps.decrypt(job.secret), signal);
          let extension: string;
          try {
            const mime = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
            extension = Object.hasOwn(formats, mime) ? formats[mime] : "";
            if (!extension && mime === "application/octet-stream") {
              const suffix = path.posix.extname(downloadUrl(this.deps.decrypt(job.secret)).pathname).slice(1).toLowerCase();
              if (Object.values(formats).includes(suffix)) extension = suffix;
            }
            if (!extension || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity"))
              throw new DownloadProblem("The server did not return a supported video file. Use a direct media link.");
            const length = response.headers["content-length"];
            if (length !== undefined) {
              if (!/^\d+$/.test(String(length)) || !Number.isSafeInteger(Number(length)) || Number(length) <= 0 || Number(length) > MAX_BYTES)
                throw new DownloadProblem("The file is empty or exceeds the 10 GiB download limit.");
              job.total = Number(length);
            }
            job.extension = extension;
            this.save(job);
            const file = await open(partial, "wx");
            let head = Buffer.alloc(0), lastSave = 0;
            const monitor = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
              job.received += chunk.length;
              if (head.length < 32) head = Buffer.concat([head, chunk.subarray(0, 32 - head.length)]);
              if (job.received > MAX_BYTES || (job.total !== null && job.received > job.total))
                return callback(new DownloadProblem("The transfer exceeded its expected size or the 10 GiB limit."));
              if (Date.now() - lastSave > 500) {
                try { this.save(job); lastSave = Date.now(); }
                catch (error) { return callback(error as Error); }
              }
              callback(null, chunk);
            } });
            try {
              await pipeline(response, monitor, file.createWriteStream(), { signal });
            } finally { await file.close().catch(() => {}); }
            if (!job.received || (job.total !== null && job.total !== job.received) || !mediaHeader(head, extension))
              throw new DownloadProblem("The transfer was incomplete or did not contain the expected video format.");
          } finally { response.destroy(); }
          signal.throwIfAborted();
          // Hard-link publication is exclusive: an existing file is never overwritten.
          await link(partial, path.join(job.folder, `${job.id}.${job.extension}`)).catch(error => {
            if (["ENOTSUP", "EOPNOTSUPP", "EPERM"].includes(error.code))
              throw new DownloadProblem("This folder could not publish the download. Use an NTFS folder or another drive that supports hard links, and check write permissions.");
            throw error;
          });
          job.downloaded = true;
          this.save(job);
          await unlink(partial);
        } finally { clearTimeout(timeout); }
      }
      signal.throwIfAborted();
      job.state = "importing";
      this.save(job);
      await this.deps.importFile(path.join(job.folder, `${job.id}.${job.extension}`), signal);
      outcome = "completed";
    } catch (error) {
      const timedOut = signal.reason instanceof DownloadProblem;
      outcome = signal.aborted && !timedOut ? "canceled" : "failed";
      errorMessage = timedOut ? signal.reason.message : signal.aborted ? "Canceled. Retry starts the transfer again." :
        error instanceof DownloadProblem ? error.message :
        job.downloaded ? "The file was saved, but library import failed. Retry to import the saved file." :
        "Download failed. Check the link, internet connection, folder permissions, and free disk space; then retry. Links must resolve to public HTTPS video files.";
    } finally {
      await unlink(partial).catch(() => {});
      job.state = outcome;
      job.error = errorMessage;
      this.save(job);
    }
  }
  async close() {
    this.stopped = true;
    if (this.active) { this.active.controller.abort(); await this.active.promise; }
    this.db.close();
  }
}
