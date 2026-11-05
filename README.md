# Frame · YouTube Offline

A Windows-first desktop video space built with Electron, React, TypeScript, Vite, and Tailwind CSS. **This release completes Phases 1 and 2 only:** desktop foundation and an interactive interface. It does not yet import, play, discover, or download videos.

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
- Explicit planned-feature states for importing, downloads, history, playlists, and library settings. No inert controls pretend those features exist.

## Checks

```sh
npm run build          # strict renderer + Electron types, production bundle, main/preload
npm test               # sample catalog filtering regression tests
npx playwright install chromium
npm run test:ui        # navigation, search, themes, sample saving, responsive layouts
npm run test:desktop   # after build, with an active desktop display
npm audit
```

For a system Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable before `test:ui`. On headless Linux run `xvfb-run -a npm run test:desktop` when Xvfb is installed. The desktop smoke test loads the **production files** and checks the actual preload bridge, isolation settings, and navigation. It never disables the Electron sandbox.

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
electron/preload.cts     Two fixed capabilities: app info and YouTube homepage
src/App.tsx             Navigation, page shells, interface interaction state
src/catalog.ts          Explicitly labeled demonstration catalog + search
src/components/         Reusable video cards and original artwork
src/styles.css          Tailwind entrypoint, design tokens, responsive styling
scripts/                Desktop development runner and runtime smoke test
tests/                  Catalog unit tests and Playwright UI tests
```

The renderer has no Node integration, generic filesystem access, generic IPC, arbitrary URL-opening capability, or secrets. Context isolation, sandboxing, web security, a restrictive CSP, denied window creation and permissions, blocked external navigation, and main-frame/sender checks protect the desktop boundary. Only the exact loopback development URL is accepted as a dev origin; packaged apps load bundled assets. There is no backend service. React renders sample text safely without raw HTML.

No API key is required for this release. Phase 5 should decide how to provision restricted YouTube API credentials in the main process; bundled desktop secrets cannot be made extract-proof. Never add credentials to renderer code or commit `.env` files.

## Next: Phase 3 (not implemented)

Add SQLite metadata persistence and a library service in the main process; use native file-selection dialogs and narrowly validated IPC capabilities for importing. Index title, size, duration, and missing-file state; generate local thumbnails with bounded concurrency; test restart persistence. Do not add playback or downloading as part of this first-session scope.

Subsequent phases: offline HTML5 playback (4), supported YouTube discovery/embed (5), authorized direct-media downloads (6), persistent organization/history/settings (7), optimization and Windows release validation (8). Downloading must not bypass DRM, authentication, or platform restrictions.
