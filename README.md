# Frame · YouTube Offline

A Windows-first desktop video space built with Electron, React, TypeScript, Vite, and Tailwind CSS. **Phases 1–5 have source implementations:** desktop foundation, interface, persistent local library, offline playback with resume/history, YouTube API discovery, saved links, and the official online player. Live Google API access and real YouTube playback require verification with your own key/network; automated Phase 5 tests use controlled responses. Downloads and mixed persistent playlists are not implemented yet.

## Development

Use Node.js **24.10+** (Node 24 LTS recommended) and npm 11. From this repository:

```sh
npm ci
npm run dev
```

`dev` compiles the Electron main process and sandboxed preload, starts Vite on `127.0.0.1:5173`, then opens the desktop window. Renderer changes update through Vite; restart the command after main/preload changes. Closing Electron also stops Vite. Do not disable Electron's sandbox. Linux needs a display server and Electron's GTK/NSS system dependencies; Windows is the primary deployment target.

For the renderer alone, use `npm run dev:web`. Desktop IPC is intentionally unavailable in browser mode; the fixed YouTube homepage action falls back to the browser. This mode is useful for layout development, not desktop validation.

Behind the managed cloud environment proxy, use `NODE_USE_ENV_PROXY=1 npm ci` and `NODE_USE_ENV_PROXY=1 node node_modules/electron/install.js` to explicitly prepare Electron's lazily downloaded binary. On Windows PowerShell set `$env:NODE_USE_ENV_PROXY = '1'` before these commands if a proxy is configured. Keep inherited CA trust and TLS/checksum verification enabled. Direct installations need no proxy setting.

## Included now

