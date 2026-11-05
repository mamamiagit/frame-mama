import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Shuffle,
  Repeat,
  ListVideo,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import type {
  OrganizationSettings,
  PlaylistDetail,
  PlaylistEntry,
} from "../../electron/organization-types.cjs";
import { adjacentItem, orderQueue } from "../queue";
import { useOnlineStatus } from "../useOnlineStatus";
import LocalPlayer from "./LocalPlayer";
import YouTubeWatch from "./YouTubeWatch";
import "./Organization.css";
export default function PlaylistPlayback({
  detail,
  initialEntry,
  onBack,
  onSavedChange,
  obscured,
}: {
  detail: PlaylistDetail;
  initialEntry?: string;
  onBack: () => void;
  onSavedChange: () => void;
  obscured: boolean;
}) {
  const api = window.frame?.organization;
  const online = useOnlineStatus();
  const initial =
    detail.items.find(
      (item) => item.entryId === initialEntry && item.available,
    ) || detail.items.find((item) => item.available);
  const [current, setCurrent] = useState(initial?.entryId || ""),
    [order, setOrder] = useState(detail.items),
    [settings, setSettings] = useState<OrganizationSettings>({
      recordHistory: true,
      shuffle: false,
      repeat: "none",
      autoAdvance: true,
    }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false),
    [nonce, setNonce] = useState(0),
    [restart, setRestart] = useState(false);
  useEffect(() => {
    let canceled = false;
    api
      ?.settings()
      .then((value) => {
        if (!canceled) {
          setSettings(value);
          setOrder(orderQueue(detail.items, value.shuffle, initial?.entryId));
        }
      })
      .catch(() => {
        if (!canceled) setError("Could not load queue preferences.");
      })
      .finally(() => {
        if (!canceled) setReady(true);
      });
    return () => {
      canceled = true;
    };
  }, [api, detail.items, initial?.entryId]);
  async function update(patch: Partial<OrganizationSettings>) {
    if (!api || saving || !ready) return;
    const previous = settings;
    setSaving(true);
    setSettings({ ...previous, ...patch });
    try {
      const next = await api.updateSettings(patch);
      setSettings(next);
      if (patch.shuffle !== undefined)
        setOrder(orderQueue(detail.items, next.shuffle, current));
      setError("");
    } catch {
      setSettings(previous);
      setError("Could not save queue preferences.");
    } finally {
      setSaving(false);
    }
  }
  const item = order.find((item) => item.entryId === current),
    next = adjacentItem(order, current, 1, settings.repeat),
    previous = adjacentItem(order, current, -1, settings.repeat);
  function select(entry: PlaylistEntry) {
    setRestart(entry.entryId === current);
    setCurrent(entry.entryId);
    setNonce((value) => value + 1);
  }
  function advance(automatic = false) {
    const target = adjacentItem(order, current, 1, settings.repeat, automatic);
    if (target) select(target);
  }
  return (
    <div className="playlist-playback-layout">
      <section className="playlist-media">
        {item?.local ? (
          <LocalPlayer
            key={`${current}:${nonce}`}
            video={item.local}
            queue={[]}
            onSelect={() => {}}
            onBack={onBack}
            restart={restart}
            playlistControls={{
              hasNext: Boolean(next),
              next: () => advance(),
              onEnded: () => advance(true),
              autoAdvance: settings.autoAdvance,
            }}
          />
        ) : item?.youtube ? (
          <YouTubeWatch
            key={`${current}:${nonce}`}
            video={item.youtube}
            obscured={obscured}
            onBack={onBack}
            onSavedChange={onSavedChange}
            repeatOne={settings.repeat === "one"}
          />
        ) : (
          <div className="empty-state">
            <h1>No playable entries.</h1>
            <p>Restore unavailable local files or add a video.</p>
            <button className="secondary-button" onClick={onBack}>
              Back to playlists
            </button>
          </div>
        )}
      </section>
      <aside className="playlist-queue">
        <div className="playlist-queue-title">
          <ListVideo size={20} />
          <div>
            <h2>{detail.playlist.name}</h2>
            <p>{order.length} items · temporary playback queue</p>
          </div>
        </div>
        {error && (
          <p className="organization-error" role="alert">
            {error}
          </p>
        )}
        <div className="queue-controls">
          <button
            className="icon-button"
            aria-label="Previous playlist item"
            disabled={!previous}
            onClick={() => previous && select(previous)}
          >
            <ArrowLeft size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Next playlist item"
            disabled={!next}
            onClick={() => advance()}
          >
            <ArrowRight size={19} />
          </button>
          <button
            className={`icon-button ${settings.shuffle ? "active" : ""}`}
            aria-label="Shuffle playlist"
            aria-pressed={settings.shuffle}
            disabled={!ready || saving}
            onClick={() => void update({ shuffle: !settings.shuffle })}
          >
            <Shuffle size={19} />
          </button>
          <label>
            <Repeat size={17} />
            <select
              aria-label="Playlist repeat mode"
              value={settings.repeat}
              disabled={!ready || saving}
              onChange={(event) =>
                void update({
                  repeat: event.target.value as OrganizationSettings["repeat"],
                })
              }
            >
              <option value="none">Repeat off</option>
              <option value="all">Repeat all</option>
              <option value="one">Repeat one</option>
            </select>
          </label>
        </div>
        <label className="queue-autoplay">
          <input
            type="checkbox"
            checked={settings.autoAdvance}
            disabled={!ready || saving}
            onChange={(event) =>
              void update({ autoAdvance: event.target.checked })
            }
          />
          Auto advance local videos
        </label>
        {order.some((item) => item.source.kind === "youtube") && (
          <p className="queue-explanation">
            YouTube links play online in the official player. Use Next after an
            online video ends; Repeat one uses YouTube’s supported loop option.
          </p>
        )}
        <ol className="queue-entries">
          {order.map((entry, index) => (
            <li key={entry.entryId}>
              <button
                className={entry.entryId === current ? "current" : ""}
                aria-current={entry.entryId === current ? "true" : undefined}
                disabled={!entry.available}
                onClick={() => select(entry)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.source.kind === "youtube" ? (
                      <>
                        <ExternalLink size={10} />
                        {online ? "Online only" : "Unavailable offline"}
                      </>
                    ) : (
                      <>
                        <WifiOff size={10} />
                        {entry.available ? "Local" : "Unavailable"}
                      </>
                    )}
                  </small>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
