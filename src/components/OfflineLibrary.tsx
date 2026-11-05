import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileVideo,
  FolderOpen,
  Plus,
  Play,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
} from "lucide-react";
import type {
  LibraryPage,
  LibrarySort,
  LocalVideo,
} from "../../electron/library-types.cjs";
import type { ImportProgress } from "../vite-env";
import "./OfflineLibrary.css";
import AddToPlaylist, { LocalLaterButton } from "./AddToPlaylist";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][unit]}`;
}
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "Unknown duration";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(total / 60) % 60).padStart(hours ? 2 : 1, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function OfflineLibrary({
  searchQuery,
  onPlay,
}: {
  searchQuery: string;
  onPlay: (video: LocalVideo, queue: LocalVideo[]) => void;
}) {
  const api = window.frame?.library;
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(searchQuery);
    setOffset(0);
  }, [searchQuery]);
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<LibraryPage>({
    items: [],
    total: 0,
    totalBytes: 0,
    missing: 0,
  });
  const [loading, setLoading] = useState(Boolean(api));
  const [busy, setBusy] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!api) return;
    return api.onProgress((next) => {
      setProgress(next);
      if (!next) {
        setServiceBusy(false);
        reload();
      }
    });
  }, [api, reload]);
  useEffect(() => {
    if (!api) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .list({ search, sort, offset })
        .then((result) => {
          if (!mounted.current || id !== requestId.current) return;
          if (offset > 0 && offset >= result.total) {
            setOffset(Math.max(0, offset - 48));
            return;
          }
          setData(result);
          setProgress(result.progress);
          setServiceBusy(result.busy);
        })
        .catch(() => {
          if (mounted.current && id === requestId.current)
            setError(
              "Could not read your library. Try refreshing or restart Frame.",
            );
        })
        .finally(() => {
          if (mounted.current && id === requestId.current) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      requestId.current++;
    };
  }, [api, search, sort, offset, revision]);
  async function run(action: () => Promise<void>) {
    if (busy || serviceBusy || progress) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch {
      if (mounted.current)
        setError(
          "The operation could not finish. Check that the files are accessible and no other import or scan is running, then try again.",
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        reload();
      }
    }
  }
  function importVideos() {
    if (!api) return;
    void run(async () => {
      const result = await api.importVideos();
      if (!result.canceled && mounted.current)
        setMessage(
          `${result.added} imported · ${result.duplicates} already in library · ${result.failed} could not be imported${result.warnings ? ` · ${result.warnings} with metadata warnings` : ""}`,
        );
    });
  }
  const working = busy || serviceBusy || Boolean(progress);

  return (
    <section className="library-page">
      <div className="page-heading library-heading">
        <div>
          <span className="eyebrow">
            <WifiOff size={13} /> YOUR FILES. YOUR SPACE.
          </span>
          <h1>Offline Library</h1>
          <p>Keep the videos you own close. No connection needed.</p>
        </div>
        <button
          className="primary-button"
          disabled={!api || working}
          onClick={importVideos}
        >
          <Plus size={17} />
          Import videos
        </button>
      </div>
      {!api ? (
        <div className="library-banner">
          <AlertCircle size={20} />
          <p>
            Open Frame’s desktop application to import and manage local videos.
            Browser preview has no access to your files.
          </p>
        </div>
      ) : (
        <>
          <div className="library-summary">
            <span>
              <FileVideo size={16} />
              {formatSize(data.totalBytes)} indexed
            </span>
            <span>
              <CheckCircle2 size={16} />
              Original files stay in place
            </span>
            {data.missing > 0 && (
              <span className="missing-label">
                <AlertCircle size={16} />
                {data.missing} unavailable
              </span>
            )}
          </div>
          <div className="library-toolbar">
            <label className="library-search">
              <Search size={17} />
              <input
                aria-label="Search local videos"
                placeholder="Search your library"
                maxLength={300}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <label className="library-sort">
              Sort by{" "}
              <select
                aria-label="Sort local videos"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as LibrarySort);
                  setOffset(0);
                }}
              >
                <option value="newest">Recently added</option>
                <option value="title">Title A–Z</option>
                <option value="duration">Longest first</option>
                <option value="size">Largest first</option>
              </select>
            </label>
            <button
              className="secondary-button"
              disabled={working}
              onClick={() =>
                void run(async () => {
                  await api.refresh();
                  setMessage("File availability checked.");
                })
              }
            >
              <RefreshCw size={15} className={working ? "spinning" : ""} />
              Check files
            </button>
          </div>
        </>
      )}
      {progress && (
        <div className="import-progress" role="status">
          <span>
            Indexing video {Math.min(progress.completed + 1, progress.total)} of{" "}
            {progress.total}…
          </span>
          <progress value={progress.completed} max={progress.total} />
          <small>
            Reading metadata and generating thumbnails on your computer. You can
            browse other sections while this finishes.
          </small>
        </div>
      )}
      {(busy || serviceBusy) && !progress && (
        <p className="library-status" role="status">
          Checking files or waiting for an open dialog…
        </p>
      )}
      {error && (
        <div className="library-banner error" role="alert">
          <AlertCircle size={18} />
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => {
              setError("");
              reload();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {message && (
        <div className="library-banner success" role="status">
          <CheckCircle2 size={18} />
          <p>{message}</p>
        </div>
      )}
      {loading ? (
        <div className="library-loading" role="status">
          Loading your library…
        </div>
      ) : data.items.length ? (
        <>
          <div className="library-results">
            <span>
              {data.total} {data.total === 1 ? "video" : "videos"}
              {search && ` matching “${search}”`}
            </span>
            <span>Click a video to watch offline</span>
          </div>
          <div className="video-grid local-grid">
            {data.items.map((video) => (
              <article
                className={`local-card ${video.missing ? "file-missing" : ""}`}
                key={video.id}
              >
                <div className="local-thumbnail">
                  <button
                    className="local-play-button"
                    aria-label={`Play ${video.title}`}
                    disabled={video.missing}
                    onClick={() => onPlay(video, data.items)}
                  >
                    <span>
                      <Play size={22} fill="currentColor" />
                    </span>
                  </button>
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      loading="lazy"
                      alt={`Thumbnail for ${video.title}`}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <div className="thumbnail-fallback">
                    <FileVideo size={34} />
                    <span>
                      {video.thumbnail
                        ? "Preview unavailable"
                        : "No preview available"}
                    </span>
                  </div>
                  <span className="duration">
                    {formatDuration(video.duration)}
                  </span>
                  {video.missing && (
                    <span className="missing-badge">
                      <AlertCircle size={13} />
                      File unavailable
                    </span>
                  )}
                </div>
                <div className="local-card-heading">
                  <h2>
                    <button
                      className="local-title-button"
                      title={video.title}
                      disabled={video.missing}
                      onClick={() => onPlay(video, data.items)}
                    >
                      {video.title}
                    </button>
                  </h2>
                  <div className="organization-actions">
                    <LocalLaterButton id={video.id} title={video.title} />
                    <AddToPlaylist
                      source={{ kind: "local", id: video.id }}
                      title={video.title}
                    />
                    <button
                      className="icon-button"
                      disabled={working}
                      aria-label={`Remove ${video.title} from library`}
                      title="Remove from library (keeps original file)"
                      onClick={() =>
                        void run(async () => {
                          if (await api!.remove(video.id))
                            setMessage(
                              "Library entry removed. Your original file was kept.",
                            );
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="local-file-info">
                  {formatSize(video.size)} ·{" "}
                  {video.fileName.split(".").at(-1)?.toUpperCase()}
                </p>
                {video.metadataError && (
                  <p className="metadata-warning">
                    <AlertCircle size={13} />
                    {video.metadataError}
                  </p>
                )}
                <details className="file-details">
                  <summary>File details</summary>
                  <dl>
                    <dt>File</dt>
                    <dd>{video.fileName}</dd>
                    <dt>Folder</dt>
                    <dd>{video.directory}</dd>
                    <dt>Added</dt>
                    <dd>{new Date(video.importedAt).toLocaleDateString()}</dd>
                    <dt>Status</dt>
                    <dd>
                      {video.missing
                        ? "Missing or inaccessible. Reconnect the drive or restore the original path, then check files."
                        : "Available at last check"}
                    </dd>
                  </dl>
                  {video.metadataError && (
                    <p>
                      Codec support varies. To retry metadata extraction, remove
                      this entry and import the file again. Your original is
                      never deleted.
                    </p>
                  )}
                </details>
              </article>
            ))}
          </div>
          <div className="library-pagination">
            <button
              className="secondary-button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - 48))}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>
              {offset + 1}–{offset + data.items.length} of {data.total}
            </span>
            <button
              className="secondary-button"
              disabled={offset + data.items.length >= data.total || loading}
              onClick={() => setOffset(offset + 48)}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-icon">
            <FolderOpen size={28} />
          </span>
          <h2>
            {search ? "No matching videos." : "Your library starts here."}
          </h2>
          <p>
            {search
              ? "Try a different title or file name."
              : "Import video files from your computer. Frame will generate previews and remember your collection between sessions."}
          </p>
          {api && !search && (
            <button
              className="primary-button"
              disabled={working}
              onClick={importVideos}
            >
              <Plus size={16} />
              Choose video files
            </button>
          )}
          <span className="phase-label">
            MP4, WebM, MOV, MKV and more · Codec support varies
          </span>
        </div>
      )}
      <footer className="content-footer">
        <span>
          <WifiOff size={15} />
          Private by design. Nothing is uploaded.
        </span>
        <span>Removing a library entry never deletes the original file.</span>
      </footer>
    </section>
  );
}
