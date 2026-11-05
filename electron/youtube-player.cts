import { BrowserWindow, WebContentsView, shell, type Session } from "electron";
import { randomUUID } from "node:crypto";
import { videoId, officialPlayerLink } from "./youtube.cjs";
import type { EmbedBounds } from "./youtube-types.cjs";

// Explicit native-client identity for YouTube's embedded-player Referer requirement.
// This is Frame's configured application ID, not another site's identity.
export const playerReferrer = "https://app.frame.offline/";
export function embedUrl(id: unknown) {
  return `https://www.youtube-nocookie.com/embed/${videoId(id)}?playsinline=1&autoplay=0&rel=0`;
}
export function validateEmbedBounds(value: unknown): EmbedBounds {
  if (!value || typeof value !== "object")
    throw new Error("Invalid player bounds");
  const b = value as Record<string, unknown>;
  for (const name of ["x", "y", "width", "height"])
    if (
      typeof b[name] !== "number" ||
      !Number.isFinite(b[name]) ||
      Math.abs(b[name] as number) > 20000
    )
      throw new Error("Invalid player bounds");
  if (
    Number(b.width) < 0 ||
    Number(b.height) < 0 ||
    typeof b.visible !== "boolean"
  )
    throw new Error("Invalid player bounds");
  return b as unknown as EmbedBounds;
}
export class YouTubePlayer {
  private active: {
    token: string;
    view: WebContentsView;
    bounds: EmbedBounds | null;
    fullscreen: boolean;
    failed: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  constructor(
    private window: () => BrowserWindow | null,
    private session: Session,
  ) {
    session.setPermissionRequestHandler((contents, permission, callback) =>
      callback(
        permission === "fullscreen" &&
          contents === this.active?.view.webContents,
      ),
    );
    session.setPermissionCheckHandler(
      (contents, permission) =>
        permission === "fullscreen" &&
        contents === this.active?.view.webContents,
    );
  }
  private state(token: string, error: string | null) {
    const window = this.window();
    if (window && !window.isDestroyed())
      window.webContents.send("youtube:player-state", { token, error });
  }
  open(value: unknown) {
    const url = embedUrl(value),
      window = this.window();
    if (!window) throw new Error("App window unavailable");
    this.dispose();
    const token = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.active = {
      token,
      view,
      bounds: null,
      fullscreen: false,
      failed: false,
      timer: null,
    };
    window.contentView.addChildView(view);
    view.setVisible(false);
    const openOfficial = (value: string) => {
      const destination = officialPlayerLink(value);
      if (destination) void shell.openExternal(destination).catch(() => {});
    };
    view.webContents.setWindowOpenHandler(({ url }) => {
      openOfficial(url);
      return { action: 'deny' };
    });
    const allow = (destination: string) => {
      try {
        const target = new URL(destination);
        return (
          target.origin === "https://www.youtube-nocookie.com" &&
          target.pathname === new URL(url).pathname
        );
      } catch {
        return false;
      }
    };
    view.webContents.on("will-navigate", (event, destination) => {
      if (!allow(destination)) { event.preventDefault(); openOfficial(destination); }
    });
    view.webContents.on(
      "will-redirect",
      (event, destination, _inPlace, mainFrame) => {
        if (mainFrame && !allow(destination)) event.preventDefault();
      },
    );
    view.webContents.on("enter-html-full-screen", () => {
      if (this.active?.token === token) {
        this.active.fullscreen = true;
        const { width, height } = window.getContentBounds();
        view.setBounds({ x: 0, y: 0, width, height });
      }
    });
    view.webContents.on("leave-html-full-screen", () => {
      if (this.active?.token === token) {
        this.active.fullscreen = false;
        if (this.active.bounds) this.setBounds(token, this.active.bounds);
      }
    });
    view.webContents.on("render-process-gone", () => {
      if (this.active?.token === token) {
        this.active.failed = true;
        view.setVisible(false);
        this.state(
          token,
          "YouTube’s player stopped. Reload it or open this video on YouTube.",
        );
      }
    });
    this.active.timer = setTimeout(() => {
      if (this.active?.token === token) {
        this.active.failed = true;
        view.setVisible(false);
        view.webContents.stop();
        this.state(
          token,
          "YouTube’s player timed out. Check your connection or open on YouTube.",
        );
      }
    }, 20000);
    void view.webContents
      .loadURL(url, {
        httpReferrer: {
          url: playerReferrer,
          policy: "strict-origin-when-cross-origin",
        },
      })
      .then(() => {
        if (this.active?.token === token) {
          if (this.active.timer) clearTimeout(this.active.timer);
          if (!this.active.failed) this.state(token, null);
        }
      })
      .catch(() => {
        if (this.active?.token === token) {
          if (this.active.timer) clearTimeout(this.active.timer);
          this.active.failed = true;
          view.setVisible(false);
          this.state(
            token,
            "YouTube’s player could not connect. Check your connection or open the video on YouTube.",
          );
        }
      });
    return token;
  }
  setBounds(token: unknown, value: unknown) {
    const bounds = validateEmbedBounds(value),
      active = this.active,
      window = this.window();
    if (!active || token !== active.token || !window)
      throw new Error("Player session expired");
    active.bounds = bounds;
    if (active.fullscreen) {
      const { width, height } = window.getContentBounds();
      active.view.setBounds({ x: 0, y: 0, width, height });
      return;
    }
    const factor = window.webContents.getZoomFactor(),
      viewport = window.getContentBounds();
    const rect = {
      x: Math.round(bounds.x * factor),
      y: Math.round(bounds.y * factor),
      width: Math.round(bounds.width * factor),
      height: Math.round(bounds.height * factor),
    };
    const visible =
      !active.failed &&
      bounds.visible &&
      rect.width >= 200 &&
      rect.height >= 200 &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= viewport.width + 1 &&
      rect.y + rect.height <= viewport.height + 1;
    if (visible) active.view.setBounds(rect);
    active.view.setVisible(visible);
  }
  close(token: unknown) {
    if (this.active?.token === token) this.dispose();
  }
  dispose() {
    const active = this.active;
    this.active = null;
    if (!active) return;
    if (active.timer) clearTimeout(active.timer);
    const window = this.window();
    if (window && !window.isDestroyed())
      window.contentView.removeChildView(active.view);
    if (!active.view.webContents.isDestroyed()) active.view.webContents.close();
  }
}
