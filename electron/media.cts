import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

// Only called with a path chosen through the native import dialog, never a renderer path.
export async function serveMedia(
  source: string,
  request: Request,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405 });
  const info = await stat(source);
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/octet-stream",
  };
  let start = 0,
    end = info.size - 1,
    status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    start = match[1]
      ? Number(match[1])
      : Math.max(0, info.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size ||
      start < 0
    )
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = String(Math.max(0, end - start + 1));
  const body =
    request.method === "HEAD" || info.size === 0
      ? null
      : (Readable.toWeb(
          createReadStream(source, { start, end }),
        ) as ReadableStream<Uint8Array>);
  return new Response(body, { status, headers });
}
