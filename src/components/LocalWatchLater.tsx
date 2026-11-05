import { useEffect, useState } from "react";
import { BookmarkMinus, Play, FileVideo } from "lucide-react";
import type { LocalVideo } from "../../electron/library-types.cjs";
import type { PlaylistEntry } from "../../electron/organization-types.cjs";
import { collectionsChanged } from "./AddToPlaylist";
import { formatDuration } from "./OfflineLibrary";
import AddToPlaylist from "./AddToPlaylist";
export default function LocalWatchLater({
  query,
  onPlay,
}: {
  query: string;
  onPlay: (video: LocalVideo, queue: LocalVideo[]) => void;
}) {
  const api = window.frame?.organization;
  const [items, setItems] = useState<PlaylistEntry[]>([]),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    let canceled = false;
    api
      ?.localLater()
      .then((value) => {
        if (!canceled) {
          setItems(value);
        }
      })
      .catch(() => {
        if (!canceled) setError("Could not load local Watch Later entries.");
      });
    return () => {
      canceled = true;
    };
  }, [api, revision]);
  useEffect(() => setPage(0), [query]);
  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(
    () =>
      setPage((value) =>
        Math.min(value, Math.max(0, Math.floor((filtered.length - 1) / 48))),
      ),
    [filtered.length],
  );
  if (!items.length && !error) return null;
  return (
    <section className="local-watch-later">
      <div className="youtube-results-heading">
        <h2>Local videos for later</h2>
        <span className="organization-muted">Saved between sessions</span>
      </div>
      {error && (
        <p role="alert" className="organization-error">
          {error}
        </p>
      )}
      <div className="video-grid local-grid">
        {filtered.slice(page * 48, page * 48 + 48).map((item) => (
          <article className="local-card" key={item.entryId}>
            <button
              className="later-thumbnail"
              disabled={!item.available || !item.local}
              aria-label={`Play saved ${item.title}`}
              onClick={() =>
                item.local &&
                onPlay(
                  item.local,
                  filtered
                    .slice(page * 48, page * 48 + 48)
                    .flatMap((item) => (item.local ? [item.local] : [])),
                )
              }
            >
              {item.local?.thumbnail ? (
                <img src={item.local.thumbnail} loading="lazy" alt="" />
              ) : (
                <FileVideo size={32} />
              )}
              <Play size={24} className="later-play" />
              <span className="duration">
                {item.available
                  ? formatDuration(item.local?.duration ?? null)
                  : "File unavailable"}
              </span>
            </button>
            <div className="local-card-heading">
              <h3>{item.title}</h3>
              <div className="organization-actions">
                <AddToPlaylist source={item.source} title={item.title} />
                <button
                  className="icon-button"
                  aria-label={`Remove ${item.title} from Watch Later`}
                  onClick={() => {
                    void api
                      ?.saveLocalLater(item.source.id, false)
                      .then(() => {
                        setRevision((value) => value + 1);
                        collectionsChanged();
                      })
                      .catch(() =>
                        setError("Could not remove this saved entry."),
                      );
                  }}
                >
                  <BookmarkMinus size={18} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {filtered.length > 48 && (
        <div className="library-pagination">
          <button
            className="secondary-button"
            disabled={!page}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            className="secondary-button"
            disabled={(page + 1) * 48 >= filtered.length}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
