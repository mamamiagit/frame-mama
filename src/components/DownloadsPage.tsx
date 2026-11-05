import { useEffect, useState } from "react";
import type { DownloadItem } from "../../electron/download-types.cjs";
import "./DownloadsPage.css";

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` :
    value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MiB` : `${Math.ceil(value / 1024)} KiB`;
}
export default function DownloadsPage() {
  const api = window.frame?.downloads;
  const organization = window.frame?.organization;
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api || !organization) return;
    let disposed = false, loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const [jobs, directory] = await Promise.all([api.list(), organization.downloadDirectory()]);
        if (!disposed) { setItems(jobs); setFolder(directory); }
      } catch { if (!disposed) setError("Could not load downloads. Try reopening this page."); }
      finally { loading = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 750);
    return () => { disposed = true; clearInterval(timer); };
  }, [api, organization]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); if (api) setItems(await api.list()); }
    catch (error) {
      // Submitted signed links are never echoed back into an error message.
      const message = error instanceof Error ? error.message : "Download action failed.";
      setError(message.replace(/https?:\/\/\S+/gi, "[link]"));
    } finally { setBusy(false); }
  }
  return <section className="downloads-page">
    <div className="page-heading"><div>
      <span className="eyebrow">READY WHEN YOU ARE</span><h1>Downloads</h1>
      <p>Save authorized video files for your offline library.</p>
    </div></div>
    {!api && <p role="status">Open Frame’s desktop app to download videos.</p>}
    <form className="download-form settings-panel" onSubmit={event => {
      event.preventDefault();
      if (api) void run(async () => { await api.add({ url: url.trim(), authorized }); setUrl(""); setAuthorized(false); });
    }}>
      <h2>Add a video</h2>
      <p>Paste a public HTTPS link to an MP4, WebM, or other supported video file. YouTube pages, streaming playlists, and links requiring sign-in are not supported. Maximum file size: 10 GiB.</p>
      <label htmlFor="download-url">Direct video URL</label>
      <input id="download-url" type="url" autoComplete="off" spellCheck={false} maxLength={4096}
        placeholder="https://example.com/video.mp4" value={url} onChange={event => setUrl(event.target.value)} disabled={!api || busy} required />
      <label className="download-permission"><input type="checkbox" checked={authorized}
        onChange={event => setAuthorized(event.target.checked)} disabled={!api || busy} required />
        I own this media or have permission to download it.</label>
      <div className="download-actions">
        <button type="button" className="secondary-button" disabled={!organization || busy} onClick={() => void run(async () => {
          setFolder(await organization!.chooseDownloadDirectory());
        })}>Choose download folder</button>
        <button className="primary-button" disabled={!api || busy || !authorized || !url.trim() || !folder}>Add to queue</button>
      </div>
      <p className="download-folder">{folder || "Choose a folder before adding a download."} Use an NTFS drive or another filesystem that supports hard links.</p>
    </form>
    {error && <p role="alert" className="download-error">{error}</p>}
    <div className="download-queue-heading"><h2>Download queue</h2><span>{items.length} / 200</span></div>
    <p>Downloads run one at a time and continue while you browse Frame. Retry restarts an unfinished transfer. Completed files are added to Offline Library automatically.</p>
    {!items.length && <div className="empty-state"><h2>Your queue is clear.</h2><p>Add a direct video link to get started.</p></div>}
    <ul className="download-list">{items.map(item => <li key={item.id} className="download-item">
      <div className="download-item-heading"><strong>{item.name}</strong><span>{item.state === "importing" ? "Adding to library" : item.state}</span></div>
      <p>{item.host} · {bytes(item.received)}{item.total !== null ? ` / ${bytes(item.total)}` : ""}</p>
      {item.state === "downloading" && <progress aria-label={`Download progress for ${item.name}`} max={item.total || undefined} value={item.total ? item.received : undefined} />}
      {item.error && <p className="download-error">{item.error}</p>}
      {item.state === "completed" && <p>Saved to your Offline Library. Removing this queue entry keeps the video.</p>}
      <div className="download-actions">
        {["queued", "downloading"].includes(item.state) && <button className="secondary-button" disabled={busy} onClick={() => void run(() => api!.cancel(item.id))}>Cancel<span className="sr-only"> {item.name}</span></button>}
        {["failed", "canceled"].includes(item.state) && <button className="secondary-button" disabled={busy} onClick={() => void run(() => api!.retry(item.id))}>Retry<span className="sr-only"> {item.name}</span></button>}
        {["failed", "canceled", "completed"].includes(item.state) && <button className="text-button" disabled={busy} onClick={() => void run(() => api!.remove(item.id))}>Remove from queue<span className="sr-only"> {item.name}</span></button>}
      </div>
    </li>)}</ul>
  </section>;
}
