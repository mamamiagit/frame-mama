import { opendir } from "node:fs/promises";
import path from "node:path";
import { extensions } from "./library.cjs";
export async function scanFolder(root: string, known: Set<string>) {
  const files: string[] = [];
  let visited = 0,
    limited = false;
  async function walk(folder: string, depth: number) {
    if (depth > 10) {
      limited = true;
      return;
    }
    try {
      for await (const entry of await opendir(folder)) {
        if (++visited > 10000 || files.length >= 100) {
          limited = true;
          return;
        }
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) await walk(file, depth + 1);
        else if (
          entry.isFile() &&
          extensions.includes(path.extname(file).slice(1).toLowerCase()) &&
          !known.has(process.platform === "win32" ? file.toLowerCase() : file)
        )
          files.push(file);
        if (visited > 10000 || files.length >= 100) {
          limited = true;
          return;
        }
      }
    } catch {
      limited = true;
    }
  }
  await walk(root, 0);
  return { files, limited };
}
