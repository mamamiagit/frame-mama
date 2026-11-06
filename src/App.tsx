import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Compass,
  ExternalLink,
  FolderOpen,
  History,
  Home,
  ListVideo,
  Menu,
  Moon,
  Play,
  Search,
  Settings,
  Sun,
  WifiOff,
  X,
} from "lucide-react";
import { categories, filterVideos, videos, type Video } from "./catalog";
import VideoCard from "./components/VideoCard";
import Artwork from "./components/Artwork";
import AppearancePicker from "./components/AppearancePicker";
import { readColorway, type Colorway } from "./appearance";
import LocalPlayer from "./components/LocalPlayer";
import PlaybackHistory from "./components/PlaybackHistory";
import type { LocalVideo } from "../electron/library-types.cjs";
import YouTubeDiscovery from "./components/YouTubeDiscovery";
import YouTubeSettings from "./components/YouTubeSettings";
import YouTubeWatch from "./components/YouTubeWatch";
import SavedYouTube from "./components/SavedYouTube";
import PlaylistsPage from "./components/PlaylistsPage";
import PlaylistPlayback from "./components/PlaylistPlayback";
import LocalWatchLater from "./components/LocalWatchLater";
import OrganizationSettings from "./components/OrganizationSettings";
import type { PlaylistDetail } from "../electron/organization-types.cjs";
import type { YouTubeVideo } from "../electron/youtube-types.cjs";
import OfflineLibrary from "./components/OfflineLibrary";
import DownloadsPage from "./components/DownloadsPage";
import ConfirmationDialog from "./components/ConfirmationDialog";

const navigation = [
  { name: "Home", icon: Home },
  { name: "YouTube Discovery", icon: Compass },
  { name: "Downloads", icon: ArrowDownToLine },
  { name: "Watch Later", icon: Bookmark },
  { name: "History", icon: History },
  { name: "Playlists", icon: ListVideo },
  { name: "Offline Library", icon: FolderOpen },
];

