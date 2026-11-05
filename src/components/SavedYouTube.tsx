import { useEffect, useState } from "react";
import { Bookmark, Link, ArrowLeft, ArrowRight, WifiOff } from "lucide-react";
import type {
  SavedYouTubePage,
  YouTubeVideo,
} from "../../electron/youtube-types.cjs";
import YouTubeCard from "./YouTubeCard";
import "./YouTube.css";
export default function SavedYouTube({
  searchQuery,
  onOpen,
  onSavedChange,
  hasSamples,
}: {
  searchQuery: string;
  onOpen: (video: YouTubeVideo) => void;
  onSavedChange: () => void;
  hasSamples: boolean;
}) {
  const api = window.frame?.youtube;
  const [data, setData] = useState<SavedYouTubePage>({ items: [], total: 0 }),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(Boolean(api)),
    [revision, setRevision] = useState(0);
  const [paging, setPaging] = useState({ query: searchQuery, offset: 0 });
  const offset = paging.query === searchQuery ? paging.offset : 0;
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    setLoading(true);
    api
      .saved(searchQuery.slice(0, 200), offset)
      .then((value) => {
        if (!canceled) {
          if (offset >= value.total && offset > 0)
            setPaging({ query: searchQuery, offset: Math.max(0, offset - 48) });
          else setData(value);
        }
      })
      .catch(() => {
        if (!canceled) setError("Could not read your saved links.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, searchQuery, offset, revision]);
  async function change(value: string, remove = false) {
    if (!api || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await (remove ? api.unsave(value) : api.save(value));
      if (!remove) setLink("");
      setMessage(
        remove ? "Saved link removed." : "YouTube link saved on this computer.",
      );
      setRevision((value) => value + 1);
      onSavedChange();
    } catch {
      setError(
        remove
          ? "Could not remove this link."
          : "Enter an HTTPS youtube.com/watch, Shorts, live, or youtu.be video link.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="youtube-page saved-youtube">
      <div className="page-heading">
        <span className="eyebrow">
          <Bookmark size={14} />
          KEEP A LITTLE INSPIRATION
        </span>
        <h1>Watch Later</h1>
        <p>
          Saved YouTube links stay here between sessions. Videos require an
          internet connection.
        </p>
      </div>
      <form
        className="youtube-save-form"
        onSubmit={(event) => {
          event.preventDefault();
          void change(link);
        }}
      >
        <Link size={18} />
        <input
          aria-label="YouTube video link"
          maxLength={2048}
          placeholder="Paste a YouTube video link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={!api || busy || !link.trim()}
        >
          {busy ? "Saving…" : "Save link"}
        </button>
      </form>
      {!api && (
        <p className="youtube-notice">
          Open the desktop app to persist real YouTube links. Sample bookmarks
          below are session-only.
        </p>
      )}
      {error && (
        <p role="alert" className="youtube-error">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="youtube-notice">
          {message}
        </p>
      )}
      {loading ? (
        <p className="youtube-loading" role="status">
          Loading saved links…
        </p>
      ) : data.items.length ? (
        <>
          <div className="youtube-results-heading">
            <h2>
              {data.total} saved YouTube {data.total === 1 ? "link" : "links"}
            </h2>
            <span className="youtube-fine-print">
              <WifiOff size={14} />
              Links are not downloads
            </span>
          </div>
          <div className="video-grid youtube-grid">
            {data.items.map((video) => (
              <YouTubeCard
                key={video.id}
                video={video}
                saved
                busy={busy}
                onOpen={() => onOpen(video)}
                onSave={() => void change(video.id, true)}
                onBrowser={() => {
                  void api
                    ?.openBrowser(video.id)
                    .catch(() => setError("Could not open your browser."));
                }}
              />
            ))}
          </div>
          <div className="library-pagination">
            <button
              className="secondary-button"
              disabled={!offset}
              onClick={() =>
                setPaging({
                  query: searchQuery,
                  offset: Math.max(0, offset - 48),
                })
              }
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
              onClick={() =>
                setPaging({ query: searchQuery, offset: offset + 48 })
              }
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : !hasSamples ? (
        <div className="empty-state compact">
          <Bookmark size={30} />
          <h2>
            {searchQuery
              ? "No matching saved links."
              : "Keep a little inspiration."}
          </h2>
          <p>
            Save a real YouTube video from Discovery, or paste its link above. A
            key is optional for saving links; metadata may be unavailable until
            configured.
          </p>
        </div>
      ) : null}
    </section>
  );
}
