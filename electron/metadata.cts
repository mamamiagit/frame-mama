import { BrowserWindow, session } from "electron";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { Metadata } from "./library.cjs";
import { serveMedia } from "./media.cjs";

// Serialized into a dedicated, sandboxed decoder renderer. No Node APIs or IPC.
async function decode(
  source: string,
): Promise<{
  duration: number | null;
  png: string | null;
  error: string | null;
}> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    let duration: number | null = null;
    let done = false;
    const finish = (png: string | null, error: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      video.remove();
      resolve({ duration, png, error });
    };
    const timer = setTimeout(
      () =>
        finish(
          null,
          "Metadata timed out. The file may be unavailable or use an unsupported codec.",
        ),
      15000,
    );
    video.onerror = () =>
      finish(null, "This video format or codec could not be read by the app.");
    video.onloadedmetadata = () => {
      duration =
        Number.isFinite(video.duration) && video.duration >= 0
          ? video.duration
          : null;
    };
    const snapshot = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 270;
        const context = canvas.getContext("2d");
        if (!context || !video.videoWidth) {
          finish(null, "No video track could be read.");
          return;
        }
        context.fillStyle = "#171c16";
        context.fillRect(0, 0, 480, 270);
        const ratio = Math.min(480 / video.videoWidth, 270 / video.videoHeight);
        const width = video.videoWidth * ratio,
          height = video.videoHeight * ratio;
        context.drawImage(
          video,
          (480 - width) / 2,
          (270 - height) / 2,
          width,
          height,
        );
        finish(canvas.toDataURL("image/png"), null);
      } catch {
        finish(null, "Thumbnail generation failed.");
      }
    };
    video.onloadeddata = () => {
      if (duration && duration > 0.2) {
        video.onseeked = snapshot;
        video.currentTime = Math.min(5, duration / 10);
      } else snapshot();
    };
    document.body.append(video);
    video.src = source;
  });
}

export class MetadataExtractor {
  private sources = new Map<string, string>();
  private window: BrowserWindow | null = null;
  private decoderSession = session.fromPartition("frame-metadata");
  constructor() {
    this.decoderSession.protocol.handle("frame-media", async (request) => {
      const url = new URL(request.url);
      const source =
        url.hostname === "import"
          ? this.sources.get(url.pathname.slice(1))
          : null;
      if (!source) return new Response(null, { status: 404 });
      try {
        return await serveMedia(source, request);
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    this.decoderSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
  }
  async extract(source: string, destination: string): Promise<Metadata> {
    const token = randomUUID();
    this.sources.set(token, source);
    try {
      if (!this.window || this.window.isDestroyed()) {
        this.window = new BrowserWindow({
          show: false,
          webPreferences: {
            session: this.decoderSession,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        });
        this.window.webContents.setWindowOpenHandler(() => ({
          action: "deny",
        }));
        await this.window.loadURL(
          "data:text/html," +
            encodeURIComponent(
              "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; media-src frame-media:; script-src 'none'\"><title>Frame metadata</title><body></body>",
            ),
        );
        this.window.webContents.on("will-navigate", (event) =>
          event.preventDefault(),
        );
      }
      const result = (await this.window.webContents.executeJavaScript(
        `(${decode.toString()})(${JSON.stringify(`frame-media://import/${token}`)})`,
      )) as Awaited<ReturnType<typeof decode>>;
      let thumbnail = false;
      if (
        result.png?.startsWith("data:image/png;base64,") &&
        result.png.length < 4_000_000
      ) {
        const bytes = Buffer.from(
          result.png.slice("data:image/png;base64,".length),
          "base64",
        );
        if (
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
          await writeFile(destination, bytes);
          thumbnail = true;
        }
      }
      return {
        duration:
          typeof result.duration === "number" &&
          Number.isFinite(result.duration) &&
          result.duration >= 0
            ? result.duration
            : null,
        thumbnail,
        error: result.error,
      };
    } catch {
      return {
        duration: null,
        thumbnail: false,
        error:
          "Metadata extraction failed. The original file has not been changed.",
      };
    } finally {
      this.sources.delete(token);
    }
  }
  dispose() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