export default function App() {
  const [page, setPage] = useState("Home");
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState("All");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [localPlayback, setLocalPlayback] = useState<{
    video: LocalVideo;
    queue: LocalVideo[];
  } | null>(null);
  const [playlistPlayback, setPlaylistPlayback] = useState<{
    detail: PlaylistDetail;
    entry?: string;
  } | null>(null);
  const [lastPlaylist, setLastPlaylist] = useState("");
  const [collectionDialogs, setCollectionDialogs] = useState(0);
  const [localLaterCount, setLocalLaterCount] = useState(0);
  useEffect(() => {
    const dialog = (event: Event) =>
      setCollectionDialogs((value) =>
        Math.max(0, value + (event as CustomEvent<number>).detail),
      );
    const refresh = () => setSavedRevision((value) => value + 1);
    window.addEventListener("frame:dialog", dialog);
    window.addEventListener("frame:collections-changed", refresh);
    return () => {
      window.removeEventListener("frame:dialog", dialog);
      window.removeEventListener("frame:collections-changed", refresh);
    };
  }, []);
  const [youtubeVideo, setYouTubeVideo] = useState<YouTubeVideo | null>(null);
  const [savedRevision, setSavedRevision] = useState(0);
  const [youtubeSavedCount, setYouTubeSavedCount] = useState(0);
  useEffect(() => {
    let canceled = false;
    window.frame?.organization
      .localLaterCount()
      .then((value) => {
        if (!canceled) setLocalLaterCount(value);
      })
      .catch(() => {});
    window.frame?.youtube
      .saved("", 0)
      .then((result) => {
        if (!canceled) setYouTubeSavedCount(result.total);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [savedRevision]);
  function savedChanged() {
    setSavedRevision((value) => value + 1);
  }
  function watchYouTube(video: YouTubeVideo) {
    setPlaylistPlayback(null);
    setSelected(null);
    setLocalPlayback(null);
    setYouTubeVideo(video);
  }
  const [selected, setSelected] = useState<Video | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [about, setAbout] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("frame-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [colorway, setColorway] = useState<Colorway>(readColorway);
  useEffect(() => {
    document.documentElement.dataset.colorway = colorway;
    try {
      localStorage.setItem("frame-colorway", colorway);
    } catch {
      /* Color selection remains usable without storage. */
    }
  }, [colorway]);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!about) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons =
        dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [about]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("frame-theme", theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);
  useEffect(() => {
    window.frame
      ?.getAppInfo()
      .then((info) => setVersion(info.version))
      .catch(() => setNotice("Desktop app information is unavailable."));
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Escape" && event.target instanceof Element && event.target.closest('[role="dialog"],[role="alertdialog"]'))) return;
      if (event.key === "Escape") {
        setAbout(false);
        setSelected(null);
      }
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  function playLocal(video: LocalVideo, queue: LocalVideo[]) {
    setPlaylistPlayback(null);
    setYouTubeVideo(null);
    setSelected(null);
    setLocalPlayback({ video, queue });
  }
  function navigate(next: string) {
    setPlaylistPlayback(null);
    setYouTubeVideo(null);
    setLocalPlayback(null);
    setPage(next);
    setSelected(null);
    setQuery("");
    setInput("");
    setCategory("All");
  }
  function toggleSave(id: string) {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function openYouTube() {
    if (!window.frame) {
      window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
      return;
    }
    try {
      await window.frame.openYouTube();
    } catch {
      setNotice("Could not open your browser. Please visit youtube.com.");
    }
  }
  const filtered = filterVideos(
    page === "Watch Later"
      ? videos.filter((video) => saved.includes(video.id))
      : videos,
    query,
    category,
  );

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar">
        <div className="brand-group">
          <button
            className="icon-button menu-toggle"
            aria-label="Toggle sidebar"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={22} />
          </button>
          <button
            className="brand"
            onClick={() => navigate("Home")}
            aria-label="Frame home"
          >
            <span className="brand-mark">
              <Play size={17} fill="currentColor" />
            </span>
            frame<span className="brand-dot">.</span>
            <span className="desktop-tag">DESKTOP</span>
          </button>
        </div>
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            setPlaylistPlayback(null);
            setYouTubeVideo(null);
            setQuery(input.trim());
            setSelected(null);
            setLocalPlayback(null);
            if (
              ![
                "Home",
                "YouTube Discovery",
                "Watch Later",
                "Offline Library",
              ].includes(page)
            )
              setPage("Home");
          }}
        >
          <Search size={19} className="search-leading" />
          <input
            ref={searchRef}
            aria-label={
              page === "Offline Library"
                ? "Search library from header"
                : page === "YouTube Discovery"
                  ? "Search YouTube from header"
                  : page === "Watch Later"
                    ? "Search saved YouTube links"
                    : "Search sample videos"
            }
            maxLength={
              page === "Home" || page === "Offline Library" ? 300 : 200
            }
            placeholder={
              page === "Offline Library"
                ? "Search your local videos"
                : page === "YouTube Discovery"
                  ? "Search YouTube videos"
                  : page === "Watch Later"
                    ? "Search saved links"
                    : "Search something worth watching"
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          {input && (
            <button
              type="button"
              className="clear-search"
              aria-label="Clear search"
              onClick={() => {
                setInput("");
                setQuery("");
              }}
            >
              <X size={16} />
            </button>
          )}
          <kbd>/</kbd>
          <button className="search-submit" aria-label="Search">
            <Search size={20} />
          </button>
        </form>
        <div className="header-actions">
          <span className="local-status">
            <span />
            Your personal space
          </span>
          <button
            className="icon-button theme-toggle"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            className="profile"
            aria-label="About Frame"
            onClick={() => setAbout(true)}
          >
            F
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }, index) => (
            <div key={name}>
              {index === 2 && (
                <div className="nav-divider">
                  <span>YOUR SPACE</span>
                </div>
              )}
              <button
                title={collapsed ? name : undefined}
                className={`nav-item ${page === name ? "active" : ""}`}
                aria-current={page === name ? "page" : undefined}
                onClick={() => navigate(name)}
              >
                <Icon size={21} />
                <span>{name}</span>
                {name === "Watch Later" &&
                  saved.length + youtubeSavedCount + localLaterCount > 0 && (
                    <small>
                      {saved.length + youtubeSavedCount + localLaterCount}
                    </small>
                  )}
                {name === "YouTube Discovery" && (
                  <ExternalLink size={13} className="nav-extra" />
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-note">
            <span className="offline-icon">
              <WifiOff size={20} />
            </span>
            <strong>A little less online.</strong>
            <p>A little more your own.</p>
            <span>
              Your offline library, right here <ArrowRight size={13} />
            </span>
          </div>
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
            aria-current={page === "Settings" ? "page" : undefined}
          >
            <Settings size={21} />
            <span>Settings</span>
          </button>
          <button className="nav-item" onClick={() => setAbout(true)}>
            <CircleHelp size={21} />
            <span>About Frame</span>
          </button>
          <p className="sidebar-footer">
            A space for what moves you.
            <br />
            <span>FRAME © {new Date().getFullYear()}</span>
          </p>
        </div>
      </aside>

      <main className="main-content" id="main-content">
        {playlistPlayback ? (
          <PlaylistPlayback
            detail={playlistPlayback.detail}
            initialEntry={playlistPlayback.entry}
            onBack={() => setPlaylistPlayback(null)}
            onSavedChange={savedChanged}
            obscured={about || collectionDialogs > 0}
          />
        ) : youtubeVideo ? (
          <YouTubeWatch
            key={youtubeVideo.id}
            video={youtubeVideo}
            obscured={about || collectionDialogs > 0}
            onBack={() => setYouTubeVideo(null)}
            onSavedChange={savedChanged}
          />
        ) : localPlayback ? (
          <LocalPlayer
            key={localPlayback.video.id}
            video={localPlayback.video}
            queue={localPlayback.queue}
            onSelect={(video) => playLocal(video, localPlayback.queue)}
            onBack={() => setLocalPlayback(null)}
          />
        ) : selected ? (
          <>
            <button
              className="text-button back-button"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft size={16} /> Back to {page}
            </button>
            <div className="watch-layout">
              <section>
                <div className="watch-stage">
                  <Artwork kind={selected.artwork} title={selected.title} />
                  <div className="watch-overlay">
                    <Clapperboard size={36} />
                    <h2>A glimpse of what’s coming.</h2>
                    <p>
                      This is sample artwork. Play your own videos in Offline
                      Library.
                    </p>
                  </div>
                </div>
                <h1 className="watch-title">{selected.title}</h1>
                <div className="watch-channel">
                  <span
                    className="avatar"
                    style={{ background: selected.color }}
                  >
                    {selected.channel[0]}
                  </span>
                  <div>
                    <strong>{selected.channel}</strong>
                    <p>Demonstration channel</p>
                  </div>
                  <button
                    className="secondary-button save-button"
                    onClick={() => toggleSave(selected.id)}
                  >
                    {saved.includes(selected.id) ? (
                      <Check size={17} />
                    ) : (
                      <Bookmark size={17} />
                    )}
                    {saved.includes(selected.id)
                      ? "Saved for this session"
                      : "Save sample for later"}
                  </button>
                </div>
                <div className="description">
                  <strong>
                    Sample video · {selected.duration} · {selected.category}
                  </strong>
                  <p>
                    Original sample artwork and metadata for the Frame
                    interface. This is not a YouTube video. Your own local
                    videos can be played in Offline Library. Find real online
                    videos in YouTube Discovery.
                  </p>
                </div>
              </section>
              <aside className="recommendations">
                <h2>
                  More to explore <span>SAMPLES</span>
                </h2>
                {videos
                  .filter((video) => video.id !== selected.id)
                  .slice(0, 4)
                  .map((video) => (
                    <button
                      key={video.id}
                      className="recommendation"
                      onClick={() => setSelected(video)}
                    >
                      <Artwork kind={video.artwork} title={video.title} />
                      <div>
                        <strong>{video.title}</strong>
                        <span>{video.channel}</span>
                        <small>{video.duration}</small>
                      </div>
                    </button>
                  ))}
              </aside>
            </div>
          </>
        ) : page === "Downloads" ? (
          <DownloadsPage />
        ) : page === "Offline Library" ? (
          <OfflineLibrary searchQuery={query} onPlay={playLocal} />
        ) : page === "History" ? (
          <PlaybackHistory onPlay={playLocal} onYouTube={watchYouTube} />
        ) : page === "Playlists" ? (
          <PlaylistsPage
            initialId={lastPlaylist}
            onPlay={(detail, entry) => {
              setLastPlaylist(detail.playlist.id);
              setPlaylistPlayback({ detail, entry });
            }}
          />
        ) : page === "YouTube Discovery" ? (
          <YouTubeDiscovery
            searchQuery={query}
            onSearch={(value) => {
              setInput(value);
              setQuery(value);
            }}
            onOpen={watchYouTube}
            onSettings={() => navigate("Settings")}
            onSavedChange={savedChanged}
          />
        ) : page === "Watch Later" ? (
          <>
            <SavedYouTube
              searchQuery={query}
              onOpen={watchYouTube}
              onSavedChange={savedChanged}
              hasSamples={saved.length > 0}
            />
            <LocalWatchLater query={query} onPlay={playLocal} />
            {saved.length > 0 && (
              <section className="saved-sample-section">
                <h2>Session-only samples</h2>
                <p>
                  These are demonstration cards, separate from your persistent
                  YouTube links.
                </p>
                <div className="video-grid">
                  {filtered.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      saved={saved.includes(video.id)}
                      onOpen={() => setSelected(video)}
                      onSave={() => toggleSave(video.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : page === "Settings" ? (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h1>Settings</h1>
                <p>The details that make this space yours.</p>
              </div>
            </div>
            <div className="settings-panel">
              <h2>Appearance</h2>
              <div className="setting-row">
                <div>
                  <strong>App theme</strong>
                  <p>Choose the light that feels right.</p>
                </div>
                <div className="segmented">
                  <button
                    className={theme === "dark" ? "selected" : ""}
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                  <button
                    className={theme === "light" ? "selected" : ""}
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                </div>
              </div>
              <AppearancePicker
                value={colorway}
                mode={theme}
                onChange={setColorway}
              />
              <YouTubeSettings />
              <OrganizationSettings />
              <h2>Application</h2>
              <div className="setting-row">
                <div>
                  <strong>Frame {version}</strong>
                  <p>
                    Offline library preview ·{" "}
                    {window.frame ? "Electron desktop" : "Browser preview"}
                  </p>
                </div>
                <button className="text-button" onClick={() => setAbout(true)}>
                  About <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="category-bar" aria-label="Video categories">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`category-chip ${category === item ? "selected" : ""}`}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {page === "Home" && !query && category === "All" && (
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span /> YOUR WORLD, ON YOUR TERMS
                  </span>
                  <h1>
                    Good videos.
                    <br />
                    <span>Great company.</span>
                  </h1>
                  <p>
                    A space to discover, collect, and come back to.
                    <br />
                    All the things you love, a little closer.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => navigate("Offline Library")}
                  >
                    <FolderOpen size={17} />
                    Explore your library <ArrowRight size={16} />
                  </button>
                  <div className="hero-footnote">
                    <span />
                    Thoughtfully made for your desktop
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-mini mini-back">
                    <Artwork kind="ocean" title="" />
                  </div>
                  <div className="hero-mini mini-front">
                    <Artwork kind="mountains" title="" />
                    <div className="hero-mini-caption">
                      <span className="tiny-play">
                        <Play size={11} fill="currentColor" />
                      </span>
                      <div>
                        Your next little escape.<small>Waiting for you.</small>
                      </div>
                      <Bookmark size={16} />
                    </div>
                  </div>
                  <span className="float-label">
                    <span /> A world worth watching
                  </span>
                </div>
              </section>
            )}
            <div className="section-heading">
              <div>
                <h1>
                  {query
                    ? `Results for “${query}”`
                    : page === "Watch Later"
                      ? "A little something for later"
                      : category !== "All"
                        ? category
                        : "Find your next favorite"}
                </h1>
                <p>
                  {page === "Watch Later"
                    ? "Saved samples for this session. Persistent collections arrive in Phase 7."
                    : "A few possibilities, a fresh perspective."}
                </p>
              </div>
              <span className="demo-badge">
                <span />
                SAMPLE COLLECTION
              </span>
            </div>
            {filtered.length ? (
              <div className="video-grid">
                {filtered.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    saved={saved.includes(video.id)}
                    onOpen={() => setSelected(video)}
                    onSave={() => toggleSave(video.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <Search size={30} />
                <h2>
                  {page === "Watch Later" && !saved.length
                    ? "Keep a little inspiration."
                    : "Nothing here just yet."}
                </h2>
                <p>
                  {page === "Watch Later" && !saved.length
                    ? "Use the bookmark on a sample video to try Watch Later."
                    : "Try another search or choose a different category."}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => navigate("Home")}
                >
                  Browse all samples
                </button>
              </div>
            )}
            <footer className="content-footer">
              <span>
                <Clapperboard size={15} /> Curiosity looks good on you.
              </span>
              <span>Interface preview · No live recommendations</span>
            </footer>
          </>
        )}
      </main>
      <ConfirmationDialog />
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="about-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close about"
              onClick={() => setAbout(false)}
            >
              <X />
            </button>
            <span className="brand-mark">
              <Play size={20} fill="currentColor" />
            </span>
            <h2 id="about-title">A little more Frame.</h2>
            <p>Your personal desktop video space. Version {version}.</p>
            <p>
              Frame now imports local videos with SQLite metadata and generated
              thumbnails in Offline Library. Home cards remain labeled samples.
              Local playback and history are available in Offline Library.
              Discover YouTube videos online, organize playlists, or download
              authorized direct video links for offline viewing.
            </p>
            <button className="primary-button" onClick={() => setAbout(false)}>
              Make yourself at home <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
