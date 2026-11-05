import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { YouTubeVideo } from "../../electron/youtube-types.cjs";
import { formatDuration } from "./OfflineLibrary";
import "./YouTube.css";

export default function YouTubeWatch({
  video,
  onBack,
  onSavedChange,
  obscured,
}: {
  video: YouTubeVideo;
  onBack: () => void;
  onSavedChange: () => void;
  obscured: boolean;
}) {
  const api = window.frame?.youtube,
    slot = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false),
    [playerReady, setPlayerReady] = useState(false),
    [nativeVisible, setNativeVisible] = useState(false),
    [layoutHint, setLayoutHint] = useState(
      "Scroll up to bring the YouTube player into view.",
    ),
    [retry, setRetry] = useState(0),
    [token, setToken] = useState<string | null>(null),
    [playerError, setPlayerError] = useState(""),
    [actionError, setActionError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  // A result can be selected far down a discovery page; do not inherit its scroll offset.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [video.id, retry]);
  useEffect(() => {
    let canceled = false;
    api
      ?.savedFlags([video.id])
      .then((ids) => {
        if (!canceled) setSaved(ids.includes(video.id));
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [api, video.id]);
  useEffect(() => {
    if (!api || !loaded) return;
    let canceled = false,
      current: string | null = null,
      early: { token: string; error: string | null } | null = null;
    setPlayerError("");
    setPlayerReady(false);
    setNativeVisible(false);
    setToken(null);
    const unsubscribe = api.onPlayerState((state) => {
      if (!current) early = state;
      else if (state.token === current && !canceled) {
        setPlayerError(state.error || "");
        setPlayerReady(!state.error);
      }
    });
    api
      .playerOpen(video.id)
      .then((value) => {
        current = value;
        if (canceled) {
          void api.playerClose(value).catch(() => {});
          return;
        }
        setToken(value);
        if (early && early.token === value) {
          setPlayerError(early.error || "");
          setPlayerReady(!early.error);
        }
      })
      .catch(() => {
        if (!canceled)
          setPlayerError(
            "The player could not be opened. Try again or open the video on YouTube.",
          );
      });
    return () => {
      canceled = true;
      unsubscribe();
      if (current) void api.playerClose(current).catch(() => {});
    };
  }, [api, video.id, loaded, retry]);
  useEffect(() => {
    const element = slot.current;
    if (!api || !token || !element) return;
    let frame = 0,
      canceled = false;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect(),
          header =
            document.querySelector(".topbar")?.getBoundingClientRect().bottom ||
            0;
        const fits =
          rect.height <= innerHeight - header + 1 &&
          rect.width <= innerWidth + 1;
        setLayoutHint(
          fits
            ? "Scroll up to bring the YouTube player into view."
            : "Enlarge the window or zoom out to show the YouTube player.",
        );
        void api
          .playerBounds(token, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            visible:
              !obscured &&
              rect.top >= header - 1 &&
              rect.bottom <= innerHeight + 1 &&
              rect.left >= -1 &&
              rect.right <= innerWidth + 1,
          })
          .then((result) => {
            if (!canceled) setNativeVisible(result.visible);
          })
          .catch(() => {
            if (!canceled) {
              setNativeVisible(false);
              setPlayerError(
                "The player could not be displayed. Reload it or open the video on YouTube.",
              );
            }
          });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    sync();
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [api, token, obscured]);
  async function toggleSave() {
    if (!api || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await (saved ? api.unsave(video.id) : api.save(video.id));
      setSaved((value) => !value);
      onSavedChange();
    } catch {
      setActionError("Could not update this saved link.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="youtube-watch">
      <button className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to videos
      </button>
      <div className="youtube-player-slot" ref={slot} data-player-id={video.id}>
        {!loaded || playerError ? (
          <div className="youtube-player-placeholder">
            <Play size={36} />
            <h2>
              {playerError
                ? "YouTube player unavailable"
                : "Watch with the official YouTube player"}
            </h2>
            <p>
              {playerError ||
                "Loading connects to YouTube. Playback, ads, availability, and controls are provided by YouTube. No API key is sent to the player."}
            </p>
            {video.embeddable === false ? (
              <p>
                This video does not allow embedded playback. Use Open on
                YouTube.
              </p>
            ) : (
              <button
                className="primary-button"
                disabled={!api}
                onClick={() => {
                  setLoaded(true);
                  setRetry((value) => value + 1);
                }}
              >
                {playerError ? <RefreshCw size={16} /> : <Play size={16} />}{" "}
                {playerError ? "Reload player" : "Load official player"}
              </button>
            )}
          </div>
        ) : (
          <p className="youtube-player-wait" role="status">
            {!playerReady
              ? "Loading the official YouTube player…"
              : !nativeVisible
                ? layoutHint
                : "YouTube player opened."}
          </p>
        )}
      </div>
      <h1 className="watch-title">{video.title}</h1>
      <div className="youtube-watch-details">
        <div>
          <strong>{video.channel}</strong>
          <p>
            {video.live
              ? "Live video"
              : video.duration === null
                ? "Saved YouTube link"
                : formatDuration(video.duration)}
            {video.views
              ? ` · ${new Intl.NumberFormat().format(Number(video.views))} views`
              : ""}
          </p>
        </div>
        <div className="youtube-actions">
          {loaded && (
            <button
              className="secondary-button"
              aria-label="Reload YouTube player"
              onClick={() => setRetry((value) => value + 1)}
            >
              <RefreshCw size={16} />
              Reload player
            </button>
          )}
          <button
            className="secondary-button"
            disabled={busy || !api}
            onClick={() => void toggleSave()}
          >
            {saved ? <Check size={16} /> : <Bookmark size={16} />}{" "}
            {saved ? "Saved for later" : "Save for later"}
          </button>
          <button
            className="primary-button"
            disabled={!api}
            onClick={() => {
              void api
                ?.openBrowser(video.id)
                .catch(() => setActionError("Could not open your browser."));
            }}
          >
            Open on YouTube
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
      {actionError && (
        <p className="youtube-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="youtube-playback-note">
        <ShieldCheck size={18} />
        <p>
          YouTube links need an internet connection and are not downloaded. If
          the player shows a restriction, sign-in requirement, or error
          (including error 153), use <strong>Open on YouTube</strong>. Frame
          does not bypass these restrictions.
        </p>
      </div>
      {video.description && (
        <details className="description">
          <summary>Description</summary>
          <p className="youtube-description">{video.description}</p>
        </details>
      )}
    </section>
  );
}
