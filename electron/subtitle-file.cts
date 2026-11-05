import { open } from "node:fs/promises";
import path from "node:path";
import { toWebVtt } from "./subtitles.cjs";
export async function readSubtitle(file: string) {
  if (![".srt", ".vtt"].includes(path.extname(file).toLowerCase()))
    throw new Error("Unsupported subtitle format");
  const handle = await open(file, "r");
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Not a subtitle file");
    const limit = 2 * 1024 * 1024;
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > limit) throw new Error("Subtitle file is larger than 2 MB");
    return {
      name: path.basename(file),
      text: toWebVtt(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length),
        ),
      ),
    };
  } finally {
    await handle.close();
  }
}
