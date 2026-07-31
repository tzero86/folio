# Archive.org Downloader — GUI Redesign Spec

## Design Read
A single-window desktop utility for downloading books from Archive.org. The current UI is a stacked form with a generic customtkinter "blue" theme. We want a warmer, more intentional "Library Card" aesthetic that surfaces book covers, keeps the console visible, and feels friendly without losing the practical workflow.

## Goals
- Surface book cover thumbnails in the queue.
- Restructure layout into a two-pane "sidebar queue + main workspace" form.
- Apply a warm dark palette with a single accent.
- Preserve all existing behavior: credentials, settings, console output, about dialog.
- Improve empty state, validation feedback, and progress visibility.
- Keep the implementation within `gui.py` and `archive_org_downloader.py`; no new dependencies beyond what is already in `requirements.txt`.

## Non-Goals
- Add a self-update feature.
- Replace customtkinter with another toolkit.
- Support light mode in this iteration (keep system-aware dark default; manual toggle can be added later).

## Color Tokens
CustomTkinter colors are passed as hex strings. We will standardize on:

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#121318` | Window background |
| `--bg-secondary` | `#1a1c23` | Cards, sidebar items |
| `--bg-elevated` | `#22252d` | Hover states, input backgrounds |
| `--text-primary` | `#f3f1ec` | Headings, primary labels |
| `--text-secondary` | `#a7a49d` | Body, placeholders, logs |
| `--text-muted` | `#6e6b66` | Disabled / hints |
| `--accent` | `#e67a5f` | Primary actions, progress bar, active states |
| `--accent-hover` | `#f08d74` | Button hover |
| `--danger` | `#e04f5f` | Remove, clear, errors |
| `--danger-hover` | `#f06b7a` | Danger hover |
| `--success` | `#5fae71` | Success messages |
| `--border` | `#2c2f38` | Dividers, input borders |

## Layout
Two-pane layout inside the existing `ctk.CTk` window.

```
+--------------------------------------------------+
|  Title / About          [Window controls]        |
+------------+-------------------------------------+
|            |  Settings Card (collapsible)         |
|  Queue     |   - Credentials                     |
|  Sidebar   |   - Output directory + Browse         |
|  (covers)  |   - Advanced toggles                  |
|            |                                     |
|            +-------------------------------------+
|            |  Console Output                     |
|            |  [progress bar]                     |
|            |  ...                                |
+------------+-------------------------------------+
|           [ START DOWNLOAD ]                       |
+--------------------------------------------------+
```

- Window size stays reasonable: `900x750` minimum, default `1100x800`, resizable.
- Left sidebar width: fixed 320 px; contains queue input, list, and clear button.
- Main area: settings card at top (collapsible to save space), console output below.
- Start Download button spans full width at bottom (or sits in a sticky footer).

## Components

### 1. Header
- Smaller title text with a book/archive icon concept.
- About button as a subtle icon/text button on the right.

### 2. Queue Sidebar
- Add-item input + Add button at the top of the sidebar.
- `CTkScrollableFrame` list of `ItemCard`s below.
- Each `ItemCard`:
  - 48 px cover thumbnail on the left (loaded from `https://archive.org/download/{id}/__ia_thumb.jpg`).
  - Title/ID label in the middle.
  - Small status badge (`queued`, `downloading`, `done`, `error`).
  - Remove button as a small icon-only danger button ("×").
- Empty state: a centered muted label + a small prompt when the queue is empty.
- "Clear All" as a small text/link button below the list, not a prominent red button.

### 3. Settings Card
A collapsible card (default: expanded) containing:
- Credentials row: Email / Password inputs side by side.
- Output directory row: input + Browse button.
- Advanced row: Generate PDF checkbox, Save Metadata checkbox, Resolution dropdown.
- "Save Credentials" as a secondary text button (with the existing plaintext warning dialog).

### 4. Console / Output
- Progress bar directly above the console text box.
- Console uses a slightly dimmed background (`#16181d`) and the monospace-ish font `SF Mono` / `Consolas`.
- Keep existing `StdoutRedirector` and tqdm parsing behavior.
- Auto-scroll to bottom.

### 5. Primary Action
- "Download {n} Books" button spanning the bottom.
- Disabled when queue is empty.
- Shows a loading state while a download is running.

### 6. About Dialog
- Keep as a modal top-level window but restyle to match the palette.
- Simplify text; keep legal disclaimer.

## Thumbnail Fetching
Add a small helper in `gui.py`:

```python
def book_id_from_url(url: str) -> str:
    return url.split('/')[4]

def fetch_thumbnail(book_id: str) -> ctk.CTkImage | None:
    url = f"https://archive.org/download/{book_id}/__ia_thumb.jpg"
    # Download via requests, resize to 48x48/64x64, return CTkImage.
    # Cache per session so re-renders don't re-fetch.
```

- Fetch asynchronously to avoid blocking the UI; show a placeholder color box while loading.
- On failure, show a generic book icon placeholder.
- Thumbnails are not saved to disk.

## Image-Handling Notes
- `PIL.Image` and `requests` are already dependencies.
- `CTkImage` supports PIL images directly.

## Accessibility / UX
- Larger input target sizes (min 32 px height for buttons).
- Clear focus ring using the accent color.
- Error state: red input border + inline message under the URL input (not just red border).
- Success state: transient toast/label instead of the full-screen "Credentials Saved!" overlay.

## State Changes
- `ItemRow` class becomes `ItemCard` and gains cover + status fields.
- `App` splits layout into `queue_frame` (left) and `workspace_frame` (right).
- `start_download` updates item statuses during the run; pass a simple callback into `process_downloads` to report per-book status.

## Minimal Backend Change
Extend `archive_org_downloader.process_downloads` to accept an optional status callback:

```python
def process_downloads(..., status_callback=None):
    if status_callback:
        status_callback(book_id, 'started')
    ...
    if status_callback:
        status_callback(book_id, 'done')
```

`gui.py` will pass a callback that updates the matching `ItemCard` status badge.

## Acceptance Criteria
- [ ] Window opens with new two-pane layout.
- [ ] Adding a valid Archive.org URL shows a cover thumbnail within 2 seconds.
- [ ] Invalid URL shows inline error message and red border.
- [ ] Settings card can be collapsed/expanded.
- [ ] Console output and progress bar behave exactly as before.
- [ ] Download button label reflects queue count.
- [ ] About dialog still opens and is readable.
- [ ] No new runtime dependencies.
- [ ] Smoke test: download one book successfully end-to-end.
