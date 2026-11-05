import { Bookmark, Check, MoreHorizontal } from 'lucide-react';
import type { Video } from '../catalog';
import Artwork from './Artwork';

export default function VideoCard({ video, saved, onOpen, onSave }: { video: Video; saved: boolean; onOpen: () => void; onSave: () => void }) {
  return <article className="video-card">
    <button className="thumbnail" onClick={onOpen} aria-label={`View ${video.title}`}>
      <Artwork kind={video.artwork} title={video.title} /><span className="duration">{video.duration}</span>
      <span className="thumbnail-play">▶</span>
    </button>
    <div className="card-details"><span className="avatar" style={{ background: video.color }}>{video.channel.slice(0, 1)}</span>
      <div className="card-copy"><button className="video-title" onClick={onOpen}>{video.title}</button><p>{video.channel} <span className="verified">✓</span></p><p>{video.views} sample views · {video.age}</p></div>
      <button className={`icon-button card-save ${saved ? 'is-saved' : ''}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${video.title}`} title={saved ? 'Remove from Watch Later' : 'Save sample for later'} onClick={onSave}>{saved ? <Check size={17} /> : <Bookmark size={17} />}</button>
    </div>
    <span className="sample-label"><MoreHorizontal size={12} /> Sample content</span>
  </article>;
}
