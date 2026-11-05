import { useEffect, useState } from "react";
import { History, Play, ArrowLeft, ArrowRight } from "lucide-react";
import type { LocalVideo } from "../../electron/library-types.cjs";
import type { HistoryPage } from "../../electron/playback-types.cjs";
import { formatDuration } from "./OfflineLibrary";
import "./LocalPlayer.css";

export default function PlaybackHistory({
  onPlay,
}: {
  onPlay: (video: LocalVideo, queue: LocalVideo[]) => void;
}) {
  const api = window.frame?.playback;
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<HistoryPage>({ items: [], total: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(api));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    setLoading(true);
    setError("");
    api
      .history(offset)
      .then((result) => {
        if (!canceled) setData(result);
      })
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
  }, [api, offset, revision]);
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">RIGHT WHERE YOU LEFT OFF</span>
        <h1>History</h1>
        <p>Your recently played local videos, saved on this computer.</p>
      </div>
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
      ) : data.items.length ? (
        <>
          <div className="history-list">
            {data.items.map((item) => (
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
                      File unavailable. Restore it at its original location and
                      check files in Offline Library.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="library-pagination">
            <button
              className="secondary-button"
              disabled={!offset}
              onClick={() => setOffset((value) => Math.max(0, value - 48))}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>
              {offset + 1}–{offset + data.items.length} of {data.total}
            </span>
            <button
              className="secondary-button"
              disabled={offset + data.items.length >= data.total}
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
              ? "Play a video from Offline Library to start your watch history."
              : "Open Frame’s desktop app to see local playback history."}
          </p>
        </div>
      )}
    </section>
  );
}
