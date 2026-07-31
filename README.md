# Folio

A fast, beautiful desktop app for downloading books from Archive.org — the Rust/Tauri rewrite of the original Python downloader.

![Folio](src-tauri/icons/icon.png)

## Features

- **Search** — browse the Archive.org catalog right inside the app, with paginated results and cover thumbnails
- **Queue** — add books from search results, URLs, or the clipboard (`Ctrl+V`); downloads run automatically with up to 50 parallel connections
- **Library** — every download is persisted in a local SQLite database with covers, metadata, and file paths
- **PDF reader** — an in-app viewer that streams pages on demand (no waiting for the whole file), with keyboard navigation, click-to-flip, wheel scrolling, and zoom
- **Fast downloads** — HTTP/1.1 with browser-grade headers, 3-retry logic, and 50-way parallel image fetching, matching the performance of the original Python implementation
- **Small PDFs** — JPEGs are embedded with DCT passthrough instead of being re-encoded, so output files stay close to the source size
- **Self-updating** — signed releases via `tauri-plugin-updater`: checks on launch, auto-downloads, installs, and relaunches
- **Accessible by default** — readable typography, keyboard-selectable cards, focus rings, resizable panels, and a global debug console

## Tech stack

| Layer    | Choice                                                    |
|----------|-----------------------------------------------------------|
| Shell    | [Tauri 2](https://tauri.app) + React + TypeScript + Vite |
| Styling  | Tailwind CSS v4, custom dark theme with lime accent       |
| Backend  | Rust: reqwest, scraper, aes/ctr, printpdf, sqlx, tokio    |
| Storage  | SQLite (library) + tauri-plugin-store (settings)          |
| Viewer   | pdfjs-dist via Tauri's asset protocol (range requests)    |
| Updates  | tauri-plugin-updater with minisign-signed artifacts       |

## Getting started

### Prerequisites

- Node.js 20+
- Rust (stable) with the MSVC toolchain on Windows (`x86_64-pc-windows-msvc`)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

### Development

```bash
npm install
npm run tauri dev
```

The app opens with the Library as the default page (configurable in Settings). Enter your Archive.org credentials and an output directory in Settings, and you're ready to download.

### Building a release

```bash
npm run tauri build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## How downloads work

1. **Loan** — the app logs in to Archive.org and borrows the book (public-domain books skip the loan token automatically).
2. **Metadata** — book info and page image URLs are fetched from the book's data endpoint.
3. **Images** — up to 50 pages download in parallel with per-page deobfuscation (AES-CTR, matching the book's `X-Obfuscate` header).
4. **PDF assembly** — JPEGs are embedded losslessly (DCT passthrough) into a PDF; the temp image folder is cleaned up.

## Project layout

```
src/                 React frontend (panels, components, hooks)
src-tauri/
  src/
    commands/        Tauri command handlers (download, search, library, metadata)
    downloader/      Rust download pipeline (archive, crypto, image, orchestrator, pdf)
    library.rs       SQLite library persistence
    tracing_logger.rs Backend log bridge for the debug console
  capabilities/      Tauri permissions
  tauri.conf.json    App config (window, updater, asset protocol)
```

## Publishing updates

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Build with the signing key set:
   ```bash
   TAURI_SIGNING_PRIVATE_KEY_PATH=/path/to/folio-updater.key npm run tauri build
   ```
   The bundle output includes the installer plus the `latest.json` update manifest.
3. Create a GitHub release and attach the installer and `latest.json`. The app's configured endpoint (GitHub releases) serves the update automatically.

> ⚠️ Keep the private signing key safe — without it, future updates can't be signed.

## Credits

Designed and built by [tzero86](https://github.com/tzero86).

Folio is an unofficial desktop app. It is not affiliated with or endorsed by Archive.org. Please respect copyright and loan terms.
