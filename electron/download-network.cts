import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";

const blocked = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) blocked.addSubnet(ip, bits, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");
export function publicAddress(ip: string) {
  const family = isIP(ip);
  return family === 4 ? !blocked.check(ip, "ipv4") :
    family === 6 && globalV6.check(ip, "ipv6") && !blocked.check(ip, "ipv6");
}
export function downloadUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096 || /[\s\x00-\x1f]/.test(value))
    throw new Error("Enter a public HTTPS video-file URL (up to 4096 characters).");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS video-file URL."); }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      (url.port && url.port !== "443") || (!isIP(host) && !host.includes(".")) ||
      (isIP(host) && !publicAddress(host)) ||
      ["youtube.com", "youtu.be", "youtube-nocookie.com", "googlevideo.com", "ytimg.com", "localhost", "local", "internal"].some(domain => host === domain || host.endsWith(`.${domain}`)))
    throw new Error("Use a public HTTPS direct-media link. Local addresses and YouTube links are not supported.");
  return url;
}

// Resolve each hop, reject private destinations, and pin the connection to the
// validated address. A dedicated HTTPS request sends no cookies or credentials.
export async function openDownload(value: string, signal: AbortSignal): Promise<IncomingMessage> {
  let url = downloadUrl(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] :
      await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
        const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        void lookup(host, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(item => !publicAddress(item.address)))
      throw new Error("The download destination is not a public internet address.");
    const address = addresses[0];
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(url, {
        method: "GET", signal, agent: false,
        headers: { "Accept": "video/*,application/octet-stream", "Accept-Encoding": "identity" },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      }, resolve);
      req.setTimeout(30_000, () => req.destroy(new Error("Download connection timed out.")));
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
      response.destroy();
      if (!response.headers.location || redirects === 5) throw new Error("Too many redirects or missing redirect destination.");
      url = downloadUrl(new URL(response.headers.location, url).href);
      continue;
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw new Error(`The server returned HTTP ${response.statusCode || 0}. Obtain a fresh direct link and try again.`);
    }
    return response;
  }
  throw new Error("Too many redirects.");
}
