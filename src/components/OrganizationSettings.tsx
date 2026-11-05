import { useCallback, useEffect, useState } from "react";
import {
  FolderPlus,
  FolderOpen,
  Trash2,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import type {
  LibraryDirectory,
  OrganizationSettings as Settings,
  StorageUsage,
} from "../../electron/organization-types.cjs";
import { usePlayerPreferences, speeds } from "../playerPreferences";
import { formatSize } from "./OfflineLibrary";
import "./Organization.css";
export default function OrganizationSettings() {
  const api = window.frame?.organization;
  const { prefs, setPrefs, error: prefError, ready } = usePlayerPreferences();
  const [settings, setSettings] = useState<Settings | null>(null),
    [directories, setDirectories] = useState<LibraryDirectory[]>([]),
    [download, setDownload] = useState<string | null>(null),
    [storage, setStorage] = useState<StorageUsage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState<{
      completed: number;
      total: number;
    } | null>(null);
  const load = useCallback(async () => {
    if (!api) return;
    const [settings, folders, download, usage] = await Promise.all([
      api.settings(),
      api.directories(),
      api.downloadDirectory(),
      api.storage(),
    ]);
    setSettings(settings);
    setDirectories(folders);
    setDownload(download);
    setStorage(usage);
  }, [api]);
  useEffect(() => {
    let canceled = false;
    void load().catch(() => {
      if (!canceled) setError("Could not load organization settings.");
    });
    return () => {
      canceled = true;
    };
  }, [load]);
  useEffect(
    () => window.frame?.library.onProgress((value) => setProgress(value)),
    [],
  );
  async function run(action: () => Promise<string | void>) {
    if (!api || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      if (result) setMessage(result);
      await load();
    } catch {
      setError(
        "The operation could not finish. Wait for other imports/scans to finish and check folder access, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="organization-settings">
      <h2>Playback defaults</h2>
      {!api && (
        <p className="organization-muted">
          Use the desktop app to manage persistent organization and storage.
          Playback preferences can still be previewed here.
        </p>
      )}
      {(error || prefError) && (
        <p className="organization-error" role="alert">
          {error || prefError}
        </p>
      )}
      {message && (
        <p className="organization-notice" role="status">
          {message}
        </p>
      )}
      <div className="setting-row">
        <div>
          <strong>Default playback speed</strong>
          <p>Used when opening your next local video.</p>
        </div>
        <select
          aria-label="Default playback speed"
          disabled={!ready}
          value={prefs.speed}
          onChange={(event) =>
            setPrefs((value) => ({
              ...value,
              speed: Number(event.target.value),
            }))
          }
        >
          {speeds.map((speed) => (
            <option value={speed} key={speed}>
              {speed === 1 ? "Normal" : `${speed}×`}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <strong>Default volume</strong>
          <p>
            {Math.round(prefs.volume * 100)}% · also updated by player controls
          </p>
        </div>
        <input
          aria-label="Default volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          disabled={!ready}
          onChange={(event) =>
            setPrefs((value) => ({
              ...value,
              volume: Number(event.target.value),
            }))
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>Start muted</strong>
          <p>Applies to local playback.</p>
        </div>
        <input
          aria-label="Start muted"
          type="checkbox"
          checked={prefs.muted}
          disabled={!ready}
          onChange={(event) =>
            setPrefs((value) => ({ ...value, muted: event.target.checked }))
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>Autoplay next local video</strong>
          <p>
            For ordinary library viewing. Playlists have their own queue
            controls.
          </p>
        </div>
        <input
          aria-label="Default local autoplay"
          type="checkbox"
          checked={prefs.autoplay}
          disabled={!ready}
          onChange={(event) =>
            setPrefs((value) => ({ ...value, autoplay: event.target.checked }))
          }
        />
      </div>
      <h2>History</h2>
      <div className="setting-row">
        <div>
          <strong>Record history and resume positions</strong>
          <p>
            Pausing stops new local history/resume updates and YouTube visit
            recording.
          </p>
        </div>
        <input
          aria-label="Record history"
          type="checkbox"
          checked={settings?.recordHistory ?? true}
          disabled={!settings || busy}
          onChange={(event) => {
            const previous = settings!;
            const next = event.currentTarget.checked;
            setSettings({ ...previous, recordHistory: next });
            void run(async () => {
              try {
                await api!.updateSettings({ recordHistory: next });
              } catch (error) {
                setSettings(previous);
                throw error;
              }
            });
          }}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>Clear playback history</strong>
          <p>
            Removes local resume positions and YouTube visits. Keeps media and
            playlists.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={!api || busy}
          onClick={() =>
            void run(async () => {
              if (await api!.clearHistory())
                return "History and resume positions cleared.";
            })
          }
        >
          <Trash2 size={15} />
          Clear history
        </button>
      </div>
      <h2>Library directories</h2>
      <p className="organization-muted">
        Select trusted folders, then scan on demand. Each scan indexes up to 100
        new videos, checks up to 10,000 directory entries, and skips symlinks.
        Scan again for the next batch; no background folder watcher is
        installed.
      </p>
      <div className="directory-list">
        {directories.map((folder) => (
          <div className="directory-row" key={folder.id}>
            <FolderOpen size={18} />
            <span>{folder.path}</span>
            <button
              className="text-button"
              disabled={busy}
              aria-label={`Scan ${folder.path}`}
              onClick={() =>
                void run(async () => {
                  const result = await api!.scanDirectory(folder.id);
                  return `${result.added} imported · ${result.failed} failed · ${result.warnings} metadata warnings${result.limited ? " · Scan limit or inaccessible folder reached; scan again or select a smaller subfolder." : ""}`;
                })
              }
            >
              Scan
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`Remove directory ${folder.path}`}
              onClick={() => void run(() => api!.removeDirectory(folder.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary-button"
        disabled={!api || busy}
        onClick={() =>
          void run(async () => {
            await api!.addDirectory();
          })
        }
      >
        <FolderPlus size={16} />
        Add library directory
      </button>
      {progress && (
        <div className="import-progress" role="status">
          <span>
            Processing {progress.completed} of {progress.total}
          </span>
          <progress max={progress.total || 1} value={progress.completed} />
        </div>
      )}
      <h2>Storage & previews</h2>
      <div className="storage-summary">
        <span>
          <HardDrive size={17} />
          <strong>{storage ? formatSize(storage.indexedBytes) : "—"}</strong>
          <small>Source videos indexed, not copied</small>
        </span>
        <span>
          <strong>{storage ? formatSize(storage.thumbnailBytes) : "—"}</strong>
          <small>{storage?.thumbnailCount ?? 0} cached thumbnails</small>
        </span>
        <span>
          <strong>{storage ? formatSize(storage.databaseBytes) : "—"}</strong>
          <small>Metadata databases and journals</small>
        </span>
      </div>
      <div className="organization-actions">
        <button
          className="secondary-button"
          disabled={!api || busy}
          onClick={() =>
            void run(async () => {
              const result = await api!.clearThumbnails();
              if (result)
                return `${result.cleared} previews cleared · ${result.failed} could not be cleared.`;
            })
          }
        >
          <Trash2 size={15} />
          Clear previews
        </button>
        <button
          className="secondary-button"
          disabled={!api || busy}
          onClick={() =>
            void run(async () => {
              const result = await api!.rebuildThumbnails();
              return `${result.processed} previews processed · ${result.failed} unavailable. Run again for the next batch if needed.`;
            })
          }
        >
          <RefreshCw size={15} />
          Rebuild previews
        </button>
        <button
          className="text-button"
          disabled={!api || busy}
          onClick={() => void run(async () => {})}
        >
          Refresh storage
        </button>
      </div>
      <p className="organization-muted">
        Rebuilding handles up to 100 uncached files per batch. Original videos
        are never deleted by these controls.
      </p>
      <h2>Future download location</h2>
      <div className="setting-row">
        <div>
          <strong>{download || "No folder selected"}</strong>
          <p>
            Saved for future downloads. Phase 6’s download manager is not
            implemented.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={!api || busy}
          onClick={() =>
            void run(async () => {
              await api!.chooseDownloadDirectory();
            })
          }
        >
          Choose folder
        </button>
      </div>
      {busy && (
        <p role="status" className="organization-muted">
          Working… follow any native confirmation or folder dialog.
        </p>
      )}
    </section>
  );
}
