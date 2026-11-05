import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, CircleHelp, Clapperboard, Compass, ExternalLink, FolderOpen, History, Home, ListVideo, Menu, Moon, Play, Search, Settings, Sun, WifiOff, X } from 'lucide-react';
import { categories, filterVideos, videos, type Video } from './catalog';
import VideoCard from './components/VideoCard';
import Artwork from './components/Artwork';

const navigation = [
  { name: 'Home', icon: Home }, { name: 'YouTube Discovery', icon: Compass },
  { name: 'Downloads', icon: ArrowDownToLine }, { name: 'Watch Later', icon: Bookmark },
  { name: 'History', icon: History }, { name: 'Playlists', icon: ListVideo },
  { name: 'Offline Library', icon: FolderOpen },
];
const emptyPages: Record<string, { title: string; body: string; phase: string }> = {
  Downloads: { title: 'Good things, ready to go.', body: 'Your authorized downloads will appear here, with progress, queue controls, and a home in your offline library.', phase: 'Download management is planned for Phase 6.' },
  History: { title: 'Pick up where you left off.', body: 'Once playback is available, your recently watched videos and resume positions will live here.', phase: 'Playback history is planned for Phases 4 and 7.' },
  Playlists: { title: 'Make a collection your own.', body: 'Bring local videos and saved YouTube links together in personal playlists.', phase: 'Playlist management is planned for Phase 7.' },
  'Offline Library': { title: 'Your favorites. Everywhere.', body: 'A private home for your local videos. Import, organize, and watch without a connection.', phase: 'Local importing and indexing are next, in Phase 3.' },
};

