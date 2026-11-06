# Frame · YouTube Offline

A Windows-first desktop video space built with Electron, React, TypeScript, Vite, and Tailwind CSS. **Phases 1–7 have source implementations:** desktop foundation, interface, persistent local library, offline playback with resume/history, YouTube API discovery, saved links, the official online player, authorized direct-media downloads, mixed playlists, and organization settings. Live Google API access and real YouTube playback require verification with your own key/network; automated YouTube tests use controlled responses. Phase 8 optimization and Windows release validation remain pending.

## Development

Use Node.js **24.10+** (Node 24 LTS recommended) and npm 11. From this repository:

```sh
npm ci
npm run dev
```

`dev` compiles the Electron main process and sandboxed preload, starts Vite on `127.0.0.1:5173`, then opens the desktop window. Renderer changes update through Vite; restart the command after main/preload changes. Closing Electron also stops Vite. Do not disable Electron's sandbox. Linux needs a display server and Electron's GTK/NSS system dependencies; Windows is the primary deployment target.

For the renderer alone, use `npm run dev:web`. Desktop IPC is intentionally unavailable in browser mode; the fixed YouTube homepage action falls back to the browser. This mode is useful for layout development, not desktop validation.

Behind the managed cloud environment proxy, use `NODE_USE_ENV_PROXY=1 npm ci` and `NODE_USE_ENV_PROXY=1 node node_modules/electron/install.js` to explicitly prepare Electron's lazily downloaded binary. On Windows PowerShell set `$env:NODE_USE_ENV_PROXY = '1'` before these commands if a proxy is configured. Keep inherited CA trust and TLS/checksum verification enabled. Direct installations need no proxy setting.

## Windows Electron runtime verification

Electron is pinned exactly to **44.10.2**, the current patch release on the supported 44.x line as of November 5, 2026. The previous 45.2.3 runtime's `ffmpeg.dll` was quarantined by Defender as `Trojan:Win32/Posilod.EB!cl`. Related false-positive reports exist upstream, but the quarantined copies have not been cleared by Microsoft. This pin uses a different official runtime; it does not restore, modify, or whitelist the flagged DLL. Electron supports its latest three stable major releases; monitor [release support](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) and revisit the pin as supported updates become available.

The official Windows x64 44.10.2 ZIP matched Electron's published SHA-256 checksum:

```text
7af18e85a1537b832924ae3b0e5146602f2f4f4b0c77c74e4ae0dc251ca338f9
```

Its `ffmpeg.dll` SHA-256 is:

```text
8ff05c15119391aa77fb62d666e70399b91e9a716fd5156946f811fa56d0e5f9
```

Defender scans of the official archive, extracted candidate, and installed runtime reported no threats on the development Windows machine with real-time protection enabled. This is a point-in-time result, not a guarantee of safety or future antivirus behavior.

After installing dependencies on Windows x64, verify the runtime before launching Frame:

```powershell
node node_modules/electron/install.js
npm run verify:runtime
```

The verifier fetches the checksum text from Electron's official GitHub release over HTTPS, checks the cached ZIP, compares every installed runtime file against that archive, and runs a Defender custom scan. It compares the runtime again afterward because Defender's successful exit code can also mean a threat was remediated. Missing, modified, unexpected, or quarantined runtime files fail verification. It requires Defender antivirus and real-time protection to remain enabled, and does not execute the runtime or change protection settings. If Defender access requires elevation, run the verifier from an administrator PowerShell. A JSON report is written to `test-results/runtime-verification.json`.

