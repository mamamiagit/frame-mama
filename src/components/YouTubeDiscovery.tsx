import { useEffect, useState } from "react";
import {
  Compass,
  Search,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Settings,
} from "lucide-react";
import type {
  YouTubeResult,
  YouTubeVideo,
} from "../../electron/youtube-types.cjs";
import YouTubeCard from "./YouTubeCard";
import "./YouTube.css";
const regions = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["IN", "India"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["BR", "Brazil"],
];
export default function YouTubeDiscovery({
  searchQuery,
  onSearch,
  onOpen,
  onSettings,
  onSavedChange,
}: {
  searchQuery: string;
  onSearch: (query: string) => void;
  onOpen: (video: YouTubeVideo) => void;
  onSettings: () => void;
  onSavedChange: () => void;
}) {
  const api = window.frame?.youtube;
  const [draft, setDraft] = useState(searchQuery);
  useEffect(() => setDraft(searchQuery), [searchQuery]);
  const [region, setRegion] = useState(() => {
    try {
      const stored = localStorage.getItem("frame-youtube-region");
      return regions.some((item) => item[0] === stored) ? stored! : "US";
    } catch {
      return "US";
    }
  });
  const [paging, setPaging] = useState<{
    query: string;
    region: string;
    tokens: (string | undefined)[];
    index: number;
  }>({ query: searchQuery, region, tokens: [undefined], index: 0 });
  const current =
    paging.query === searchQuery && paging.region === region
      ? paging
      : { query: searchQuery, region, tokens: [undefined], index: 0 };
  const token = current.tokens[current.index];
  const [result, setResult] = useState<YouTubeResult | null>(null),
    [loading, setLoading] = useState(Boolean(api));
  const [saved, setSaved] = useState<string[]>([]),
    [busy, setBusy] = useState<string[]>([]),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let canceled = false;
    if (!api) return;
    setLoading(true);
    setResult(null);
    setError("");
    api
      .list({ query: searchQuery, region, pageToken: token })
      .then((value) => {
        if (!canceled) {
          setResult(value);
          setSaved(value.ok ? value.savedIds || [] : []);
        }
      })
      .catch(() => {
        if (!canceled)
          setError("The request could not finish. Please try again.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [api, searchQuery, region, token, retry]);
  async function save(video: YouTubeVideo) {
    if (!api || busy.includes(video.id)) return;
    setBusy((items) => [...items, video.id]);
    setError("");
    try {
      const wasSaved = saved.includes(video.id);
      await (wasSaved ? api.unsave(video.id) : api.save(video.id));
      setSaved((items) =>
        wasSaved ? items.filter((id) => id !== video.id) : [...items, video.id],
      );
      onSavedChange();
    } catch {
      setError("Could not update saved links. Please try again.");
    } finally {
      setBusy((items) => items.filter((id) => id !== video.id));
    }
  }
  async function openBrowser(video: YouTubeVideo) {
    try {
      await api?.openBrowser(video.id);
    } catch {
      setError("Could not open your browser.");
    }
  }
  return (
    <section className="youtube-page">
      <div className="page-heading">
        <span className="eyebrow">
          <Compass size={14} />
          DISCOVER SOMETHING WORTH WATCHING
        </span>
        <h1>YouTube Discovery</h1>
        <p>Search real YouTube videos, or browse popular videos in a region.</p>
      </div>
      <section className="discovery-banner">
        <Compass size={26} />
        <div>
          <h2>Your actual YouTube homepage</h2>
          <p>
            The Data API does not expose your personalized homepage
            recommendations. Open YouTube in your browser to see your real feed.
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void window.frame
              ?.openYouTube()
              .catch(() => setError("Could not open your browser."));
          }}
        >
          Open YouTube
          <ExternalLink size={15} />
        </button>
      </section>
      <div className="youtube-toolbar">
        <form
          className="youtube-search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search YouTube"
            placeholder="Search YouTube videos"
            maxLength={200}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className="primary-button"
            disabled={!api || loading}
            type="submit"
          >
            Search
          </button>
        </form>
        <label className="youtube-region">
          Region
          <select
            aria-label="YouTube region"
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              try {
                localStorage.setItem(
                  "frame-youtube-region",
                  event.target.value,
                );
              } catch {}
            }}
          >
            {regions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="youtube-results-heading">
        <h2>
          {searchQuery
            ? `Results for “${searchQuery}”`
            : `Popular in ${regions.find((item) => item[0] === region)?.[1]}`}
        </h2>
        {searchQuery && (
          <button className="text-button" onClick={() => onSearch("")}>
            Browse popular videos
          </button>
        )}
      </div>
      {error && (
        <p className="youtube-error" role="alert">
          {error}
        </p>
      )}
      {!api ? (
        <div className="empty-state">
          <Compass size={30} />
          <h2>Open Frame to connect to YouTube.</h2>
          <p>
            Browser preview has no access to your API key. Use the desktop app
            for live discovery.
          </p>
          <button className="secondary-button" onClick={onSettings}>
            YouTube settings
          </button>
        </div>
      ) : loading ? (
        <div className="youtube-loading" role="status">
          <span />
          Loading YouTube videos…
        </div>
      ) : result && !result.ok ? (
        <div className="empty-state">
          <Search size={30} />
          <h2>
            {result.code === "missing_key"
              ? "Connect your YouTube API key."
              : "YouTube is unavailable right now."}
          </h2>
          <p>{result.message}</p>
          <div className="youtube-actions">
            <button
              className="primary-button"
              onClick={
                result.code === "missing_key"
                  ? onSettings
                  : () => setRetry((value) => value + 1)
              }
            >
              {result.code === "missing_key" ? <Settings size={16} /> : null}
              {result.code === "missing_key"
                ? "Open YouTube settings"
                : "Try again"}
            </button>
            {result.code !== "missing_key" && (
              <button className="secondary-button" onClick={onSettings}>
                Check key settings
              </button>
            )}
          </div>
        </div>
      ) : result?.ok && result.items.length ? (
        <>
          <div className="video-grid youtube-grid">
            {result.items.map((video) => (
              <YouTubeCard
                key={video.id}
                video={video}
                saved={saved.includes(video.id)}
                busy={busy.includes(video.id)}
                onOpen={() => onOpen(video)}
                onSave={() => void save(video)}
                onBrowser={() => void openBrowser(video)}
              />
            ))}
          </div>
          <div className="library-pagination">
            <button
              className="secondary-button"
              disabled={!current.index}
              onClick={() =>
                setPaging({ ...current, index: current.index - 1 })
              }
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>Page {current.index + 1}</span>
            <button
              className="secondary-button"
              disabled={!result.nextPageToken}
              onClick={() =>
                setPaging({
                  ...current,
                  tokens: [
                    ...current.tokens.slice(0, current.index + 1),
                    result.nextPageToken!,
                  ],
                  index: current.index + 1,
                })
              }
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      ) : result?.ok ? (
        <div className="empty-state">
          <Search size={30} />
          <h2>No videos found.</h2>
          <p>
            Try different search words or another region. Some videos cannot be
            embedded.
          </p>
        </div>
      ) : error ? (
        <button
          className="secondary-button"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry
        </button>
      ) : null}
      <footer className="content-footer">
        <span>
          YouTube Data API · Public results, not personalized recommendations
        </span>
        <span>Watch online · Save links locally</span>
      </footer>
    </section>
  );
}
