> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

# Folio — Tauri/Rust Rewrite Implementation Plan

**Goal:** Replace the Python customtkinter app with a fast, modern Tauri (Rust + React) desktop app that downloads books from Archive.org and displays them in a queue with metadata, cover thumbnails, and a library view.

**Architecture:** Tauri provides the desktop window and frontend bridge. The Rust backend handles HTTP, Archive.org login/loan, image download/deobfuscation, PDF assembly, and a SQLite library store. The React frontend provides the UI, queue, settings, and about modal.

**Tech Stack:** Rust 1.85+, Tauri 2, React + TypeScript, Tailwind CSS v4, shadcn/ui, Motion, tokio, reqwest, aes/ctr, sha1, base64, printpdf, sqlx.

---

## File Structure

```
.worktrees/folio/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── queue/
│   │   ├── library/
│   │   ├── settings/
│   │   └── about/
│   ├── hooks/
│   │   └── useShortcuts.ts
│   └── lib/
│       └── utils.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── queue.rs
│       │   ├── metadata.rs
│       │   ├── download.rs
│       │   └── settings.rs
│       └── downloader/
│           ├── mod.rs
│           ├── archive.rs
│           ├── image.rs
│           ├── crypto.rs
│           └── pdf.rs
└── docs/superpowers/plans/
    └── this file
```

---

## Task 1: Configure Tauri project identity and dependencies

**Files:**
- Modify: `.worktrees/folio/src-tauri/tauri.conf.json`
- Modify: `.worktrees/folio/src-tauri/Cargo.toml`
- Modify: `.worktrees/folio/package.json`
- Modify: `.worktrees/folio/vite.config.ts`
- Modify: `.worktrees/folio/tsconfig.json`

- [ ] **Step 1: Update Tauri config**

In `src-tauri/tauri.conf.json`, change:
- `productName` to `"Folio"`
- `identifier` to `"com.folio.app"` (already set)
- Default window title to `"Folio"`
- Window size to `1200x800`, min size `900x650`

- [ ] **Step 2: Add Rust dependencies**