For a nonstandard Electron cache, pass the official ZIP explicitly: `npm run verify:runtime -- -ArchivePath 'C:\path\electron-v44.10.2-win32-x64.zip'`. If verification fails or a new detection appears, leave the affected files quarantined and report the exact version, file hash and detection to Electron/Microsoft. Do not substitute DLLs from another release. No database, API-key store, media source, or user-data migration is part of this runtime change.

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
- Persistent mixed playlists, local Watch Later, reorder/shuffle/repeat controls, history pause/removal, playback defaults, selected-folder scans, storage accounting, and thumbnail cache management.
- A persistent direct-media download queue with byte progress, cancel/retry, native-selected destination folders, encrypted source links, and automatic offline-library import.

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
npm run test:organization # playlists, settings, scans, cache, history and restart persistence
npm run test:downloads # controlled media transfers, queue, cancel/retry, restart and library integration
npm run verify:runtime # Windows x64: official archive/runtime hashes and Defender scan; no runtime execution
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
electron/organization.cts SQLite playlists, bookmarks, preferences and visits
electron/organization-ipc.cts Validated organization capabilities and native dialogs
electron/folder-scan.cts Bounded on-demand traversal of native-selected folders
electron/download-network.cts Public HTTPS transport, DNS pinning and redirect checks
electron/downloads.cts   Encrypted persistent queue, bounded transfers and library import
src/queue.ts            Shuffle and repeat navigation without modifying saved order
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

The database (`library.sqlite`, with SQLite WAL sidecars) and `thumbnails/` live in the `library/` subdirectory of Electron's per-user application-data directory, normally `%APPDATA%/Frame` on Windows. Close Frame before backing up that directory. Source locations, names, sizes, durations, import timestamps, resume positions, and watch history are private local data. Schema version 2 added history; version 3 adds preview-rebuild bookkeeping while preserving existing videos and history. Do not downgrade a version 3 library to an older application build. No SQLite native addon or external media executable is required: Electron's Node runtime supplies SQLite. Renderer-only preview cannot import files.

Duplicate detection uses canonical file paths (case-insensitive on Windows), not content hashes; separate copies can both be imported. Metadata starts as a snapshot at import. Phase 7 adds Settings controls to clear/rebuild previews and scan selected folders; clearing previews first allows re-reading duration for replaced sources. Manually deleting cache files shows a fallback; use Clear previews then Rebuild previews to regenerate them. Background folder monitoring and source-file deletion are not implemented.

The decoder runs in its own sandboxed session. A temporary opaque media URL exists only for the file currently being indexed, and is not registered in the app renderer's session. Thumbnail URLs accept only library IDs. The renderer never supplies import paths; the native dialog grants file selection. Query sort/limits/IDs and IPC senders are validated in the main process. Existing database and media-stream tests cover literal wildcard searches, pagination, malformed requests, and range boundaries.

## Watching local videos (Phase 4)

1. In **Offline Library**, click a video thumbnail/title to open the local player. No server or internet connection is needed; Home's sample artwork remains unplayable.
2. Use play/pause, the timeline, volume/mute, playback speed (0.25×–2×), theater, and fullscreen controls. In fullscreen, the video fills the viewport and the controls overlay it without reserving a footer. Controls and the cursor fade after 2.6 seconds of inactivity while playing; movement, keyboard input, or pause restores them. Hovering over controls, holding a pointer interaction, and keyboard-focused controls keep them visible. Paused/loading/error states remain operable, and reduced-motion preferences disable transition animation. Volume, mute, speed, and autoplay preferences are saved locally. Playback errors explain unsupported codecs or unavailable files; restore a missing file and choose **Try again**.
3. Use **Load subtitles** to select a UTF-8 `.vtt` or `.srt` file up to 2 MB. SRT timestamps are converted locally to WebVTT. When fullscreen controls are visible, automatically positioned captions move above the controls; explicit cue positions are preserved. Captions can be toggled or removed, and are scoped to the current video; load them again on another session. Subtitle content is never rendered as HTML.
4. Playing a video adds it to **History**. Progress saves every two seconds while playing, and on pause, seek, end, or collection navigation. Reopening resumes the saved position; completed videos restart at zero. Abrupt termination can lose up to the most recent checkpoint interval. Local history is paginated; removing a library entry also removes its history. Phase 7 adds separate YouTube visit history, pause/forget/clear controls, and saved defaults in Settings.
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

## Downloads (Phase 6)