- Original Frame branding with six saved colorways (Grove, Ocean, Orchid, Rose, Ember, Graphite), each available in light or dark mode. Choose **Settings → Appearance → Colorway**. Existing light/dark preferences are preserved; new or invalid color choices default to Grove. Icons use scalable SVG vectors with larger navigation/player sizes and consistent strokes for high-DPI displays.
- Responsive video grid with original CSS artwork, sample titles, channels, duration badges, and clear sample labeling. No remote image requests are needed.
- Collapsible navigation for all eight requested sections, category filters, search by title/channel/category, and empty results.
- Watch-page layout with related sample cards and session-only Watch Later toggles. **These are interface interactions, not playable media or persistent playlists.**
- Settings theme controls, about dialog, keyboard search shortcut (`/`), Escape dismissal, and visible focus indicators.
- Genuine YouTube homepage launch via a fixed main-process capability. Your actual recommendations remain in your browser. The YouTube Data API does not expose the personalized homepage recommendation feed. YouTube Discovery integrates public search and regional popular-video endpoints, with an isolated official embedded-player view; see [YouTube Data API documentation](https://developers.google.com/youtube/v3/docs) and [embedded players](https://developers.google.com/youtube/iframe_api_reference).
- A real Offline Library: native multi-file import, SQLite persistence, locally generated thumbnails and durations, file sizes, search, sorting, pagination, progress, duplicate-path detection, missing-file checks, and confirmed library removal that preserves originals.
- A real local HTML5 player with seeking, volume/mute, fullscreen/theater modes, speed, keyboard shortcuts, UTF-8 SRT/WebVTT subtitles, autoplay-next queues, persistent resume positions, and playback history.
- Persistent saved YouTube links in Watch Later, including manual links without a key. Session-only sample bookmarks remain clearly separate.
- Main-process API-key configuration using a native file picker and OS-encrypted storage, or an existing environment binding. Missing key, offline, quota, and API errors have explicit states.
- Explicit planned-feature states for downloads, mixed playlists, and advanced library settings.

## Checks

```sh
npm run build          # strict renderer + Electron types, production bundle, main/preload
npm test               # compile main modules; catalog, SQLite, streaming, playback and subtitle tests
npx playwright install chromium
npm run test:ui        # navigation, search, themes, sample saving, responsive layouts
npm run test:desktop   # after build, with an active desktop display
npm run test:library   # real imports/thumbnails, SQLite restarts, missing files, removal
npm run test:playback  # real offline controls, captions, resume/restart, autoplay, errors
npm run test:youtube   # controlled API/player responses; not a live Google/YouTube test
npm audit
```

For a system Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable before `test:ui`. On headless Linux run `xvfb-run -a npm run test:desktop` when Xvfb is installed. The desktop smoke test loads the **production files** and checks the actual preload bridge, isolation settings, and navigation. It never disables the Electron sandbox. `test:library` uses generated WebM/MP4 fixtures, an isolated temporary application-data directory, and test-only native dialog stubs; it validates the real decoder, IPC, cache, database, and React library screen. Use `xvfb-run -a npm run test:library` on headless Linux. FFmpeg is not required: the tiny generated fixtures are checked in.

## Windows packaging

On Windows:

```sh
npm ci
node node_modules/electron/install.js
npm run dist:win
```

Electron Builder is configured for an NSIS installer in `release/`, with an installation-directory choice and desktop shortcut. Installer generation, installation, launch, and uninstallation must still be validated on Windows. This repository does not include signing credentials or a custom installer icon. An unsigned installer may trigger Windows SmartScreen; configure signing securely for distribution.

## Architecture and security

```text
electron/main.cts        Window lifecycle, navigation policy, validated IPC handlers
electron/preload.cts     Fixed app and library capabilities; no generic filesystem API
electron/library.cts     SQLite metadata, canonical-path imports, search and availability
electron/metadata.cts    Isolated local decoder and thumbnail generation
electron/media.cts       Bounded range streaming for decoder and authorized playback
electron/playback.cts    Short-lived playback sessions for imported videos only
electron/subtitles.cts   WebVTT normalization and SRT timestamp conversion
electron/subtitle-file.cts Bounded UTF-8 reads from native subtitle selections
electron/youtube.cts     Fixed Google API client, validation, caching, redacted errors
electron/youtube-player.cts Isolated native WebContentsView for the official player
electron/youtube-credentials.cts Native-picked, OS-encrypted API key storage
electron/youtube-saved.cts Persistent saved IDs and expiring API metadata
src/App.tsx             Navigation, page shells, interface interaction state
src/catalog.ts          Explicitly labeled demonstration catalog + search
src/components/         Sample cards, OfflineLibrary/LocalPlayer, History and YouTube screens
src/styles.css          Tailwind entrypoint, design tokens, responsive styling
scripts/                Desktop development runner and runtime smoke test
tests/                  Catalog/library/stream tests, UI tests, and generated media fixtures
```

The renderer has no Node integration, generic filesystem access, generic IPC, arbitrary URL-opening capability, or secrets. Context isolation, sandboxing, web security, a restrictive CSP, denied window creation and permissions (except fullscreen for the trusted app/player), blocked external navigation, and main-frame/sender checks protect the desktop boundary. Only the exact loopback development URL is accepted as a dev origin; packaged apps load bundled assets. There is no backend service. React renders sample text safely without raw HTML.

No API key is needed for local importing/playback or saving a YouTube link. Live YouTube search and popular-video discovery require your own YouTube Data API v3 key. See Phase 5 setup below. Never add credentials to renderer code or commit `.env` files. Desktop secrets cannot be made extract-proof; API restrictions and quota monitoring are still necessary.

## Using the offline library (Phase 3)

1. Open **Offline Library → Import videos** and choose up to 100 files per batch. The app references originals in place; it does not copy, upload, move, or delete them. Keep removable drives connected when indexing.
2. Frame reads duration and creates 480×270 PNG thumbnails locally using Electron's bundled video decoder. Only one file is decoded at a time, with a 15-second per-file timeout. Import progress and a final added/duplicate/failed/warning summary are shown. You can navigate elsewhere while a batch runs; another import or scan waits until it finishes.
3. Search titles/file names, sort by title, date, duration, or size, and page through 48 entries at a time. Home/discovery samples are separate from your real library. The header search also searches the library while that section is open.
4. **Check files** detects missing or inaccessible paths, and recognizes files restored at their original locations. A background scan also runs at launch without delaying the window. This is not an automatic folder watcher. If you move a file permanently, remove its old entry and import the new path.
5. The trash button asks for native confirmation, then removes only the library entry and cached thumbnail. Original-file deletion is deliberately not offered. Restoring that video to the library requires reimporting it.

Accepted extensions: MP4, M4V, WebM, MKV, MOV, AVI, OGV, and OGG. **Extensions do not guarantee codec support.** Files the bundled decoder cannot read remain listed with a warning and unknown metadata where applicable. WebM/VP9 and MP4/H.264 were exercised in the Linux Electron integration test. Codec support still needs testing on Windows with your own files. Imported videos can now be played in Phase 4; unsupported codecs show an error instead of pretending to work.

The database (`library.sqlite`, with SQLite WAL sidecars) and `thumbnails/` live in the `library/` subdirectory of Electron's per-user application-data directory, normally `%APPDATA%/Frame` on Windows. Close Frame before backing up that directory. Source locations, names, sizes, durations, import timestamps, resume positions, and watch history are private local data. Schema version 2 adds a history table without replacing existing Phase 3 videos. No SQLite native addon or external media executable is required: Electron's Node runtime supplies SQLite. Renderer-only preview cannot import files.

Duplicate detection uses canonical file paths (case-insensitive on Windows), not content hashes; separate copies can both be imported. Metadata is a snapshot at import, so remove/reimport an entry if its source is replaced or to retry failed metadata. Deleting cached thumbnails manually shows a fallback; reimport regenerates them. Folder monitoring, directory import, cache-management settings, playlists, and source-file deletion are outside Phase 3.

The decoder runs in its own sandboxed session. A temporary opaque media URL exists only for the file currently being indexed, and is not registered in the app renderer's session. Thumbnail URLs accept only library IDs. The renderer never supplies import paths; the native dialog grants file selection. Query sort/limits/IDs and IPC senders are validated in the main process. Existing database and media-stream tests cover literal wildcard searches, pagination, malformed requests, and range boundaries.

## Watching local videos (Phase 4)

1. In **Offline Library**, click a video thumbnail/title to open the local player. No server or internet connection is needed; Home's sample artwork remains unplayable.
2. Use play/pause, the timeline, volume/mute, playback speed (0.25×–2×), theater, and fullscreen controls. In fullscreen, the video fills the viewport and the controls overlay it without reserving a footer. Controls and the cursor fade after 2.6 seconds of inactivity while playing; movement, keyboard input, or pause restores them. Hovering over controls, holding a pointer interaction, and keyboard-focused controls keep them visible. Paused/loading/error states remain operable, and reduced-motion preferences disable transition animation. Volume, mute, speed, and autoplay preferences are saved locally. Playback errors explain unsupported codecs or unavailable files; restore a missing file and choose **Try again**.
3. Use **Load subtitles** to select a UTF-8 `.vtt` or `.srt` file up to 2 MB. SRT timestamps are converted locally to WebVTT. When fullscreen controls are visible, automatically positioned captions move above the controls; explicit cue positions are preserved. Captions can be toggled or removed, and are scoped to the current video; load them again on another session. Subtitle content is never rendered as HTML.
4. Playing a video adds it to **History**. Progress saves every two seconds while playing, and on pause, seek, end, or collection navigation. Reopening resumes the saved position; completed videos restart at zero. Abrupt termination can lose up to the most recent checkpoint interval. History is paginated and local-only; removing a library entry also removes its history.
5. **Autoplay next** is off by default. Enable it to advance through the collection page you opened (up to 48 videos in its current order); missing entries are skipped. It stops at the end, without wrapping. Next/up-next controls also work manually. This is a temporary queue, not a saved playlist.

Keyboard shortcuts, when focus is outside controls/text fields/dialogs:

| Key | Action |
| --- | --- |
| Space / K | Play or pause |
| J / L | Seek backward / forward 10 seconds |
| Left / Right | Seek backward / forward 5 seconds |
| Up / Down | Raise / lower volume |
| M | Toggle mute |
| F | Toggle fullscreen (Escape exits via the browser) |
| T | Toggle theater layout |
| C | Toggle loaded captions |

The main process resolves only imported IDs into short-lived playback URLs. Switching or closing a video revokes its URL; deleted entries cannot be streamed. Both streaming and checkpoint requests are validated. Subtitle paths come only from a native picker with bounded reads, not renderer arguments. The renderer keeps Node access disabled and never receives a generic filesystem API. The existing cache/metadata schemes remain separate from playback access.

`npm run test:playback` (after `npm run build`, with a display; use `xvfb-run -a` on headless Linux) exercises actual decoding, play/pause, seeking, volume/mute, keyboard controls, speed, theater/fullscreen, idle fading and cursor hiding, movement/pause/keyboard wake, caption positioning, SRT captions, resume/history across restart, autoplay/end-of-queue, URL revocation, and missing/corrupt-file recovery. It uses generated fixtures, temporary app data, test-only native dialog stubs, and blocks all HTTP(S) requests. FFmpeg is not required to run tests. Windows codec, audio-device, fullscreen, and installer behavior still require testing on Windows with real files; Linux test results do not establish those outcomes.

## YouTube setup and use (Phase 5)

**Keep your API key private. Do not paste it into chat, source files, screenshots, or issue reports.**

1. In your Google Cloud project, enable **YouTube Data API v3**. Create a key and restrict its API access to YouTube Data API v3. Main-process requests are not website requests: HTTP-referrer-only restrictions can reject them. Choose application restrictions suitable for your own desktop deployment, monitor quota, and rotate an exposed key. See [API key setup](https://developers.google.com/youtube/v3/getting-started).
2. Put only the key on one line in a small UTF-8 `.txt` file outside this repository. Open **Settings → YouTube connection → Import key file** and select it. Frame's main process reads it with a size limit and stores an OS-encrypted copy under `userData/youtube/api-key.enc`. The key is never sent through the renderer bridge or bundled with the app. Delete or secure your original plaintext file afterward.
3. On Windows this uses Electron `safeStorage` (DPAPI). If secure OS encryption is unavailable, Frame refuses to store a key rather than writing plaintext. Alternatively, launch the app with `FRAME_YOUTUBE_API_KEY` set in its environment. Existing environment bindings take precedence; only their presence/source is shown in Settings. **Forget saved key** removes the encrypted copy, not an environment binding. The app does not load `.env` files automatically or request interactive Google sign-in.
4. Open **YouTube Discovery**. Choose a region for popular videos, or submit a search. The app uses the supported `videos.list` most-popular chart and `search.list` (video-only, embeddable/syndicatable, moderate SafeSearch), followed by batched metadata lookup. This is public regional discovery, not a personalized feed. Requests are bounded, deduplicated, and cached for five minutes. Search consumes more quota than popular-video browsing; there is no search-on-every-keystroke or automatic quota-error retry.
5. Click a result, then **Load official player**. This connects to YouTube and loads its official privacy-enhanced `/embed/VIDEO_ID` page in a sandboxed native `WebContentsView` inside the app. YouTube supplies playback, controls, ads, and availability. The isolated player has no preload, Node, Frame IPC, or API key. Its official video/home/help/privacy/terms links open in your browser through a strict HTTPS allowlist; arbitrary popups and navigation stay blocked. Its session is separate from the API session. Frame supplies its own native application identity (`https://app.frame.offline/`, derived from its configured app ID) through Electron's `httpReferrer` option for YouTube's embedded-client identification requirement; this is not impersonation of another website. The view follows the player slot, hides behind Frame's About dialog/out-of-view content, and is destroyed on navigation. The player height adapts to short windows and zoom, and opening/reloading a video resets the source page’s scroll position. Loading, offscreen layout, and connection failures have separate messages; the app does not infer connectivity from a placeholder. This does not use a local web server.
6. Some videos disallow embedding, require login/age checks, are unavailable in your region, or may show an embedded-player/client-identity error such as 153. Frame does not bypass any restriction: use **Open on YouTube** to watch in your browser. Key validity does not establish embedding availability. **Open YouTube** in Discovery opens your real personalized homepage in your browser; the Data API does not expose that recommendation feed.
7. **Save for later** persists a real YouTube link in **Watch Later**. You can also paste an HTTPS `youtube.com/watch?v=…`, `/shorts/…`, `/live/…`, or `youtu.be/…` link directly without a key. A configured key can retrieve metadata for a manually saved link; otherwise it uses a clearly generic title/ID. YouTube links always need internet for playback and are not local downloads. Unsaving does not delete any local media. Existing demonstration bookmarks are shown separately and remain session-only.

Saved IDs and available API metadata live in `userData/youtube/saved-links.sqlite`. Cached API metadata expires after 30 days and is removed on startup/read; the user-saved ID/link remains. Five-minute in-memory discovery caches are bounded. Thumbnails load lazily from `i.ytimg.com`, with a fallback when offline or unavailable. The renderer CSP still prohibits external scripts/frames: YouTube runs only in the separate native view. Native IPC validates IDs, supported link hosts, query length/region/page tokens, bounds, and main-frame senders. Browser-open actions construct a fixed YouTube URL from a validated ID. API requests use an `X-Goog-Api-Key` header only at the fixed Google API endpoint; errors are redacted and redirects rejected.

Relevant official references: [Data API](https://developers.google.com/youtube/v3/docs), [player requirements and client identity](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-youtube-player), [player parameters](https://developers.google.com/youtube/player_parameters), [API developer policies](https://developers.google.com/youtube/terms/developer-policies), and [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

### Phase 5 verification and network requirements

- `npm test` checks request construction/validation, API normalization, caching/deduplication, quota/key/offline redaction, saved-link persistence/metadata expiry, and the key-store adapter. These are controlled tests, not live requests.
- `npm run test:youtube` (after build, with a display; use `xvfb-run -a` on headless Linux) intercepts Google/player HTTPS URLs with controlled local responses. It exercises the actual Electron IPC, discovery UI, paging/search, saved-link restart persistence, missing-key/quota fallbacks, native view bounds/modal hiding/cleanup, configured Fetch referrer, and isolation. **It does not prove a live Google request succeeds, that a real YouTube player accepts the client identity, or that a video plays.** Windows DPAPI/native key import and real network behavior still require target-machine validation.
- On your Windows computer, import your key, search for a known public video, browse popular videos, save a link and restart, then load the official player. Verify actual playback, fullscreen, available captions, resizing/scrolling, browser fallback, and that the offline library still works with the network disconnected. If error 153 occurs, use Open on YouTube and report only the error code, never your key.
- Google API and embedding verification were not run live in the cloud: no key is injected there, and its custom egress allowlist currently excludes Google/YouTube. No credentials were invented or requested in chat. The user's local Windows key is intentionally not available to cloud tests.
- Restricted environments need access to `www.googleapis.com`, `www.youtube-nocookie.com`, `www.youtube.com`, `i.ytimg.com`, and the official player/CDN dependencies (commonly `*.googlevideo.com`, `*.ytimg.com`, `*.youtube.com`, and `*.gstatic.com`). Actual domains can vary by region/consent state. Configure allowed destinations in environment settings; code cannot grant network access. Chromium API/player sessions reuse the managed proxy when provided and keep TLS verification enabled. These domains were documented, not applied or published to cloud settings.

## Next: Phase 6 (not implemented)

Add authorized direct-media downloads with queue/progress/cancel/retry and library integration. Do not download YouTube videos without an authorized download mechanism or bypass DRM, authentication, or platform restrictions. Later Phase 7 adds persistent mixed playlists, broader Watch Later/history management and settings; Phase 8 covers optimization and Windows release validation.

Appearance regression tests exercise all six colorways in both modes, saved selection, native radio keyboard navigation, invalid preference recovery, and desktop/mobile overflow. The expanded Electron playback test verifies fullscreen fading with real playing media. Windows display scaling and fullscreen appearance still need a check on the target Windows computer.
