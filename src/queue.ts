import type { PlaylistEntry } from "../electron/organization-types.cjs";
export type RepeatMode = "none" | "all" | "one";
export function orderQueue(
  items: PlaylistEntry[],
  shuffle: boolean,
  current?: string,
  random = () => Math.random(),
): PlaylistEntry[] {
  if (!shuffle) return [...items];
  const rest = items.filter((item) => item.entryId !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const selected = items.find((item) => item.entryId === current);
  return selected ? [selected, ...rest] : rest;
}
export function adjacentItem(
  items: PlaylistEntry[],
  current: string,
  direction: 1 | -1,
  repeat: RepeatMode,
  automatic = false,
): PlaylistEntry | null {
  const playable = items.filter((item) => item.available),
    index = playable.findIndex((item) => item.entryId === current);
  if (!playable.length) return null;
  if (automatic && repeat === "one" && index >= 0) return playable[index];
  const next = index + direction;
  if (next >= 0 && next < playable.length) return playable[next];
  return repeat === "all"
    ? playable[(next + playable.length) % playable.length]
    : null;
}