1. Open **Downloads → Choose download folder**, or choose **Settings → Download location**. Frame uses a native directory picker. Use NTFS or another filesystem supporting hard links; FAT/exFAT volumes are not currently supported for download publication. New queue entries capture this destination; changing the setting does not move existing files or queued jobs.
2. Paste a **public HTTPS direct video-file URL** and confirm that you own the media or have permission to download it, then choose **Add to queue**. Supported containers are MP4, M4V, WebM, MKV, MOV, AVI, OGV and OGG, subject to the server's media type and container-header checks. Generic binary responses also need a supported extension in the submitted URL. YouTube/watch pages, streaming manifests, DRM, sign-in, cookies, custom authorization headers and nonstandard ports are not supported. Use the official player for saved YouTube links.
3. Up to **200 queue entries** are retained. Transfers run one at a time and continue when navigating elsewhere in Frame. Progress shows transferred bytes and a percentage bar when the server supplies a size; otherwise the bar is indeterminate. Each transfer is limited to **10 GiB**, five redirects, 30 seconds of socket inactivity and two hours overall. Transfers use Node's dedicated direct HTTPS connection with certificate verification; authenticated or mandatory proxy networks are not currently supported.
4. **Cancel** stops a queued or active transfer and removes its staging file. **Retry** restarts an unfinished transfer from byte zero; HTTP range resume is not implemented. Failed downloads do not block later entries. An expired link must be removed and added again with a fresh URL. Frame closes active transfers on normal exit; queued work resumes on the next launch. A transfer interrupted by a crash is shown as failed and can be retried. Files left during a crash are cleaned on retry or queue removal.
5. Successful transfers are published under a unique UUID filename in the selected folder, without overwriting existing files. Frame then adds the saved file to **Offline Library**, generating metadata/thumbnails with the existing local decoder. Library import waits for an existing import/scan to finish. Codec limitations still apply; decoder warnings appear in the library. If library import fails, **Retry** imports the saved file without downloading it again. Importing entries cannot be canceled mid-import.
6. **Remove from queue** removes a finished, failed or canceled entry and its staging file only. Completed video files and library entries are kept. Removing a video from Offline Library also keeps the downloaded file, using the existing library confirmation behavior. Manage unwanted completed files yourself in the selected folder.

The queue lives in `userData/downloads.sqlite` (with SQLite WAL sidecars). Source URLs, including signed query strings, are OS-encrypted through Electron safeStorage before persistence; secure storage is required to add a download. Only display names, hostnames, state, byte counts and generic errors are returned through the fixed download IPC bridge. URLs are never sent to the YouTube API or its credential store. Every HTTPS redirect is validated; DNS results containing private, loopback or reserved addresses are rejected and connections are pinned to the validated address. This is a direct-file downloader, not a browser or a YouTube media extractor.

`npm test` covers URL/address validation, DNS pinning, redirected private destinations, transfer validation, cancellation, retry, crash/restart recovery, file preservation and real SQLite library integration. `npm run test:downloads` runs the production Electron UI/IPC, real file writes, OS-encrypted queue, generated-media decoding, cancel/retry and restart persistence against test-only controlled transport responses with temporary app data. It does not establish availability of a specific live download host. Windows build/unit/UI/desktop checks were run during Phase 6; installer generation, installation, uninstallation, real-network YouTube playback and target-machine display/audio checks remain release work. Phase 8 has not been started.

Appearance regression tests exercise all six colorways in both modes, saved selection, native radio keyboard navigation, invalid preference recovery, and desktop/mobile overflow. The expanded Electron playback test verifies fullscreen fading with real playing media. Windows display scaling and fullscreen appearance still need a check on the target Windows computer.

## Organization and settings (Phase 7)

