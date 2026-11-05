export function toWebVtt(text: string): string {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (/^WEBVTT(?:[ \t]|\n|$)/.test(normalized)) return normalized + "\n";
  if (
    !/^\d{2,}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2,}:\d{2}:\d{2},\d{3}/m.test(
      normalized,
    )
  )
    throw new Error("Choose a UTF-8 WebVTT or SRT subtitle file.");
  return (
    "WEBVTT\n\n" +
    normalized.replace(
      /^(\d{2,}:\d{2}:\d{2}),(\d{3})(\s+-->\s+\d{2,}:\d{2}:\d{2}),(\d{3})/gm,
      "$1.$2$3.$4",
    ) +
    "\n"
  );
}
