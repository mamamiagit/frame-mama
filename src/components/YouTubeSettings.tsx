import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Trash2, FileKey } from "lucide-react";
import type { YouTubeStatus } from "../../electron/youtube-types.cjs";
import "./YouTube.css";

export default function YouTubeSettings() {
  const api = window.frame?.youtube;
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    api
      ?.status()
      .then((result) => {
        if (!canceled) setStatus(result);
      })
      .catch(() => {
        if (!canceled) setError("Could not read YouTube configuration.");
      });
    return () => {
      canceled = true;
    };
  }, [api]);
  async function change(remove = false) {
    if (!api || busy) return;
    setBusy(true);
    setError("");
    try {
      setStatus(await (remove ? api.clearKey() : api.importKey()));
    } catch {
      setError(
        "The key could not be updated. Use a small UTF-8 text file containing only your API key. Secure OS storage must be available.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="youtube-settings">
      <h2>YouTube connection</h2>
      <div className="youtube-key-heading">
        <span className="empty-icon">
          <KeyRound size={24} />
        </span>
        <div>
          <strong>
            {status?.configured
              ? "API key configured"
              : "Connect YouTube discovery"}
          </strong>
          <p>
            {status?.source === "environment"
              ? "Using FRAME_YOUTUBE_API_KEY from the main process environment."
              : status?.source === "encrypted-file"
                ? "Saved locally with operating-system encryption."
                : "Your own YouTube Data API v3 key enables search and popular videos."}
          </p>
        </div>
      </div>
      <ol className="youtube-setup-steps">
        <li>
          Enable <strong>YouTube Data API v3</strong> in your Google Cloud
          project and create an API key restricted to that API.
        </li>
        <li>
          Put only the key in a small UTF-8 <strong>.txt</strong> file on your
          computer.
        </li>
        <li>
          Choose <strong>Import key file</strong>. Frame encrypts its copy with
          the OS; the key never enters the app renderer or source code.
        </li>
      </ol>
      <p className="youtube-fine-print">
        Keep the original key file private or delete it after importing. A
        distributed desktop app cannot make a key extract-proof. Restrict the
        API, monitor quota, and rotate your key if exposed. Search uses more
        quota than popular-video browsing.
      </p>
      {!api && (
        <p className="youtube-notice">
          Configure the key in the Electron desktop app. Browser preview has no
          credential access.
        </p>
      )}
      {status && !status.secureStorage && (
        <p className="youtube-notice">
          Secure OS storage is unavailable on this machine. Use the
          FRAME_YOUTUBE_API_KEY environment variable when launching Electron;
          Frame will not save a plaintext key.
        </p>
      )}
      {error && (
        <p className="youtube-error" role="alert">
          {error}
        </p>
      )}
      <div className="youtube-actions">
        <button
          className="secondary-button"
          disabled={
            !api ||
            busy ||
            !status?.secureStorage ||
            status.source === "environment"
          }
          onClick={() => void change()}
        >
          <FileKey size={16} />
          {busy ? "Updating…" : "Import key file"}
        </button>
        <button
          className="text-button"
          disabled={busy || status?.source !== "encrypted-file"}
          onClick={() => void change(true)}
        >
          <Trash2 size={15} />
          Forget saved key
        </button>
      </div>
      <p className="youtube-fine-print">
        <ShieldCheck size={14} />
        Only configured status is returned to this interface. The key is sent
        only to Google’s YouTube API over HTTPS.
      </p>
    </section>
  );
}
