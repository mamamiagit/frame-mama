import { open, writeFile, rename, unlink } from "node:fs/promises";
import type { YouTubeStatus } from "./youtube-types.cjs";
interface Encryption {
  available: () => boolean;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}
async function boundedRead(file: string, limit: number) {
  const handle = await open(file, "r");
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Not a file");
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > limit) throw new Error("File too large");
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}
function validateKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 4096 || /[\r\n\x00-\x1f\x7f]/.test(key))
    throw new Error("Use a file containing only the API key on one line.");
  return key;
}
export class YouTubeCredentials {
  private stored: string | null = null;
  constructor(
    private file: string,
    private encryption: Encryption,
    private environment = () => process.env.FRAME_YOUTUBE_API_KEY,
  ) {}
  async load() {
    if (!this.encryption.available()) return;
    try {
      this.stored = validateKey(
        this.encryption.decrypt(await boundedRead(this.file, 16384)),
      );
    } catch {
      this.stored = null;
    }
  }
  private env() {
    try {
      return this.environment() ? validateKey(this.environment()!) : null;
    } catch {
      return null;
    }
  }
  get() {
    return this.env() || this.stored;
  }
  status(): YouTubeStatus {
    return {
      configured: Boolean(this.get()),
      source: this.env()
        ? "environment"
        : this.stored
          ? "encrypted-file"
          : "none",
      secureStorage: this.encryption.available(),
    };
  }
  async importFile(file: string) {
    if (this.env())
      throw new Error("An environment key is already configured.");
    if (!this.encryption.available())
      throw new Error("Secure operating-system storage is unavailable.");
    const key = validateKey(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await boundedRead(file, 8192),
      ),
    );
    const encrypted = this.encryption.encrypt(key);
    try {
      await writeFile(`${this.file}.tmp`, encrypted, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
      this.stored = key;
    } catch {
      await unlink(`${this.file}.tmp`).catch(() => {});
      throw new Error("Could not save the encrypted key.");
    }
    return this.status();
  }
  async clear() {
    await unlink(this.file).catch((error) => {
      if (error.code !== "ENOENT")
        throw new Error("Could not remove the saved key.");
    });
    this.stored = null;
    return this.status();
  }
}