export default function App() {
  const [page, setPage] = useState('Home');
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState('All');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Video | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [about, setAbout] = useState(false);
  const [version, setVersion] = useState('0.1.0');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('frame-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!about) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [about]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('frame-theme', theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);
  useEffect(() => { window.frame?.getAppInfo().then(info => setVersion(info.version)).catch(() => setNotice('Desktop app information is unavailable.')); }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAbout(false); setSelected(null); }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);

  function navigate(next: string) { setPage(next); setSelected(null); setQuery(''); setInput(''); setCategory('All'); }
  function toggleSave(id: string) { setSaved(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  async function openYouTube() {
    if (!window.frame) { window.open('https://www.youtube.com/', '_blank', 'noopener,noreferrer'); return; }
    try { await window.frame.openYouTube(); } catch { setNotice('Could not open your browser. Please visit youtube.com.'); }
  }
  const filtered = filterVideos(page === 'Watch Later' ? videos.filter(video => saved.includes(video.id)) : videos, query, category);
  const activeEmpty = emptyPages[page];

  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <header className="topbar">
      <div className="brand-group"><button className="icon-button menu-toggle" aria-label="Toggle sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Menu size={22} /></button><button className="brand" onClick={() => navigate('Home')} aria-label="Frame home"><span className="brand-mark"><Play size={17} fill="currentColor" /></span>frame<span className="brand-dot">.</span><span className="desktop-tag">DESKTOP</span></button></div>
      <form className="search" onSubmit={event => { event.preventDefault(); setQuery(input.trim()); setSelected(null); if (!['Home', 'YouTube Discovery', 'Watch Later'].includes(page)) setPage('Home'); }}>
        <Search size={19} className="search-leading" /><input ref={searchRef} aria-label="Search sample videos" placeholder="Search something worth watching" value={input} onChange={event => setInput(event.target.value)} />{input && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => { setInput(''); setQuery(''); }}><X size={16} /></button>}<kbd>/</kbd><button className="search-submit" aria-label="Search"><Search size={20} /></button>
      </form>
      <div className="header-actions"><span className="local-status"><span />Your personal space</span><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button><button className="profile" aria-label="About Frame" onClick={() => setAbout(true)}>F</button></div>
    </header>

    <aside className="sidebar"><nav aria-label="Main navigation">
      {navigation.map(({ name, icon: Icon }, index) => <div key={name}>{index === 2 && <div className="nav-divider"><span>YOUR SPACE</span></div>}<button title={collapsed ? name : undefined} className={`nav-item ${page === name ? 'active' : ''}`} aria-current={page === name ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={21} /><span>{name}</span>{name === 'Watch Later' && saved.length > 0 && <small>{saved.length}</small>}{name === 'YouTube Discovery' && <ExternalLink size={13} className="nav-extra" />}</button></div>)}
    </nav>
      <div className="sidebar-bottom"><div className="offline-note"><span className="offline-icon"><WifiOff size={20} /></span><strong>A little less online.</strong><p>A little more your own.</p><span>Offline library coming in Phase 3 <ArrowRight size={13} /></span></div><button className={`nav-item ${page === 'Settings' ? 'active' : ''}`} onClick={() => navigate('Settings')} aria-current={page === 'Settings' ? 'page' : undefined}><Settings size={21} /><span>Settings</span></button><button className="nav-item" onClick={() => setAbout(true)}><CircleHelp size={21} /><span>About Frame</span></button><p className="sidebar-footer">A space for what moves you.<br /><span>FRAME © {new Date().getFullYear()}</span></p></div>
    </aside>

    <main className="main-content" id="main-content">
      {selected ? <>
        <button className="text-button back-button" onClick={() => setSelected(null)}><ArrowLeft size={16} /> Back to {page}</button>
        <div className="watch-layout"><section><div className="watch-stage"><Artwork kind={selected.artwork} title={selected.title} /><div className="watch-overlay"><Clapperboard size={36} /><h2>A glimpse of what’s coming.</h2><p>This is a sample video. Playback arrives in later phases.</p></div></div><h1 className="watch-title">{selected.title}</h1><div className="watch-channel"><span className="avatar" style={{ background: selected.color }}>{selected.channel[0]}</span><div><strong>{selected.channel}</strong><p>Demonstration channel</p></div><button className="secondary-button save-button" onClick={() => toggleSave(selected.id)}>{saved.includes(selected.id) ? <Check size={17} /> : <Bookmark size={17} />}{saved.includes(selected.id) ? 'Saved for this session' : 'Save sample for later'}</button></div><div className="description"><strong>Sample video · {selected.duration} · {selected.category}</strong><p>Original sample artwork and metadata for the Frame interface. This is not a YouTube video. Local playback is planned for Phase 4, and official YouTube discovery and embedded playback for Phase 5.</p></div></section><aside className="recommendations"><h2>More to explore <span>SAMPLES</span></h2>{videos.filter(video => video.id !== selected.id).slice(0, 4).map(video => <button key={video.id} className="recommendation" onClick={() => setSelected(video)}><Artwork kind={video.artwork} title={video.title} /><div><strong>{video.title}</strong><span>{video.channel}</span><small>{video.duration}</small></div></button>)}</aside></div>
      </> : page === 'Settings' ? <>
        <div className="page-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Settings</h1><p>The details that make this space yours.</p></div></div>
        <div className="settings-panel"><h2>Appearance</h2><div className="setting-row"><div><strong>App theme</strong><p>Choose the light that feels right.</p></div><div className="segmented"><button className={theme === 'dark' ? 'selected' : ''} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={16} />Dark</button><button className={theme === 'light' ? 'selected' : ''} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Sun size={16} />Light</button></div></div><h2>Your library</h2>{['Download location', 'Library directories', 'Playback preferences', 'Storage & thumbnail cache'].map(label => <div className="setting-row" key={label}><div><strong>{label}</strong><p>Available when the corresponding feature is implemented.</p></div><span className="coming-tag">Planned</span></div>)}<h2>Application</h2><div className="setting-row"><div><strong>Frame {version}</strong><p>Foundation & interface preview · {window.frame ? 'Electron desktop' : 'Browser preview'}</p></div><button className="text-button" onClick={() => setAbout(true)}>About <ChevronRight size={16} /></button></div></div>
      </> : activeEmpty ? <>
        <div className="page-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>{page}</h1><p>Built around the things you want to keep.</p></div></div><div className="empty-state"><span className="empty-icon">{page === 'Downloads' ? <ArrowDownToLine /> : page === 'History' ? <History /> : page === 'Playlists' ? <ListVideo /> : <FolderOpen />}</span><h2>{activeEmpty.title}</h2><p>{activeEmpty.body}</p><span className="phase-label">{activeEmpty.phase}</span><button className="primary-button" onClick={() => navigate('Home')}>Explore the interface <ArrowRight size={16} /></button></div>
      </> : <>
        <div className="category-bar" aria-label="Video categories">{categories.map(item => <button key={item} className={`category-chip ${category === item ? 'selected' : ''}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
        {page === 'Home' && !query && category === 'All' && <section className="hero"><div className="hero-copy"><span className="eyebrow"><span /> YOUR WORLD, ON YOUR TERMS</span><h1>Good videos.<br /><span>Great company.</span></h1><p>A space to discover, collect, and come back to.<br />All the things you love, a little closer.</p><button className="primary-button" onClick={() => navigate('Offline Library')}><FolderOpen size={17} />Explore your library <ArrowRight size={16} /></button><div className="hero-footnote"><span />Thoughtfully made for your desktop</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-mini mini-back"><Artwork kind="ocean" title="" /></div><div className="hero-mini mini-front"><Artwork kind="mountains" title="" /><div className="hero-mini-caption"><span className="tiny-play"><Play size={11} fill="currentColor" /></span><div>Your next little escape.<small>Waiting for you.</small></div><Bookmark size={16} /></div></div><span className="float-label"><span /> A world worth watching</span></div></section>}
        {page === 'YouTube Discovery' && <section className="discovery-banner"><Compass size={28} /><div><h2>Your YouTube, one click away.</h2><p>Open your actual homepage in your browser. API discovery comes in Phase 5; personalized homepage recommendations are not exposed by the YouTube Data API.</p></div><button className="secondary-button" onClick={openYouTube}>Open YouTube <ExternalLink size={16} /></button></section>}
        <div className="section-heading"><div><h1>{query ? `Results for “${query}”` : page === 'Watch Later' ? 'A little something for later' : category !== 'All' ? category : 'Find your next favorite'}</h1><p>{page === 'Watch Later' ? 'Saved samples for this session. Persistent collections arrive in Phase 7.' : 'A few possibilities, a fresh perspective.'}</p></div><span className="demo-badge"><span />SAMPLE COLLECTION</span></div>
        {filtered.length ? <div className="video-grid">{filtered.map(video => <VideoCard key={video.id} video={video} saved={saved.includes(video.id)} onOpen={() => setSelected(video)} onSave={() => toggleSave(video.id)} />)}</div> : <div className="empty-state compact"><Search size={30} /><h2>{page === 'Watch Later' && !saved.length ? 'Keep a little inspiration.' : 'Nothing here just yet.'}</h2><p>{page === 'Watch Later' && !saved.length ? 'Use the bookmark on a sample video to try Watch Later.' : 'Try another search or choose a different category.'}</p><button className="secondary-button" onClick={() => navigate('Home')}>Browse all samples</button></div>}
        <footer className="content-footer"><span><Clapperboard size={15} /> Curiosity looks good on you.</span><span>Interface preview · No live recommendations</span></footer>
      </>}
    </main>
    {notice && <div className="toast" role="status">{notice}<button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {about && <div className="modal-backdrop" onClick={() => setAbout(false)}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="about-title" className="about-modal" onClick={event => event.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label="Close about" onClick={() => setAbout(false)}><X /></button><span className="brand-mark"><Play size={20} fill="currentColor" /></span><h2 id="about-title">A little more Frame.</h2><p>Your personal desktop video space. Version {version}.</p><p>This first release establishes the desktop foundation and interface. All video cards use original sample artwork and metadata. Import, playback, live discovery, and downloads are planned features.</p><button className="primary-button" onClick={() => setAbout(false)}>Make yourself at home <ArrowRight size={16} /></button></section></div>}
  </div>;
}