Append to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "cookies", "multipart"] }
scraper = "0.22"
aes = "0.8"
cipher = { version = "0.4", features = ["std"] }
ctr = "0.9"
sha1 = "0.10"
base64 = "0.22"
image = "0.25"
printpdf = "0.7"
anyhow = "1"
thiserror = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tempfile = "3"
```

- [ ] **Step 3: Add frontend dependencies**

```bash
cd .worktrees/folio
npm install framer-motion lucide-react class-variance-authority clsx tailwind-merge @radix-ui/react-dialog @radix-ui/react-slot
npm install -D tailwindcss postcss autoprefixer
```

- [ ] **Step 4: Initialize Tailwind**

Create `tailwind.config.js` and `src/index.css` with Tailwind directives. Update `vite.config.ts` if needed.

- [ ] **Step 5: Syntax/build check**

```bash
cd .worktrees/folio
npm run tauri dev
```

Expected: app window opens with the default scaffold UI.

---

## Task 2: Implement Rust metadata fetch

**Files:**
- Create: `.worktrees/folio/src-tauri/src/downloader/archive.rs`
- Create: `.worktrees/folio/src-tauri/src/downloader/mod.rs`
- Modify: `.worktrees/folio/src-tauri/src/lib.rs`
- Modify: `.worktrees/folio/src-tauri/src/commands/metadata.rs`

- [ ] **Step 1: Define Archive.org metadata types**

In `downloader/archive.rs`:

```rust
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct BookMetadata {
    pub title: Option<String>,
    pub creator: Option<Vec<String>>,
    pub date: Option<String>,
    pub publisher: Option<String>,
    pub language: Option<String>,
    pub image_count: Option<i64>,
    pub identifier: String,
    pub raw: HashMap<String, serde_json::Value>,
}
```

- [ ] **Step 2: Implement metadata fetch**

```rust
pub async fn fetch_metadata(identifier: &str) -> anyhow::Result<BookMetadata> {
    let url = format!("https://archive.org/details/{identifier}");
    let body = reqwest::get(&url).await?.text().await?;
    let info_url = "https:".to_string()
        + &body.split('"url":"').nth(1).context("no metadata url")?
            .split('"').next().context("malformed metadata url")?
            .replace("\\u0026", "&");
    let resp: serde_json::Value = reqwest::get(&info_url).await?.json().await?;
    let data = resp.get("data").context("missing data")?;
    let metadata = data.get("metadata").context("missing metadata")?;
    let title = metadata.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
    let creator = metadata.get("creator").and_then(|v| {
        if let Some(arr) = v.as_array() {
            Some(arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        } else {
            v.as_str().map(|s| vec![s.to_string()])
        }
    });
    let date = metadata.get("date").and_then(|v| v.as_str()).map(String::from);
    let publisher = metadata.get("publisher").and_then(|v| v.as_str()).map(String::from);
    let language = metadata.get("language").and_then(|v| v.as_str()).map(String::from);
    let image_count = data.get("brOptions")
        .and_then(|b| b.get("data"))
        .and_then(|d| d.as_array())
        .map(|arr| arr.iter().map(|page| page.as_array().map(|p| p.len()).unwrap_or(0)).sum::<usize>() as i64)
        .or_else(|| metadata.get("image_count").and_then(|v| v.as_str()?.parse().ok()));

    Ok(BookMetadata {
        title,
        creator,
        date,
        publisher,
        language,
        image_count,
        identifier: identifier.to_string(),
        raw: metadata.as_object().unwrap_or(&serde_json::Map::new()).iter().map(|(k,v)| (k.clone(), v.clone())).collect(),
    })
}
```

- [ ] **Step 3: Expose Tauri command**

In `commands/metadata.rs`:

```rust
use tauri::command;
use crate::downloader::archive::{fetch_metadata, BookMetadata};

#[command]
pub async fn fetch_book_metadata(identifier: String) -> Result<BookMetadata, String> {
    fetch_metadata(&identifier).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Wire into lib.rs**

In `src-tauri/src/lib.rs`:

```rust
mod commands;
mod downloader;

use commands::metadata::fetch_book_metadata;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_book_metadata])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Build check**

```bash
cd .worktrees/folio
npm run tauri dev
```

Expected: compiles without errors.

---

## Task 3: Build React UI shell

**Files:**
- Modify: `.worktrees/folio/src/App.tsx`
- Create: `.worktrees/folio/src/components/queue/QueueItem.tsx`
- Create: `.worktrees/folio/src/components/queue/QueuePanel.tsx`
- Create: `.worktrees/folio/src/components/library/LibraryPanel.tsx`
- Create: `.worktrees/folio/src/components/settings/SettingsPanel.tsx`
- Create: `.worktrees/folio/src/components/about/AboutDialog.tsx`
- Create: `.worktrees/folio/src/hooks/useShortcuts.ts`
- Create: `.worktrees/folio/src/lib/utils.ts`

- [ ] **Step 1: Design tokens and base CSS**

In `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #121318;
  --bg-secondary: #1a1c23;
  --bg-elevated: #22252d;
  --text-primary: #f3f1ec;
  --text-secondary: #a7a49d;
  --text-muted: #6e6b66;
  --accent: #e67a5f;
  --accent-hover: #f08d74;
  --danger: #e04f5f;
  --success: #5fae71;
  --border: #2c2f38;
}

body {
  @apply bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased;
  font-family: 'Inter', system-ui, sans-serif;
}
```

- [ ] **Step 2: Main App layout**

`App.tsx` should have:
- Left sidebar navigation: Queue, Library, Settings, About.
- Main content area.
- Global shortcut listener via `useShortcuts`.

- [ ] **Step 3: Queue panel with add item input**

`QueuePanel.tsx`:
- Input at top with paste support (native right-click works in Tauri webview).
- Add button and `Ctrl+Enter` shortcut.
- List of `QueueItem` cards.
- Empty state message.

- [ ] **Step 4: QueueItem component**

`QueueItem.tsx`:
- Cover thumbnail (64x80 placeholder, async load via Tauri command).
- Title, author, year, pages.
- Status badge.
- Remove button.

- [ ] **Step 5: Settings panel**

Fields for email, password, output directory, resolution, PDF/metadata toggles, save credentials button.

- [ ] **Step 6: About dialog**

Modal with app name "Folio", version, description, credits, legal disclaimer, and a "Keyboard Shortcuts" tab.

- [ ] **Step 7: Shortcut hook**

`useShortcuts.ts`:
- `Ctrl+V` in the app triggers "add from clipboard".
- `Ctrl+Enter` starts download.
- `Escape` closes modals.
- `Ctrl+,` opens settings.
- `Ctrl+/` opens shortcuts help.

- [ ] **Step 8: Run frontend dev server**

```bash
cd .worktrees/folio
npm run dev
```

Expected: see the new UI in the browser at `http://localhost:1420`.

---

## Task 4: Implement Rust image download + deobfuscation

**Files:**
- Create: `.worktrees/folio/src-tauri/src/downloader/crypto.rs`
- Create: `.worktrees/folio/src-tauri/src/downloader/image.rs`
- Modify: `.worktrees/folio/src-tauri/src/downloader/mod.rs`

- [ ] **Step 1: Deobfuscation port**

In `crypto.rs`, reimplement `deobfuscate_image` from Python:

```rust
use aes::cipher::{KeyIvInit, StreamCipher};
use ctr::Ctr64BE;
use sha1::{Sha1, Digest};

pub fn deobfuscate_image(image_data: &mut [u8], link: &str, obf_header: &str) -> anyhow::Result<()> {
    let (version, counter_b64) = obf_header.split_once('|').context("invalid header")?;
    if version != "1" {
        anyhow::bail!("unsupported obfuscation version");
    }
    let counter_bytes = base64::decode(counter_b64)?;
    if counter_bytes.len() != 16 {
        anyhow::bail!("counter must be 16 bytes");
    }
    let key_path = regex::Regex::new(r"^https?://.*?/")?.replace(link, "/").to_string();
    let sha1_digest = Sha1::digest(key_path.as_bytes());
    let key = &sha1_digest[..16];
    let prefix = &counter_bytes[..8];
    let iv = [&prefix[..], &counter_bytes[8..]].concat();
    let mut cipher = Ctr64BE::new(key.into(), iv.as_slice().into());
    cipher.apply_keystream(&mut image_data[..1024.min(image_data.len())]);
    Ok(())
}
```

Add `regex = "1"` to Cargo.toml.

- [ ] **Step 2: Image download with loan refresh**

In `image.rs`:

```rust
pub async fn download_image(
    client: &reqwest::Client,
    link: &str,
    book_id: &str,
    output_path: &Path,
) -> anyhow::Result<()> {
    let mut retries = 0;
    loop {
        let response = client.get(link).header("Referer", "https://archive.org/").send().await?;
        if response.status() == 403 && retries < 1 {
            super::archive::loan_book(client, book_id).await?;
            retries += 1;
            continue;
        }
        let status = response.status();
        if !status.is_success() {
            anyhow::bail!("HTTP {status}");
        }
        let mut bytes = response.bytes().await?.to_vec();
        if let Some(header) = response.headers().get("X-Obfuscate").and_then(|h| h.to_str().ok()) {
            deobfuscate_image(&mut bytes, link, header)?;
        }
        tokio::fs::write(output_path, bytes).await?;
        return Ok(());
    }
}
```

- [ ] **Step 3: Build check**

```bash
cd .worktrees/folio
npm run tauri dev
```

---

## Task 5: Implement Rust loan flow and download orchestration

**Files:**
- Create/extend: `.worktrees/folio/src-tauri/src/downloader/archive.rs`
- Create: `.worktrees/folio/src-tauri/src/downloader/orchestrator.rs`
- Create: `.worktrees/folio/src-tauri/src/commands/download.rs`
- Modify: `.worktrees/folio/src-tauri/src/lib.rs`

- [ ] **Step 1: Login and loan in Rust**

Port the Python `login`, `loan`, and `get_book_infos` logic to Rust `archive.rs`:

```rust
pub async fn login(client: &reqwest::Client, email: &str, password: &str) -> anyhow::Result<()> {
    let token_resp: serde_json::Value = client
        .get("https://archive.org/services/account/login/")
        .send().await?.json().await?;
    let token = token_resp["value"]["token"].as_str().context("login token missing")?;

    let data = serde_json::json!({"username": email, "password": password, "t": token});
    let resp: serde_json::Value = client
        .post("https://archive.org/services/account/login/")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(serde_json::to_string(&data)?)
        .send().await?.json().await?;
    if !resp["success"].as_bool().unwrap_or(false) {
        anyhow::bail!("login failed: {}", resp["value"].as_str().unwrap_or("unknown"));
    }
    Ok(())
}

pub async fn loan_book(client: &reqwest::Client, book_id: &str) -> anyhow::Result<()> {
    let grant = serde_json::json!({"action": "grant_access", "identifier": book_id});
    client.post("https://archive.org/services/loans/loan/searchInside.php").form(&grant).send().await?;
    let mut browse = grant.clone();
    browse["action"] = "browse_book".into();
    client.post("https://archive.org/services/loans/loan/").form(&browse).send().await?;
    let mut token_req = browse.clone();
    token_req["action"] = "create_token".into();
    let resp = client.post("https://archive.org/services/loans/loan/").form(&token_req).send().await?;
    let text = resp.text().await?;
    if !text.contains("token") {
        anyhow::bail!("loan failed: no token");
    }
    Ok(())
}

pub async fn get_book_infos(client: &reqwest::Client, identifier: &str) -> anyhow::Result<(String, Vec<String>, BookMetadata)> {
    let url = format!("https://archive.org/details/{identifier}");
    let body = client.get(&url).send().await?.text().await?;
    let info_url = "https:".to_string() + &body.split('"url":"').nth(1).context("no info url")?.split('"').next().context("bad info url")?.replace("\\u0026", "&");
    let data: serde_json::Value = client.get(&info_url).send().await?.json().await?;
    let metadata = data["data"]["metadata"].clone();
    let title = metadata["title"].as_str().unwrap_or(identifier).trim().replace(" ", "_");
    let title: String = title.chars().filter(|c| !r#"<>\":/\\|?*"#.contains(*c)).take(150).collect();
    let mut links = Vec::new();
    if let Some(items) = data["data"]["brOptions"]["data"].as_array() {
        for item in items {
            if let Some(pages) = item.as_array() {
                for page in pages {
                    if let Some(uri) = page["uri"].as_str() {
                        links.push(uri.to_string());
                    }
                }
            }
        }
    }
    let meta = BookMetadata {
        title: metadata["title"].as_str().map(String::from),
        creator: None,
        date: None,
        publisher: None,
        language: None,
        image_count: Some(links.len() as i64),
        identifier: identifier.to_string(),
        raw: serde_json::Map::new(),
    };
    Ok((title, links, meta))
}
```

- [ ] **Step 2: Orchestrator**

In `orchestrator.rs`:

```rust
pub async fn download_book(
    client: &reqwest::Client,
    identifier: &str,
    output_dir: &Path,
    resolution: i32,
    emit_status: impl Fn(&str, Option<&str>),
) -> anyhow::Result<String> {
    emit_status("started", None);
    loan_book(client, identifier).await?;
    let (title, links, _) = get_book_infos(client, identifier).await?;
    let dir = output_dir.join(&title);
    tokio::fs::create_dir_all(&dir).await?;
    let mut image_paths = Vec::new();
    for (i, link) in links.iter().enumerate() {
        let url = format!("{link}&rotate=0&scale={resolution}");
        let path = dir.join(format!("{:0>width$}.jpg", i + 1, width = links.len().to_string().len()));
        download_image(client, &url, identifier, &path).await?;
        image_paths.push(path);
    }
    let pdf_path = dir.with_extension("pdf");
    super::pdf::images_to_pdf(&image_paths, &pdf_path, &title)?;
    tokio::fs::remove_dir_all(&dir).await.ok();
    emit_status("done", Some(pdf_path.to_str().unwrap_or("")));
    Ok(pdf_path.to_string_lossy().to_string())
}
```

- [ ] **Step 3: PDF assembly**

In `pdf.rs`, implement image-to-PDF using `printpdf`:

```rust
use printpdf::*;
use std::path::Path;
use image::ImageReader;

pub fn images_to_pdf(image_paths: &[std::path::PathBuf], output: &Path, title: &str) -> anyhow::Result<()> {
    let (doc, page1, layer1) = PdfDocument::new(title, Mm(210.0), Mm(297.0), "Layer 1");
    for (i, path) in image_paths.iter().enumerate() {
        let img = ImageReader::open(path)?.decode()?;
        let (w_px, h_px) = img.dimensions();
        let mm_w = Mm(w_px as f64 * 0.0847);
        let mm_h = Mm(h_px as f64 * 0.0847);
        let page = if i == 0 { page1 } else { doc.add_page(mm_w, mm_h, format!("Layer {}", i + 1)) };
        let layer = doc.get_page(page).add_layer(format!("Image {}", i + 1));
        let image_file = ImageReader::open(path)?.decode()?;
        let image = Image::from_dynamic_image(&image_file);
        image.add_to_layer(layer.clone(), ImagePosition::default());
    }
    doc.save_and_close(output)?;
    Ok(())
}
```

Note: `printpdf` API may differ; adjust as needed. Alternatively use `lopdf` + `image` crate.

- [ ] **Step 4: Tauri download command**

In `commands/download.rs`:

```rust
use tauri::command;
use crate::downloader::archive::login;

#[command]
pub async fn download_books(
    email: String,
    password: String,
    items: Vec<String>,
    output_dir: String,
    resolution: i32,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let client = reqwest::Client::builder().cookie_store(true).build().map_err(|e| e.to_string())?;
    login(&client, &email, &password).await.map_err(|e| e.to_string())?;
    let out = std::path::PathBuf::from(output_dir);
    for id in items {
        let id_clone = id.clone();
        let app = app_handle.clone();
        let c = client.clone();
        let o = out.clone();
        tauri::async_runtime::spawn(async move {
            let res = crate::downloader::orchestrator::download_book(&c, &id_clone, &o, resolution, |status, pdf| {
                app.emit("download-status", serde_json::json!({"id": id_clone, "status": status, "pdf": pdf })).ok();
            }).await;
            if let Err(e) = res {
                app.emit("download-status", serde_json::json!({"id": id_clone, "status": "error", "message": e.to_string() })).ok();
            }
        });
    }
    Ok(())
}
```

- [ ] **Step 5: Wire command**

Add `download_books` to `tauri::generate_handler!` in `lib.rs`.

- [ ] **Step 6: Build check**

```bash
cd .worktrees/folio
npm run tauri dev
```

---

## Task 6: Add SQLite library store

**Files:**
- Create: `.worktrees/folio/src-tauri/src/library.rs`
- Modify: `.worktrees/folio/src-tauri/src/lib.rs`

- [ ] **Step 1: Schema**

```rust
use sqlx::sqlite::SqlitePool;
use chrono::{DateTime, Utc};
use uuid::Uuid;

pub struct LibraryBook {
    pub id: Uuid,
    pub identifier: String,
    pub title: String,
    pub creator: Option<String>,
    pub year: Option<String>,
    pub pages: Option<i64>,
    pub pdf_path: String,
    pub cover_path: Option<String>,
    pub downloaded_at: DateTime<Utc>,
}

pub async fn init_db(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            creator TEXT,
            year TEXT,
            pages INTEGER,
            pdf_path TEXT NOT NULL,
            cover_path TEXT,
            downloaded_at TEXT NOT NULL
        )"
    ).execute(pool).await?;
    Ok(())
}
```

- [ ] **Step 2: CRUD helpers**

Implement `add_book`, `list_books`, `get_book`, `delete_book`.

- [ ] **Step 3: Store on download completion**

In the download orchestrator, after PDF creation, insert a `LibraryBook` row.

- [ ] **Step 4: Expose list command**

```rust
#[command]
pub async fn list_library_books(state: tauri::State<'_, SqlitePool>) -> Result<Vec<LibraryBook>, String> {
    library::list_books(&state).await.map_err(|e| e.to_string())
}
```

Add pool as managed state in `lib.rs`.

---

## Task 7: End-to-end smoke test

**Files:**
- Modify: `.worktrees/folio/src/App.tsx`
- Modify: `.worktrees/folio/src-tauri/src/lib.rs`

- [ ] **Step 1: Add queue download trigger in UI**

When user clicks "Download", invoke `download_books` with the queue items and settings.

- [ ] **Step 2: Listen for status events**

```tsx
useEffect(() => {
  const unlisten = listen('download-status', (event) => {
    const { id, status, pdf, message } = event.payload as any;
    updateItemStatus(id, status, pdf, message);
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

- [ ] **Step 3: Run smoke test**

```bash
cd .worktrees/folio
npm run tauri dev
```

Add `cannibalsnovelab0000keef`, start download, verify:
- Metadata loads.
- Thumbnail appears.
- Status transitions to done.
- PDF is created in output directory.

- [ ] **Step 4: Commit**

```bash
cd .worktrees/folio
git add .
git commit -m "feat: Folio Tauri rewrite with metadata, download, library store"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Modern Tauri/React UI | Tasks 1, 3 |
| Metadata + cover thumbnails | Tasks 2, 3 |
| Download engine in Rust | Tasks 4, 5 |
| Queue + settings + about modal | Task 3 |
| Keyboard shortcuts | Task 3 |
| Library SQLite store | Task 6 |
| End-to-end smoke test | Task 7 |

## Placeholder Scan

No `TBD` or `TODO` in the plan. Some code snippets are illustrative and may need minor crate API adjustments during implementation.
