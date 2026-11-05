import { useEffect, useState } from "react";
import { History, Play, ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import type { LocalVideo } from "../../electron/library-types.cjs";
import type { HistoryPage } from "../../electron/playback-types.cjs";
import type { YouTubeVisit } from "../../electron/organization-types.cjs";
import type { YouTubeVideo } from "../../electron/youtube-types.cjs";
import { formatDuration } from "./OfflineLibrary";
import "./LocalPlayer.css";
import "./Organization.css";
export default function PlaybackHistory({
  onPlay,
  onYouTube,
}: {
  onPlay: (video: LocalVideo, queue: LocalVideo[]) => void;
  onYouTube: (video: YouTubeVideo) => void;
}) {
  const api = window.frame?.playback,
    organization = window.frame?.organization;
  const [offset, setOffset] = useState(0),
    [tab, setTab] = useState<"local" | "youtube">("local"),
    [data, setData] = useState<HistoryPage>({ items: [], total: 0 }),
    [visits, setVisits] = useState<{ items: YouTubeVisit[]; total: number }>({
      items: [],
      total: 0,
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(Boolean(api)),
    [revision, setRevision] = useState(0),
    [record, setRecord] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let canceled = false;
    organization
      ?.settings()
      .then((value) => {
        if (!canceled) setRecord(value.recordHistory);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [organization]);
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    setLoading(true);
    setError("");
    const request =
      tab === "local"
        ? api.history(offset).then((value) => {
            if (!canceled) {
              if (offset >= value.total && offset > 0)
                setOffset(Math.max(0, offset - 48));
              setData(value);
            }
          })
        : organization!.youtubeVisits(offset).then((value) => {
            if (!canceled) {
              if (offset >= value.total && offset > 0)
                setOffset(Math.max(0, offset - 48));
              setVisits(value);
            }
          });
    request
      .catch(() => {
        if (!canceled)
          setError("Could not load your history. Please try again.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, organization, offset, revision, tab]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setRevision((value) => value + 1);
    } catch {
      setError("Could not update history. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const total = tab === "local" ? data.total : visits.total,
    count = tab === "local" ? data.items.length : visits.items.length;
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">RIGHT WHERE YOU LEFT OFF</span>
        <h1>History</h1>
        <p>Local playback and YouTube visits, stored on this computer.</p>
      </div>
      <div className="history-toolbar">
        <div className="history-tabs" role="tablist" aria-label="History type">
          <button
            role="tab"
            aria-selected={tab === "local"}
            onClick={() => {
              setTab("local");
              setOffset(0);
            }}
          >
            Local playback
          </button>
          <button
            role="tab"
            aria-selected={tab === "youtube"}
            onClick={() => {
              setTab("youtube");
              setOffset(0);
            }}
          >
            YouTube visits
          </button>
        </div>
        <label className="queue-autoplay">
          <input
            type="checkbox"
            aria-label="Record history"
            checked={record}
            disabled={!organization || busy}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              setRecord(next);
              void run(async () => {
                try {
                  setRecord(
                    (
                      await organization!.updateSettings({
                        recordHistory: next,
                      })
                    ).recordHistory,
                  );
                } catch (error) {
                  setRecord(record);
                  throw error;
                }
              });
            }}
          />
          Record history
        </label>
        <button
          className="secondary-button"
          disabled={!organization || busy}
          onClick={() =>
            void run(async () => {
              await organization!.clearHistory();
            })
          }
        >
          <Trash2 size={15} />
          Clear all history
        </button>
      </div>
      {!record && (
        <p className="organization-notice">
          History is paused. New local resume positions and YouTube visits are
          not being recorded.
        </p>
      )}
      {tab === "youtube" && (
        <p className="organization-muted">
          These are videos opened in the official player, not verified watches
          or YouTube account history. Online resume positions are managed by
          YouTube.
        </p>
      )}
      {error && (
        <div role="alert" className="library-banner">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading history…</p>
      ) : count ? (
        <>
          <div className="history-list">
            {tab === "local"
              ? data.items.map((item) => (
                  <article className="history-row" key={item.video.id}>
                    <button
                      className="history-play"
                      aria-label={`Resume ${item.video.title}`}
                      disabled={item.video.missing}
                      onClick={() =>
                        onPlay(
                          item.video,
                          data.items.map((entry) => entry.video),
                        )
                      }
                    >
                      {item.video.thumbnail ? (
                        <img src={item.video.thumbnail} loading="lazy" alt="" />
                      ) : (
                        <History size={28} />
                      )}
                      <span>
                        <Play size={20} fill="currentColor" />
                      </span>
                    </button>
                    <div className="history-copy">
                      <h2>{item.video.title}</h2>
                      <p>
                        {item.completed
                          ? "Watched"
                          : `${formatDuration(item.position)} of ${formatDuration(item.duration)}`}{" "}
                        · {new Date(item.lastWatched).toLocaleString()}
                      </p>
                      <progress
                        aria-label={`Watch progress for ${item.video.title}`}
                        value={item.completed ? item.duration : item.position}
                        max={item.duration || 1}
                      />
                      {item.video.missing && (
                        <p className="metadata-warning">
                          File unavailable. Restore it at its original location
                          and check files in Offline Library.
                        </p>
                      )}
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Forget ${item.video.title}`}
                      title="Remove history and resume position"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          organization!.removeHistory(item.video.id),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))
              : visits.items.map((item) => (
                  <article className="history-row" key={item.video.id}>
                    <button
                      className="history-play"
                      aria-label={`Open ${item.video.title}`}
                      onClick={() => onYouTube(item.video)}
                    >
                      {item.video.thumbnail ? (
                        <img
                          src={item.video.thumbnail}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          alt=""
                        />
                      ) : (
                        <History size={28} />
                      )}
                      <span>
                        <Play size={20} fill="currentColor" />
                      </span>
                    </button>
                    <div className="history-copy">
                      <h2>{item.video.title}</h2>
                      <p>Opened · {new Date(item.openedAt).toLocaleString()}</p>
                      <p>YouTube · internet required</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Forget ${item.video.title}`}
                      disabled={busy}
                      onClick={() =>
                        void run(() => organization!.removeVisit(item.video.id))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
          </div>
          <div className="library-pagination">
            <button
              className="secondary-button"
              disabled={!offset || loading}
              onClick={() => setOffset((value) => Math.max(0, value - 48))}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>
              {offset + 1}–{offset + count} of {total}
            </span>
            <button
              className="secondary-button"
              disabled={offset + count >= total || loading}
              onClick={() => setOffset((value) => value + 48)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-icon">
            <History size={28} />
          </span>
          <h2>Pick up where you left off.</h2>
          <p>
            {api
              ? tab === "local"
                ? "Play a video from Offline Library to start your watch history."
                : "Open a YouTube video in the official player to record a visit."
              : "Open Frame’s desktop app to see local history."}
          </p>
        </div>
      )}
    </section>
  );
}
