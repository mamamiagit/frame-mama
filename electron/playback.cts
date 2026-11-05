import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { Library, isId } from "./library.cjs";
import { serveMedia } from "./media.cjs";
import type { PlaybackSession } from "./playback-types.cjs";

export class Playback {
  private active: { token: string; id: string } | null = null;
  private sequence = 0;
  constructor(
    private library: Library,
    private record = () => true,
  ) {}
  async open(id: unknown): Promise<PlaybackSession> {
    if (!isId(id)) throw new Error("Invalid video ID");
    const video = this.library.getVideo(id);
    const source = this.library.getSource(id);
    if (!video || !source)
      throw new Error("Video is no longer in your library.");
    const sequence = ++this.sequence;
    this.active = null;
    if (!(await stat(source)).isFile())
      throw new Error("Video file is unavailable.");
    if (sequence !== this.sequence)
      throw new Error("Playback request superseded.");
    const token = randomUUID();
    this.active = { token, id };
    return {
      token,
      url: `frame-playback://video/${token}`,
      video,
      progress: this.library.getProgress(id),
    };
  }
  requireToken(token: unknown): string {
    if (!isId(token) || token !== this.active?.token)
      throw new Error("Playback session expired.");
    return this.active.id;
  }
  save(token: unknown, progress: unknown) {
    const id = this.requireToken(token);
    this.library.saveProgress(id, progress, this.record());
  }
  close(token: unknown) {
    if (this.active?.token === token) {
      this.active = null;
      this.sequence++;
    }
  }
  async stream(request: Request) {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "video" || url.search || url.hash)
        return new Response(null, { status: 404 });
      const id = this.requireToken(url.pathname.slice(1));
      const source = this.library.getSource(id);
      if (!source) return new Response(null, { status: 404 });
      return await serveMedia(source, request);
    } catch {
      return new Response(null, { status: 404 });
    }
  }
}
