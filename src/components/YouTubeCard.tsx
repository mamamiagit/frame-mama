import { Bookmark, Check, Play, ExternalLink, Wifi } from "lucide-react";
import type { YouTubeVideo } from "../../electron/youtube-types.cjs";
import AddToPlaylist from "./AddToPlaylist";
import { useOnlineStatus } from "../useOnlineStatus";
import { formatDuration } from "./OfflineLibrary";
export default function YouTubeCard({
  video,
  saved,
  busy,
  onOpen,
  onSave,
  onBrowser,
}: {
  video: YouTubeVideo;
  saved: boolean;
  busy: boolean;
  onOpen: () => void;
  onSave: () => void;
  onBrowser: () => void;
}) {
  const online = useOnlineStatus();
  return (
    <article className="youtube-card">
      <button
        className="youtube-thumbnail"
        aria-label={`Watch ${video.title}`}
        onClick={onOpen}
      >
        <span className="youtube-image-fallback">
          <Play size={35} />
          <small>YouTube video</small>
        </span>
        {video.thumbnail && (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="youtube-online-label">
          <Wifi size={11} />
          {online ? "Online only" : "Unavailable offline"}
        </span>
        <span className="duration">
          {video.live
            ? "LIVE"
            : video.duration === null
              ? "YouTube"
              : formatDuration(video.duration)}
        </span>
      </button>
      <div className="youtube-card-copy">
        <button className="video-title" onClick={onOpen}>
          {video.title}
        </button>
        <p>{video.channel}</p>
        <p>
          {video.views
            ? `${new Intl.NumberFormat(undefined, { notation: "compact" }).format(Number(video.views))} views`
            : "Saved link"}
          {video.publishedAt
            ? ` · ${new Date(video.publishedAt).toLocaleDateString()}`
            : ""}
        </p>
        <div className="youtube-card-actions">
          <AddToPlaylist
            source={{ kind: "youtube", id: video.id }}
            title={video.title}
          />
          <button
            className="text-button"
            disabled={busy}
            aria-label={`${saved ? "Unsave" : "Save"} ${video.title}`}
            onClick={onSave}
          >
            {saved ? <Check size={15} /> : <Bookmark size={15} />}{" "}
            {saved ? "Saved" : "Save for later"}
          </button>
          <button
            className="icon-button"
            aria-label={`Open ${video.title} on YouTube`}
            onClick={onBrowser}
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
