import { useEffect, useState } from "react";
import type { PlaybackPreferences } from "../electron/organization-types.cjs";
export const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export function readPlayerPreferences(): PlaybackPreferences {
  try {
    const p = JSON.parse(localStorage.getItem("frame-player") || "{}");
    return {
      volume:
        typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : 0.8,
      muted: p.muted === true,
      speed: speeds.includes(p.speed) ? p.speed : 1,
      autoplay: p.autoplay === true,
    };
  } catch {
    return { volume: 0.8, muted: false, speed: 1, autoplay: false };
  }
}
export function usePlayerPreferences() {
  const api = window.frame?.organization;
  const [prefs, setPrefs] = useState(readPlayerPreferences),
    [ready, setReady] = useState(!api),
    [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    api
      .initializePlayback(readPlayerPreferences())
      .then((value) => {
        if (!canceled) {
          setPrefs(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (!canceled) setError("Could not load playback defaults.");
      });
    return () => {
      canceled = true;
    };
  }, [api]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("frame-player", JSON.stringify(prefs));
    } catch {}
    if (api)
      void api
        .updatePlayback(prefs)
        .catch(() => setError("Could not save playback defaults."));
  }, [api, prefs, ready]);
  return { prefs, setPrefs, error, ready };
}
