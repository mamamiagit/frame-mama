import { useCallback, useEffect, useState } from "react";
import { ListPlus, Bookmark, Check } from "lucide-react";
import type { MediaRef, Playlist } from "../../electron/organization-types.cjs";
import Modal from "./Modal";
import "./Organization.css";
export function collectionsChanged() {
  window.dispatchEvent(new Event("frame:collections-changed"));
}
export function LocalLaterButton({ id, title }: { id: string; title: string }) {
  const api = window.frame?.organization;
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    api
      ?.isLocalLater(id)
      .then((value) => {
        if (!canceled) setSaved(value);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [api, id]);
  return (
    <>
      <button
        className={`icon-button ${saved ? "is-saved" : ""}`}
        disabled={!api || busy}
        aria-label={`${saved ? "Unsave" : "Save"} ${title} for later`}
        title={saved ? "Remove from Watch Later" : "Save local video for later"}
        onClick={() => {
          if (!api) return;
          setBusy(true);
          api
            .saveLocalLater(id, !saved)
            .then(() => {
              setSaved((value) => !value);
              setError("");
              collectionsChanged();
            })
            .catch(() => setError("Could not update Watch Later"))
            .finally(() => setBusy(false));
        }}
      >
        {saved ? <Check size={17} /> : <Bookmark size={17} />}
      </button>
      {error && (
        <span className="organization-inline-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
export default function AddToPlaylist({
  source,
  title,
}: {
  source: MediaRef;
  title: string;
}) {
  const api = window.frame?.organization;
  const [open, setOpen] = useState(false),
    [playlists, setPlaylists] = useState<Playlist[]>([]),
    [selected, setSelected] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [added, setAdded] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    let canceled = false;
    if (open && api) {
      setError("");
      api
        .list()
        .then((items) => {
          if (!canceled) {
            setPlaylists(items);
            setSelected(items[0]?.id || "");
          }
        })
        .catch(() => {
          if (!canceled) setError("Could not load playlists.");
        });
    }
    return () => {
      canceled = true;
    };
  }, [api, open]);
  async function add() {
    if (!api || busy || (!selected && !name.trim())) return;
    setBusy(true);
    setError("");
    try {
      const playlist = name.trim()
        ? await api.create(name.trim())
        : playlists.find((item) => item.id === selected);
      if (!playlist) throw new Error("Choose a playlist");
      await api.add(playlist.id, source);
      setAdded(true);
      collectionsChanged();
      close();
    } catch {
      setError(
        "Could not add this item. Use a valid playlist name and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button"
        disabled={!api}
        aria-label={`Add ${title} to playlist`}
        title={added ? "Added to a playlist" : "Add to playlist"}
        onClick={() => setOpen(true)}
      >
        <ListPlus size={18} />
      </button>
      {open && (
        <Modal title="Add to playlist" onClose={close}>
          <p className="organization-muted">{title}</p>
          <label className="organization-field">
            Existing playlist
            <select
              aria-label="Choose playlist"
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setName("");
              }}
            >
              <option value="">Choose a playlist</option>
              {playlists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="organization-field">
            Or create a new playlist
            <input
              aria-label="New playlist name"
              value={name}
              maxLength={80}
              placeholder="Name your collection"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && (
            <p className="organization-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            disabled={busy || (!selected && !name.trim())}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : "Add video"}
          </button>
        </Modal>
      )}
    </>
  );
}
