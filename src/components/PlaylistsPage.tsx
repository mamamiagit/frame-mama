import { useCallback, useEffect, useState } from "react";
import {
  ListVideo,
  Plus,
  Pencil,
  Trash2,
  Play,
  ArrowUp,
  ArrowDown,
  GripVertical,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import type {
  Playlist,
  PlaylistDetail,
  PlaylistEntry,
} from "../../electron/organization-types.cjs";
import Modal from "./Modal";
import { collectionsChanged } from "./AddToPlaylist";
import { useOnlineStatus } from "../useOnlineStatus";
import "./Organization.css";
export default function PlaylistsPage({
  onPlay,
  initialId,
}: {
  onPlay: (detail: PlaylistDetail, entryId?: string) => void;
  initialId?: string;
}) {
  const api = window.frame?.organization;
  const online = useOnlineStatus();
  const [playlists, setPlaylists] = useState<Playlist[]>([]),
    [selected, setSelected] = useState(initialId || ""),
    [detail, setDetail] = useState<PlaylistDetail | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(Boolean(api)),
    [drag, setDrag] = useState<string | null>(null),
    [offset, setOffset] = useState(0);
  const [edit, setEdit] = useState<"new" | "rename" | null>(null),
    [name, setName] = useState("");
  const close = useCallback(() => setEdit(null), []);
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    setLoading(true);
    api
      .list()
      .then((items) => {
        if (canceled) return;
        setPlaylists(items);
        if (!items.some((item) => item.id === selected))
          setSelected(items[0]?.id || "");
      })
      .catch(() => {
        if (!canceled) setError("Could not load playlists.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, revision, selected]);
  useEffect(() => {
    let canceled = false;
    setDetail(null);
    if (!api || !selected) return;
    api
      .detail(selected)
      .then((value) => {
        if (!canceled) {
          setDetail(value);
          setOffset((offset) =>
            Math.min(
              offset,
              Math.max(0, Math.floor((value.items.length - 1) / 48) * 48),
            ),
          );
        }
      })
      .catch(() => {
        if (!canceled) setError("Could not open this playlist.");
      });
    return () => {
      canceled = true;
    };
  }, [api, selected, revision]);
  useEffect(() => setOffset(0), [selected]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      collectionsChanged();
      setRevision((value) => value + 1);
    } catch {
      setError(
        "The playlist could not be updated. It may have changed; refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function reorder(entry: PlaylistEntry, direction: number) {
    if (!detail || !api) return;
    const ids = detail.items.map((item) => item.entryId),
      index = ids.indexOf(entry.entryId),
      target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => api.reorder(selected, ids));
  }
  function drop(target: string) {
    if (!detail || !api || !drag || drag === target) return;
    const ids = detail.items.map((item) => item.entryId),
      old = ids.indexOf(drag),
      next = ids.indexOf(target);
    if (old < 0 || next < 0) return;
    ids.splice(old, 1);
    ids.splice(next, 0, drag);
    setDrag(null);
    void run(() => api.reorder(selected, ids));
  }
  return (
    <section className="playlists-page">
      <div className="page-heading organization-heading">
        <div>
          <span className="eyebrow">COLLECT WHAT MOVES YOU</span>
          <h1>Playlists</h1>
          <p>
            Local files and saved YouTube links, together in your own order.
          </p>
        </div>
        <button
          className="primary-button"
          disabled={!api || busy}
          onClick={() => {
            setName("");
            setEdit("new");
          }}
        >
          <Plus size={17} />
          New playlist
        </button>
      </div>
      {error && (
        <p className="organization-error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh
          </button>
        </p>
      )}
      {!api ? (
        <div className="empty-state">
          <ListVideo size={32} />
          <h2>Your collections live on your desktop.</h2>
          <p>Open Frame to create persistent playlists.</p>
        </div>
      ) : loading && !playlists.length ? (
        <p role="status">Loading playlists…</p>
      ) : !playlists.length ? (
        <div className="empty-state">
          <ListVideo size={32} />
          <h2>A place for every mood.</h2>
          <p>
            Create a playlist, then use the list-plus button on a local video or
            YouTube card to add it. Original files stay in place.
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setName("");
              setEdit("new");
            }}
          >
            Create your first playlist
          </button>
        </div>
      ) : (
        <div className="playlist-manager">
          <nav className="playlist-list" aria-label="Your playlists">
            {playlists.map((item) => (
              <button
                key={item.id}
                className={selected === item.id ? "selected" : ""}
                aria-current={selected === item.id ? "true" : undefined}
                onClick={() => setSelected(item.id)}
              >
                <ListVideo size={20} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.count} items</small>
                </span>
              </button>
            ))}
          </nav>
          <section className="playlist-detail">
            {detail ? (
              <>
                <div className="playlist-detail-heading">
                  <div>
                    <h2>{detail.playlist.name}</h2>
                    <p>
                      {detail.items.length} items · Drag to reorder, or use the
                      arrows
                    </p>
                  </div>
                  <div className="organization-actions">
                    <button
                      className="icon-button"
                      aria-label="Rename playlist"
                      disabled={busy}
                      onClick={() => {
                        setName(detail.playlist.name);
                        setEdit("rename");
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Delete playlist"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (await api.delete(selected)) setSelected("");
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                    <button
                      className="primary-button"
                      disabled={!detail.items.some((item) => item.available)}
                      onClick={() => onPlay(detail)}
                    >
                      <Play size={16} />
                      Play playlist
                    </button>
                  </div>
                </div>
                {detail.items.length ? (
                  <>
                    <ol className="playlist-entries">
                      {detail.items
                        .slice(offset, offset + 48)
                        .map((item, index) => (
                          <li
                            className={`playlist-entry ${item.available ? "" : "unavailable"}`}
                            key={item.entryId}
                            draggable={!busy}
                            onDragStart={(event) => {
                              setDrag(item.entryId);
                              event.dataTransfer.setData(
                                "text/plain",
                                item.entryId,
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              drop(item.entryId);
                            }}
                            onDragEnd={() => setDrag(null)}
                          >
                            <GripVertical size={16} />
                            <span className="entry-number">
                              {offset + index + 1}
                            </span>
                            <button
                              className="entry-title"
                              disabled={!item.available}
                              onClick={() => onPlay(detail, item.entryId)}
                            >
                              <strong>{item.title}</strong>
                              <small>
                                {item.source.kind === "youtube" ? (
                                  <>
                                    <ExternalLink size={11} />
                                    {online
                                      ? "YouTube · online only"
                                      : "YouTube · unavailable offline"}
                                  </>
                                ) : (
                                  <>
                                    <WifiOff size={11} />
                                    {item.available
                                      ? "Local video"
                                      : "Local file unavailable"}
                                  </>
                                )}
                              </small>
                            </button>
                            <div className="entry-actions">
                              <button
                                className="icon-button"
                                disabled={busy || offset + index === 0}
                                aria-label={`Move ${item.title} up`}
                                onClick={() => reorder(item, -1)}
                              >
                                <ArrowUp size={15} />
                              </button>
                              <button
                                className="icon-button"
                                disabled={
                                  busy ||
                                  offset + index === detail.items.length - 1
                                }
                                aria-label={`Move ${item.title} down`}
                                onClick={() => reorder(item, 1)}
                              >
                                <ArrowDown size={15} />
                              </button>
                              <button
                                className="icon-button"
                                disabled={busy}
                                aria-label={`Remove ${item.title} from playlist`}
                                onClick={() =>
                                  void run(() =>
                                    api.removeEntry(selected, item.entryId),
                                  )
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </li>
                        ))}
                    </ol>
                    <div className="library-pagination">
                      <button
                        className="secondary-button"
                        disabled={!offset}
                        onClick={() =>
                          setOffset((value) => Math.max(0, value - 48))
                        }
                      >
                        Previous
                      </button>
                      <span>
                        {offset + 1}–
                        {Math.min(offset + 48, detail.items.length)} of{" "}
                        {detail.items.length}
                      </span>
                      <button
                        className="secondary-button"
                        disabled={offset + 48 >= detail.items.length}
                        onClick={() => setOffset((value) => value + 48)}
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-state compact">
                    <ListVideo size={27} />
                    <h2>Start with something you love.</h2>
                    <p>
                      Use Add to playlist on a video in Offline Library or
                      YouTube Discovery. You can add a saved YouTube link from
                      Watch Later too.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p role="status">Opening playlist…</p>
            )}
          </section>
        </div>
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "New playlist" : "Rename playlist"}
          onClose={close}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (edit === "new") {
                  const value = await api!.create(name);
                  setSelected(value.id);
                } else await api!.rename(selected, name);
                setEdit(null);
              });
            }}
          >
            <label className="organization-field">
              Name
              <input
                aria-label="Playlist name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !name.trim()}
            >
              {busy ? "Saving…" : "Save playlist"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
