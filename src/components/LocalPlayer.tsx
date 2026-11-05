import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Maximize,
  Minimize,
  Monitor,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
  FileVideo,
  AlertCircle,
} from "lucide-react";
import type { LocalVideo } from "../../electron/library-types.cjs";
import type { PlaybackSession } from "../../electron/playback-types.cjs";
import { formatDuration, formatSize } from "./OfflineLibrary";
import "./LocalPlayer.css";
import useFullscreenControls from "./useFullscreenControls";

const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
function preferences() {
  try {
    const p = JSON.parse(localStorage.getItem("frame-player") || "{}");
    return {
      volume:
        typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : 0.8,
      muted: p.muted === true,
      speed: speeds.includes(p.speed) ? (p.speed as number) : 1,
      autoplay: p.autoplay === true,
    };
  } catch {
    return { volume: 0.8, muted: false, speed: 1, autoplay: false };
  }
}

export default function LocalPlayer({
  video,
  queue,
  onSelect,
  onBack,
}: {
  video: LocalVideo;
  queue: LocalVideo[];
  onSelect: (video: LocalVideo) => void;
  onBack: () => void;
}) {
  const api = window.frame?.playback;
  const media = useRef<HTMLVideoElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<PlaybackSession | null>(null);
  const started = useRef(false);
  const alive = useRef(false);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [theater, setTheater] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const controlsVisible = useFullscreenControls(
    container,
    fullscreen,
    paused,
    ready,
    error,
  );
  const [attempt, setAttempt] = useState(0);
  const [prefs, setPrefs] = useState(preferences);
  const [subtitle, setSubtitle] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const cuePositions = useRef(
    new WeakMap<VTTCue, { line: number | "auto"; snap: boolean }>(),
  );
  const positionCaptions = useCallback(
    (track: TextTrack) => {
      for (const cue of Array.from(track.cues || [])) {
        if (!(cue instanceof VTTCue)) continue;
        let original = cuePositions.current.get(cue);
        if (!original) {
          original = { line: cue.line, snap: cue.snapToLines };
          cuePositions.current.set(cue, original);
        }
        if (original.line !== "auto") continue;
        cue.snapToLines = fullscreen && controlsVisible ? false : original.snap;
        cue.line = fullscreen && controlsVisible ? 82 : original.line;
      }
    },
    [fullscreen, controlsVisible],
  );
  useEffect(() => {
    if (media.current)
      for (const track of Array.from(media.current.textTracks))
        positionCaptions(track);
  }, [positionCaptions]);
  const [cc, setCc] = useState(true);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const index = queue.findIndex((item) => item.id === video.id);
  const next =
    index >= 0
      ? queue.slice(index + 1).find((item) => !item.missing)
      : undefined;

  const save = useCallback(
    async (element = media.current) => {
      const current = active.current;
      if (
        !api ||
        !current ||
        !element ||
        !started.current ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0
      )
        return;
      try {
        await api.save(current.token, {
          position: Math.max(
            0,
            Math.min(element.currentTime, element.duration),
          ),
          duration: element.duration,
          completed: element.ended,
        });
      } catch {
        if (alive.current)
          setHint("Playback continues, but progress could not be saved.");
      }
    },
    [api],
  );

  useEffect(() => {
    let canceled = false;
    alive.current = true;
    started.current = false;
    active.current = null;
    setSession(null);
    setReady(false);
    setError("");
    setHint("");
    setPosition(0);
    setDuration(0);
    const element = media.current;
    if (!api) {
      setError("Open Frame’s desktop app to play imported videos.");
      return;
    }
    api
      .open(video.id)
      .then((result) => {
        if (canceled) {
          void api.close(result.token).catch(() => {});
          return;
        }
        active.current = result;
        setSession(result);
      })
      .catch(() => {
        if (!canceled)
          setError(
            "This file is unavailable. Reconnect its drive or restore its original location, then try again.",
          );
      });
    const timer = setInterval(() => {
      if (element && !element.paused) void save(element);
    }, 2000);
    const leave = () => {
      void save(element);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      canceled = true;
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      const current = active.current;
      void save(element).finally(() => {
        if (current) void api.close(current.token).catch(() => {});
      });
      element?.pause();
    };
  }, [video.id, attempt, api, save]);
  useEffect(() => {
    const element = media.current;
    if (element) {
      element.volume = prefs.volume;
      element.muted = prefs.muted;
      element.playbackRate = prefs.speed;
    }
    try {
      localStorage.setItem("frame-player", JSON.stringify(prefs));
    } catch {
      /* Preferences still work without browser storage. */
    }
  }, [prefs, session]);
  useEffect(
    () => () => {
      if (subtitle) URL.revokeObjectURL(subtitle.url);
    },
    [subtitle],
  );
  useEffect(() => {
    if (media.current)
      for (const track of Array.from(media.current.textTracks))
        track.mode = cc ? "showing" : "disabled";
  }, [cc, subtitle]);
  useEffect(() => {
    const listener = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);

  const togglePlay = useCallback(() => {
    const element = media.current;
    if (!element || !ready || error) return;
    if (element.paused)
      void element
        .play()
        .catch(() => setHint("Press play again to start this video."));
    else element.pause();
  }, [ready, error]);
  const seek = useCallback(
    (time: number) => {
      const element = media.current;
      if (!element || !ready || !Number.isFinite(element.duration)) return;
      element.currentTime = Math.max(0, Math.min(time, element.duration));
      setPosition(element.currentTime);
    },
    [ready],
  );
  const toggleFullscreen = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : container.current?.requestFullscreen();
    void request?.catch(() =>
      setHint("Fullscreen is unavailable. Try theater mode instead."),
    );
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]') ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'input,select,textarea,button,a,[contenteditable="true"]',
          ))
      )
        return;
      const key = event.key.toLowerCase();
      if (
        ![
          " ",
          "k",
          "j",
          "l",
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          "m",
          "f",
          "t",
          "c",
        ].includes(key)
      )
        return;
      event.preventDefault();
      if (key === " " || key === "k") togglePlay();
      if (key === "j" || key === "arrowleft")
        seek((media.current?.currentTime || 0) - (key === "j" ? 10 : 5));
      if (key === "l" || key === "arrowright")
        seek((media.current?.currentTime || 0) + (key === "l" ? 10 : 5));
      if (key === "m") setPrefs((p) => ({ ...p, muted: !p.muted }));
      if (key === "arrowup" || key === "arrowdown")
        setPrefs((p) => ({
          ...p,
          muted: false,
          volume: Math.max(
            0,
            Math.min(1, p.volume + (key === "arrowup" ? 0.05 : -0.05)),
          ),
        }));
      if (key === "f") toggleFullscreen();
      if (key === "t") setTheater((value) => !value);
      if (key === "c") setCc((value) => !value);
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [togglePlay, seek, toggleFullscreen]);

  async function loadSubtitles() {
    if (!api || !session || subtitleBusy) return;
    setSubtitleBusy(true);
    setHint("");
    try {
      const result = await api.subtitles(session.token);
      if (result && alive.current) {
        setSubtitle({
          name: result.name,
          url: URL.createObjectURL(
            new Blob([result.text], { type: "text/vtt" }),
          ),
        });
        setCc(true);
      }
    } catch {
      if (alive.current)
        setHint(
          "Could not load subtitles. Choose a UTF-8 .vtt or .srt file smaller than 2 MB.",
        );
    } finally {
      if (alive.current) setSubtitleBusy(false);
    }
  }

  return (
    <section className={`local-watch ${theater ? "theater-mode" : ""}`}>
      <button className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to collection
      </button>
      <div className="local-watch-layout">
        <section className="local-watch-main">
          <div
            className={`player-shell ${controlsVisible ? "controls-visible" : "controls-hidden"}`}
            ref={container}
            tabIndex={0}
            aria-label="Local video player"
          >
            <video
              ref={media}
              src={session?.url}
              preload="metadata"
              playsInline
              aria-label={video.title}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onLoadedMetadata={() => {
                const element = media.current;
                if (!element) return;
                const length = Number.isFinite(element.duration)
                  ? element.duration
                  : 0;
                setDuration(length);
                setReady(length > 0);
                const resume = active.current?.progress;
                if (
                  resume &&
                  !resume.completed &&
                  resume.position < length - 0.15
                ) {
                  element.currentTime = resume.position;
                  setPosition(resume.position);
                  setHint(`Resumed at ${formatDuration(resume.position)}.`);
                }
                void element
                  .play()
                  .catch(() => setHint("Press play to begin."));
              }}
              onPlaying={() => {
                started.current = true;
                setPaused(false);
                void save();
              }}
              onPause={() => {
                setPaused(true);
                void save();
              }}
              onTimeUpdate={() => setPosition(media.current?.currentTime || 0)}
              onSeeked={() => {
                setPosition(media.current?.currentTime || 0);
                void save();
              }}
              onEnded={() => {
                setPaused(true);
                void save().then(() => {
                  if (alive.current && prefs.autoplay && next) onSelect(next);
                });
              }}
              onError={() => {
                if (session) {
                  setError(
                    "This video could not be played. Its codec may be unsupported, or its file may have moved. Your original has not been changed.",
                  );
                  setReady(false);
                }
              }}
            >
              {subtitle && (
                <track
                  key={subtitle.url}
                  src={subtitle.url}
                  kind="subtitles"
                  label={subtitle.name}
                  srcLang="und"
                  default
                  onLoad={(event) => {
                    positionCaptions(event.currentTarget.track);
                    event.currentTarget.track.mode = cc
                      ? "showing"
                      : "disabled";
                  }}
                />
              )}
            </video>
            {!session && !error && (
              <div className="player-message" role="status">
                <FileVideo size={30} />
                <p>Opening your video…</p>
              </div>
            )}
            {error && (
              <div className="player-message" role="alert">
                <AlertCircle size={28} />
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            )}
            {paused && ready && !error && (
              <button
                className="big-play"
                aria-label="Play video"
                onClick={togglePlay}
              >
                <Play size={30} fill="currentColor" />
              </button>
            )}
            <div className="player-controls">
              <input
                aria-label="Seek video"
                className="player-timeline"
                type="range"
                min={0}
                max={duration || 1}
                step={0.05}
                value={Math.min(position, duration || 1)}
                disabled={!ready}
                onChange={(event) => seek(Number(event.target.value))}
              />
              <div className="player-control-row">
                <button
                  aria-label={paused ? "Play" : "Pause"}
                  disabled={!ready}
                  onClick={togglePlay}
                >
                  {paused ? <Play size={24} /> : <Pause size={24} />}
                </button>
                <button
                  aria-label="Next video"
                  disabled={!next}
                  onClick={() => next && onSelect(next)}
                >
                  <SkipForward size={24} />
                </button>
                <button
                  aria-label={prefs.muted ? "Unmute" : "Mute"}
                  onClick={() => setPrefs((p) => ({ ...p, muted: !p.muted }))}
                >
                  {prefs.muted || prefs.volume === 0 ? (
                    <VolumeX size={24} />
                  ) : (
                    <Volume2 size={24} />
                  )}
                </button>
                <input
                  aria-label="Volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={prefs.muted ? 0 : prefs.volume}
                  onChange={(event) =>
                    setPrefs((p) => ({
                      ...p,
                      volume: Number(event.target.value),
                      muted: false,
                    }))
                  }
                />
                <span className="player-clock">
                  {formatDuration(position)} / {formatDuration(duration)}
                </span>
                <span className="control-spacer" />
                <select
                  aria-label="Playback speed"
                  value={prefs.speed}
                  onChange={(event) =>
                    setPrefs((p) => ({
                      ...p,
                      speed: Number(event.target.value),
                    }))
                  }
                >
                  {speeds.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed === 1 ? "Normal" : `${speed}×`}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={cc ? "Hide subtitles" : "Show subtitles"}
                  disabled={!subtitle}
                  aria-pressed={Boolean(subtitle && cc)}
                  onClick={() => setCc((value) => !value)}
                >
                  <Captions size={24} />
                </button>
                <button
                  aria-label="Theater mode"
                  aria-pressed={theater}
                  onClick={() => setTheater((value) => !value)}
                >
                  <Monitor size={24} />
                </button>
                <button
                  aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                </button>
              </div>
            </div>
          </div>
          <h1 className="watch-title">{video.title}</h1>
          <div className="local-watch-meta">
            <span>
              <FileVideo size={16} />
              {formatSize(video.size)} · Local video
            </span>
            <button
              className="secondary-button"
              disabled={!session || subtitleBusy}
              onClick={() => void loadSubtitles()}
            >
              <Captions size={16} />
              {subtitleBusy ? "Loading subtitles…" : "Load subtitles"}
            </button>
          </div>
          {subtitle && (
            <p className="player-hint">
              Subtitles: {subtitle.name}{" "}
              <button className="text-button" onClick={() => setSubtitle(null)}>
                Remove subtitles
              </button>
            </p>
          )}
          {hint && (
            <p className="player-hint" role="status">
              {hint}
            </p>
          )}
          <details className="player-help">
            <summary>Keyboard shortcuts</summary>
            <p>
              Space / K: play or pause · J / L: seek 10 seconds · ← / →: seek 5
              seconds · ↑ / ↓: volume · M: mute · F: fullscreen · T: theater ·
              C: subtitles. Shortcuts leave focused controls and text fields
              alone.
            </p>
          </details>
        </section>
        <aside className="local-up-next">
          <div className="up-next-heading">
            <h2>Up next</h2>
            <label>
              <input
                type="checkbox"
                checked={prefs.autoplay}
                onChange={(event) =>
                  setPrefs((p) => ({ ...p, autoplay: event.target.checked }))
                }
              />
              Autoplay next
            </label>
          </div>
          <p className="queue-note">
            From the collection page you opened. Autoplay stops at the end.
          </p>
          {queue
            .filter((item) => item.id !== video.id)
            .map((item) => (
              <button
                key={item.id}
                className="local-next-card"
                aria-label={`Play next ${item.title}`}
                disabled={item.missing}
                onClick={() => onSelect(item)}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" loading="lazy" />
                ) : (
                  <FileVideo size={30} />
                )}
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.missing
                      ? "File unavailable"
                      : formatDuration(item.duration)}
                  </small>
                </span>
              </button>
            ))}
          {!next && (
            <p className="queue-note">You’re at the end of this queue.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