1. Use the **list-plus button** on an Offline Library video, YouTube card, or watch page to add it to an existing playlist or create one. Open **Playlists** to create, rename, and delete collections. Mix local videos with saved YouTube links. Drag entries or use the up/down arrows to reorder; use trash to remove membership. Deleting a playlist requires native confirmation and keeps videos, saved links, and original files. Up to 200 playlists with 500 unique items each are supported; lists page through 48 entries.
2. Choose **Play playlist** or click an entry. The queue provides previous/next, shuffle, repeat off/all/one, and automatic advancement after local videos. Shuffle changes the temporary playback queue without rewriting your saved order. Local repeat-one restarts the same file from zero; repeat-all wraps and skips unavailable files. Resume positions continue to apply when opening another local entry. Missing/deleted library references stay in the playlist as unavailable slots. Reimporting a removed library entry creates a new ID: remove its old unavailable slot and add the new entry.
3. YouTube entries are clearly marked online; internet is required. They use the same official isolated player and load only when requested. **Use Next manually after an online video ends**: Frame does not inspect or inject scripts into YouTube’s player. Repeat-one uses the supported YouTube `loop`/`playlist` embed parameters. Actual online playback/loop behavior must be verified on your Windows network. Opening the add-to-playlist modal hides the native player until the dialog closes.
4. Use the **bookmark button** on a local library card to save it in **Watch Later → Local videos for later**. Local bookmarks persist (up to 500); saved YouTube links and session-only sample bookmarks remain separate sections. Unsaving a YouTube link removes it from Watch Later while preserving references used by playlists/history. Cached API metadata still expires after 30 days; unavailable metadata falls back to the saved ID.
5. **History** separates local playback from **YouTube visits**. Visits mean you opened the official player, not a verified watch or your YouTube account’s history. Online resume positions remain managed by YouTube. **Record history** pauses new local history/resume checkpoints and YouTube visits while retaining old positions. Forget removes one record and its local resume position. **Clear all history** asks for native confirmation and removes both histories and local resume positions, keeping playlists and media.
6. **Settings → Playback defaults** saves speed, volume, mute, and ordinary-library autoplay. Player adjustments update the same defaults. Existing localStorage playback preferences migrate once into SQLite; later sessions load the stored values. Shuffle/repeat and playlist auto-advance are also saved. Appearance colorways and light/dark preferences continue to persist as before.
7. **Settings → Library directories** selects folders using native dialogs. Choose **Scan** to index supported files recursively, skipping symlinks and existing paths. Scans process up to 100 new videos, 10,000 directory entries, and 10 levels per operation; repeat for another batch. For folders exceeding the entry/depth limits, select smaller subfolders; repeating the same traversal cannot reach beyond those limits. This is on-demand indexing, not a background watcher. Removing a directory selection keeps already indexed videos.
8. **Storage & previews** shows indexed source sizes, thumbnail bytes/count, and metadata database/journal bytes, including the download queue database. Source sizes are metadata snapshots, not extra copies or a full disk-usage report. **Clear previews** requires confirmation and deletes generated thumbnail files only; **Rebuild previews** regenerates up to 100 uncached, nonmissing files per batch, rotating unsuccessful files behind untried candidates. Original videos stay in place. **Download location** selects the destination for new Phase 6 downloads.

Playlists, local bookmarks, playback/queue settings, directory grants, and YouTube visits live in `userData/organization.sqlite`. Local video/history data and API-key storage remain in their existing locations. Close Frame before backing up the whole user-data directory. No database reset or new dependency is required. Native confirmation protects playlist deletion, history clearing, and cache clearing. IPC grants fixed capabilities; folder/file paths still come from native selection rather than renderer arguments.

`npm run test:organization` runs against production files with temporary app data and generated WebM media, blocking external requests. It exercises the real UI/IPC/SQLite, mixed references, local repeat-one, shuffle/next, ordering, missing files, defaults, folder scans, preview regeneration, history controls, native cancellation, restart persistence, and preservation of source files. The YouTube portion uses a controlled document and verifies parameter construction, visit recording, and native-view hiding; it does not prove live YouTube playback. Unit tests also cover queue boundaries/repeat modes, request validation, migrations, bounded folder traversal, and persistent data behavior. Windows installer, native dialogs, DPAPI, real codecs/audio, and live YouTube behavior still need target-Windows verification.
