import type {
  YouTubeQuery,
  YouTubeResult,
  YouTubeVideo,
} from "./youtube-types.cjs";

export const isYouTubeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
export function videoId(value: unknown): string {
  if (isYouTubeId(value)) return value;
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Enter a valid YouTube video link.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid YouTube video link.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Use an HTTPS YouTube video link.");
  const host = url.hostname;
  let id: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be")
    id = url.pathname.slice(1);
  else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ].includes(host)
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else
      id =
        /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!isYouTubeId(id))
    throw new Error("Enter a video link from youtube.com or youtu.be.");
  return id;
}
export const watchUrl = (id: unknown) =>
  `https://www.youtube.com/watch?v=${videoId(id)}`;
// Keep official player links working without granting arbitrary external URL access.
export function officialPlayerLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) {
      if (url.pathname === '/') return 'https://www.youtube.com/';
      if (url.pathname === '/t/terms') return 'https://www.youtube.com/t/terms';
      return watchUrl(value);
    }
    if (url.hostname === 'policies.google.com' && ['/privacy', '/terms'].includes(url.pathname)) return url.origin + url.pathname;
    if (url.hostname === 'support.google.com' && /^\/youtube\/answer\/\d+$/.test(url.pathname)) return url.origin + url.pathname;
  } catch { /* Unrecognized external links stay blocked. */ }
  return null;
}
export function validateYouTubeQuery(value: unknown): YouTubeQuery {
  if (!value || typeof value !== "object")
    throw new Error("Invalid YouTube request.");
  const q = value as Record<string, unknown>;
  if (
    typeof q.query !== "string" ||
    q.query.length > 200 ||
    typeof q.region !== "string" ||
    !/^[A-Z]{2}$/.test(q.region) ||
    (q.pageToken !== undefined &&
      (typeof q.pageToken !== "string" ||
        q.pageToken.length > 512 ||
        !/^[A-Za-z0-9_+\/=.-]*$/.test(q.pageToken)))
  )
    throw new Error("Invalid YouTube request.");
  return {
    query: q.query.trim(),
    region: q.region,
    pageToken: q.pageToken as string | undefined,
  };
}
export function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match =
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return null;
  const seconds =
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0);
  return Number.isFinite(seconds) ? seconds : null;
}
export function fallbackVideo(id: string): YouTubeVideo {
  if (!isYouTubeId(id)) throw new Error("Invalid YouTube video");
  return {
    id,
    title: `Saved YouTube video · ${id}`,
    channel: "YouTube",
    description: "",
    thumbnail: null,
    duration: null,
    views: null,
    publishedAt: null,
    embeddable: null,
    live: false,
  };
}
function normalize(item: any): YouTubeVideo | null {
  if (!item || !isYouTubeId(item.id) || typeof item.snippet?.title !== "string")
    return null;
  return {
    id: item.id,
    title: item.snippet.title.slice(0, 500),
    channel:
      typeof item.snippet.channelTitle === "string"
        ? item.snippet.channelTitle.slice(0, 300)
        : "YouTube",
    description:
      typeof item.snippet.description === "string"
        ? item.snippet.description.slice(0, 5000)
        : "",
    thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    duration: durationSeconds(item.contentDetails?.duration),
    views: /^\d+$/.test(item.statistics?.viewCount)
      ? String(item.statistics.viewCount).slice(0, 30)
      : null,
    publishedAt:
      typeof item.snippet.publishedAt === "string" &&
      Number.isFinite(Date.parse(item.snippet.publishedAt))
        ? item.snippet.publishedAt
        : null,
    embeddable:
      typeof item.status?.embeddable === "boolean"
        ? item.status.embeddable
        : null,
    live: item.snippet.liveBroadcastContent === "live",
  };
}
class ApiFailure extends Error {
  constructor(
    readonly code:
      | "offline"
      | "quota"
      | "invalid_key"
      | "forbidden"
      | "api_error",
  ) {
    super(code);
  }
}
const messages = {
  offline:
    "YouTube could not be reached. Check your connection and try again. Your offline library is still available.",
  quota:
    "The API quota or request limit has been reached. Try later or use Open on YouTube.",
  invalid_key:
    "The API key was not accepted. Check that YouTube Data API v3 is enabled and the key restrictions allow it.",
  forbidden:
    "YouTube denied this API request. Check your API project, key restrictions, and region.",
  api_error: "YouTube could not return these videos. Please try again.",
};
export class YouTube {
  private cache = new Map<
    string,
    { time: number; result: Extract<YouTubeResult, { ok: true }> }
  >();
  private metadata = new Map<string, { time: number; video: YouTubeVideo }>();
  private inFlight = new Map<string, Promise<YouTubeResult>>();
  constructor(
    private getKey: () => string | null,
    private fetcher: (url: string, init: RequestInit) => Promise<Response>,
  ) {}
  clearCache() {
    this.cache.clear();
    this.metadata.clear();
  }
  known(id: string) {
    const item = this.metadata.get(id);
    return item && Date.now() - item.time < 300000 ? item.video : null;
  }
  private remember(items: YouTubeVideo[]) {
    if (this.metadata.size > 600) this.metadata.clear();
    for (const video of items)
      this.metadata.set(video.id, { time: Date.now(), video });
  }
  private async request(
    endpoint: "search" | "videos",
    parameters: Record<string, string>,
    key: string,
  ): Promise<any> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [name, value] of Object.entries(parameters))
      url.searchParams.set(name, value);
    let response: Response;
    try {
      response = await this.fetcher(url.href, {
        headers: { "X-Goog-Api-Key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      throw new ApiFailure("offline");
    }
    // Bound response memory and never return Google's raw errors (or request URLs/keys) to IPC.
    const reader = response.body?.getReader();
    if (!reader) throw new ApiFailure("api_error");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 2_000_000) {
          await reader.cancel();
          throw new ApiFailure("api_error");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure("offline");
    }
    let body: any;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiFailure("api_error");
    }
    if (!response.ok) {
      const reasons = Array.isArray(body?.error?.errors)
        ? body.error.errors.map((item: any) => item?.reason)
        : [];
      if (
        response.status === 429 ||
        reasons.some((reason: unknown) =>
          [
            "quotaExceeded",
            "dailyLimitExceeded",
            "rateLimitExceeded",
            "userRateLimitExceeded",
          ].includes(String(reason)),
        )
      )
        throw new ApiFailure("quota");
      if (
        response.status === 401 ||
        reasons.includes("keyInvalid") ||
        (Array.isArray(body?.error?.details) && body.error.details.some((detail:any)=>detail?.reason==='API_KEY_INVALID')) ||
        body?.error?.status === "UNAUTHENTICATED"
      )
        throw new ApiFailure("invalid_key");
      throw new ApiFailure(response.status === 403 ? "forbidden" : "api_error");
    }
    if (!Array.isArray(body.items)) throw new ApiFailure("api_error");
    return body;
  }
  async detail(id: string): Promise<YouTubeVideo | null> {
    if (!isYouTubeId(id)) throw new Error("Invalid video ID");
    const known = this.known(id);
    if (known) return known;
    const key = this.getKey();
    if (!key) return null;
    try {
      const body = await this.request(
        "videos",
        { part: "snippet,contentDetails,statistics,status", id },
        key,
      );
      const video = normalize(body.items[0]);
      if (video) this.remember([video]);
      return video;
    } catch {
      return null;
    }
  }
  async list(value: unknown): Promise<YouTubeResult> {
    const query = validateYouTubeQuery(value);
    const key = this.getKey();
    if (!key)
      return {
        ok: false,
        code: "missing_key",
        message:
          "Configure your YouTube Data API key in Settings to search and browse popular videos. You can still save video links without a key.",
      };
    const cacheKey = JSON.stringify(query),
      cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 300000) return cached.result;
    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;
    if (this.inFlight.size >= 3)
      return {
        ok: false,
        code: "quota",
        message:
          "A few requests are already running. Wait for them to finish before searching again.",
      };
    const operation = (async (): Promise<YouTubeResult> => {
      try {
        let body: any, items: YouTubeVideo[];
        const common = {
          maxResults: "24",
          regionCode: query.region,
          ...(query.pageToken ? { pageToken: query.pageToken } : {}),
        };
        if (query.query) {
          body = await this.request(
            "search",
            {
              ...common,
              part: "snippet",
              q: query.query,
              type: "video",
              videoEmbeddable: "true",
              videoSyndicated: "true",
              safeSearch: "moderate",
            },
            key,
          );
          const ids = body.items
            .map((item: any) => item?.id?.videoId)
            .filter(isYouTubeId)
            .slice(0, 24);
          const details = ids.length
            ? await this.request(
                "videos",
                {
                  part: "snippet,contentDetails,statistics,status",
                  id: ids.join(","),
                },
                key,
              )
            : { items: [] };
          const hydrated = new Map<string, YouTubeVideo>();
          for (const item of details.items.slice(0, 24)) {
            const video = normalize(item);
            if (video && video.embeddable !== false)
              hydrated.set(video.id, video);
          }
          items = ids
            .map((id: string) => hydrated.get(id))
            .filter((video: YouTubeVideo | undefined): video is YouTubeVideo =>
              Boolean(video),
            );
        } else {
          body = await this.request(
            "videos",
            {
              ...common,
              part: "snippet,contentDetails,statistics,status",
              chart: "mostPopular",
            },
            key,
          );
          items = body.items
            .slice(0, 24)
            .map(normalize)
            .filter((video: YouTubeVideo | null): video is YouTubeVideo =>
              Boolean(video && video.embeddable !== false),
            );
        }
        this.remember(items);
        const result: Extract<YouTubeResult, { ok: true }> = {
          ok: true,
          items,
          nextPageToken:
            typeof body.nextPageToken === "string" &&
            body.nextPageToken.length <= 512
              ? body.nextPageToken
              : null,
        };
        if (this.cache.size >= 30) this.cache.clear();
        this.cache.set(cacheKey, { time: Date.now(), result });
        return result;
      } catch (error) {
        const code = error instanceof ApiFailure ? error.code : "api_error";
        return { ok: false, code, message: messages[code] };
      }
    })();
    this.inFlight.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }
}
