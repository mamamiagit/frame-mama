# Frame · YouTube Offline

A Windows-first desktop video space built with Electron, React, TypeScript, Vite, and Tailwind CSS. **Phases 1–3 are implemented:** desktop foundation, interface, and a persistent local video library. Playback, YouTube API discovery, downloads, and persistent playlists are not implemented yet.

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

- Original Frame branding, dark default and persistent light theme.
- Responsive video grid with original CSS artwork, sample titles, channels, duration badges, and clear sample labeling. No remote image requests are needed.
- Collapsible navigation for all eight requested sections, category filters, search by title/channel/category, and empty results.
- Watch-page layout with related sample cards and session-only Watch Later toggles. **These are interface interactions, not playable media or persistent playlists.**
- Settings theme controls, about dialog, keyboard search shortcut (`/`), Escape dismissal, and visible focus indicators.
- Genuine YouTube homepage launch via a fixed main-process capability. Your actual recommendations remain in your browser. The YouTube Data API does not expose the personalized homepage recommendation feed. Phase 5 must integrate supported search/popular endpoints and official embedded playback; see [YouTube Data API documentation](https://developers.google.com/youtube/v3/docs) and [embedded players](https://developers.google.com/youtube/iframe_api_reference).
- A real Offline Library: native multi-file import, SQLite persistence, locally generated thumbnails and durations, file sizes, search, sorting, pagination, progress, duplicate-path detection, missing-file checks, and confirmed library removal that preserves originals.
- Explicit planned-feature states for downloads, history, playlists, playback, and advanced library settings.

## Checks

```sh
npm run build          # strict renderer + Electron types, production bundle, main/preload
npm test               # compile main modules; catalog, SQLite, and media-stream tests
npx playwright install chromium
npm run test:ui        # navigation, search, themes, sample saving, responsive layouts
npm run test:desktop   # after build, with an active desktop display
npm run test:library   # real imports/thumbnails, SQLite restarts, missing files, removal
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
electron/media.cts       Bounded range streaming, only in the decoder session
src/App.tsx             Navigation, page shells, interface interaction state
src/catalog.ts          Explicitly labeled demonstration catalog + search
src/components/         Reusable sample cards, artwork, and the real OfflineLibrary screen
src/styles.css          Tailwind entrypoint, design tokens, responsive styling
scripts/                Desktop development runner and runtime smoke test
tests/                  Catalog/library/stream tests, UI tests, and generated media fixtures
```

The renderer has no Node integration, generic filesystem access, generic IPC, arbitrary URL-opening capability, or secrets. Context isolation, sandboxing, web security, a restrictive CSP, denied window creation and permissions, blocked external navigation, and main-frame/sender checks protect the desktop boundary. Only the exact loopback development URL is accepted as a dev origin; packaged apps load bundled assets. There is no backend service. React renders sample text safely without raw HTML.

No API key is required for this release. Phase 5 should decide how to provision restricted YouTube API credentials in the main process; bundled desktop secrets cannot be made extract-proof. Never add credentials to renderer code or commit `.env` files.

## Using the offline library (Phase 3)

1. Open **Offline Library → Import videos** and choose up to 100 files per batch. The app references originals in place; it does not copy, upload, move, or delete them. Keep removable drives connected when indexing.
2. Frame reads duration and creates 480×270 PNG thumbnails locally using Electron's bundled video decoder. Only one file is decoded at a time, with a 15-second per-file timeout. Import progress and a final added/duplicate/failed/warning summary are shown. You can navigate elsewhere while a batch runs; another import or scan waits until it finishes.
3. Search titles/file names, sort by title, date, duration, or size, and page through 48 entries at a time. Home/discovery samples are separate from your real library. The header search also searches the library while that section is open.
4. **Check files** detects missing or inaccessible paths, and recognizes files restored at their original locations. A background scan also runs at launch without delaying the window. This is not an automatic folder watcher. If you move a file permanently, remove its old entry and import the new path.
5. The trash button asks for native confirmation, then removes only the library entry and cached thumbnail. Original-file deletion is deliberately not offered. Restoring that video to the library requires reimporting it.

Accepted extensions: MP4, M4V, WebM, MKV, MOV, AVI, OGV, and OGG. **Extensions do not guarantee codec support.** Files the bundled decoder cannot read remain listed with a warning and unknown metadata where applicable. WebM/VP9 and MP4/H.264 were exercised in the Linux Electron integration test. Codec support still needs testing on Windows with your own files. No playback is offered in this phase.

The database (`library.sqlite`, with SQLite WAL sidecars) and `thumbnails/` live in the `library/` subdirectory of Electron's per-user application-data directory, normally `%APPDATA%/Frame` on Windows. Close Frame before backing up that directory. Source locations, names, sizes, durations, and import timestamps are private local data. No SQLite native addon or external media executable is required: Electron's Node runtime supplies SQLite. Renderer-only preview cannot import files.

Duplicate detection uses canonical file paths (case-insensitive on Windows), not content hashes; separate copies can both be imported. Metadata is a snapshot at import, so remove/reimport an entry if its source is replaced or to retry failed metadata. Deleting cached thumbnails manually shows a fallback; reimport regenerates them. Folder monitoring, directory import, cache-management settings, playlists, and source-file deletion are outside Phase 3.

The decoder runs in its own sandboxed session. A temporary opaque media URL exists only for the file currently being indexed, and is not registered in the app renderer's session. Thumbnail URLs accept only library IDs. The renderer never supplies import paths; the native dialog grants file selection. Query sort/limits/IDs and IPC senders are validated in the main process. Existing database and media-stream tests cover literal wildcard searches, pagination, malformed requests, and range boundaries.

## Next: Phase 4 (not implemented)

Add local HTML5 playback, seeking, volume, fullscreen/theater modes, speed, keyboard shortcuts, subtitles, resume positions, and history through narrowly scoped local-media capabilities. The Phase 3 cache/metadata protocols are not a general filesystem API.

Subsequent phases: offline HTML5 playback (4), supported YouTube discovery/embed (5), authorized direct-media downloads (6), persistent organization/history/settings (7), optimization and Windows release validation (8). Downloading must not bypass DRM, authentication, or platform restrictions.
