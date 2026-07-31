> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# Archive.org Downloader GUI Redesign — Implementation Plan

**Goal:** Rewrite `gui.py` into a two-pane "Library Card" layout with book cover thumbnails, a collapsible settings card, and a modern warm-dark aesthetic, while preserving the existing download workflow and console output.

**Architecture:** Split the single `App` layout into a fixed-width queue sidebar and a resizable main workspace. Extract reusable components (`ItemCard`, `StatusBadge`, `IconButton`) into small focused classes. Add a lightweight status callback from `archive_org_downloader.process_downloads` so the GUI can update per-item status badges. Use `CTkImage` + `requests` for cover thumbnails (already dependencies).

**Tech Stack:** Python 3.10+, customtkinter, Pillow, requests. No new dependencies.

---

## File Map

| File | Responsibility |
|------|----------------|
| `archive_org_downloader.py` | Backend download logic; add optional `status_callback` hook. |
| `gui.py` | Complete UI: layout, components, thumbnail fetching, event wiring. |
| `tests/test_archive_org_downloader.py` (new) | Small regression tests for `book_id` parsing and status callback hook. |

---

### Task 1: Add status callback hook to backend

**Files:**
- Modify: `archive_org_downloader.py:process_downloads`

- [ ] **Step 1: Locate the function signature and per-book loop**

Open `archive_org_downloader.py` and find:

```python
def process_downloads(email, password, urls, output_dir, resolution=3, threads=50, jpg_output=False, meta_output=False):
```

- [ ] **Step 2: Add optional `status_callback` parameter**

Change the signature to:

```python
def process_downloads(email, password, urls, output_dir, resolution=3, threads=50, jpg_output=False, meta_output=False, status_callback=None):
```

- [ ] **Step 3: Emit status events inside the per-book loop**

Inside the `for url in valid_urls:` loop, after `book_id` is parsed and before `return_loan`, add:

```python
if status_callback:
    status_callback(book_id, 'started')
```

Then, directly before the final `return_loan(session, book_id)` call inside the `try` block, add:

```python
if status_callback:
    status_callback(book_id, 'done')
```

And in the `except Exception as e:` block, before the optional `return_loan`, add:

```python
if status_callback:
    status_callback(book_id, 'error', str(e))
```

- [ ] **Step 4: Run syntax check**

Run:

```bash
python -m py_compile archive_org_downloader.py
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add archive_org_downloader.py
git commit -m "feat: add optional status_callback to process_downloads"
```

---

### Task 2: Create thumbnail helper module

**Files:**
- Modify: `gui.py` (top-level helper functions)

- [ ] **Step 1: Add imports**

At the top of `gui.py`, ensure these are present:

```python
import requests
import io
from PIL import Image
```

`requests` is already in `requirements.txt`; `PIL` is a transitive dependency via `customtkinter`.

- [ ] **Step 2: Add `book_id_from_url` helper**

Insert after the `resource_path` function:

```python
def book_id_from_url(url: str) -> str:
    """Extract the Archive.org identifier from a /details/ URL."""
    url = url.rstrip('/')
    parts = url.split('/')
    if len(parts) >= 5 and parts[2] == 'archive.org' and parts[3] == 'details':
        return parts[4]
    raise ValueError(f"Cannot extract book id from URL: {url}")
```

- [ ] **Step 3: Add `fetch_thumbnail` helper with caching**

Below `book_id_from_url`, add:

```python
_THUMBNAIL_CACHE: dict[str, ctk.CTkImage | None] = {}
_PLACEHOLDER_SIZE = (64, 80)

def fetch_thumbnail(book_id: str, size: tuple[int, int] = _PLACEHOLDER_SIZE) -> ctk.CTkImage | None:
    """Fetch and cache a 64x80 cover thumbnail from Archive.org."""
    if book_id in _THUMBNAIL_CACHE:
        return _THUMBNAIL_CACHE[book_id]

    url = f"https://archive.org/download/{book_id}/__ia_thumb.jpg"
    try:
        response = requests.get(url, timeout=8)
        if response.status_code != 200:
            _THUMBNAIL_CACHE[book_id] = None
            return None
        image = Image.open(io.BytesIO(response.content))
        image = image.convert('RGB')
        image.thumbnail(size, Image.Resampling.LANCZOS)
        ctk_image = ctk.CTkImage(image, size=image.size)
        _THUMBNAIL_CACHE[book_id] = ctk_image
        return ctk_image
    except Exception:
        _THUMBNAIL_CACHE[book_id] = None
        return None
```

- [ ] **Step 4: Add placeholder helper**

Below `fetch_thumbnail`, add:

```python
def make_placeholder(size: tuple[int, int] = _PLACEHOLDER_SIZE, color: str = "#2c2f38") -> ctk.CTkImage:
    """Return a simple colored rectangle placeholder."""
    image = Image.new('RGB', size, color)
    return ctk.CTkImage(image, size=size)
```

- [ ] **Step 5: Syntax check**

```bash
python -m py_compile gui.py
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add gui.py
git commit -m "feat: add thumbnail fetching helpers"
```

---

### Task 3: Create reusable UI components

**Files:**
- Modify: `gui.py` (replace existing `ItemRow` and add `IconButton`, `StatusBadge`)

- [ ] **Step 1: Define color tokens as module constants**

At the top of `gui.py`, after imports, add:

```python
COLORS = {
    'bg_primary': '#121318',
    'bg_secondary': '#1a1c23',
    'bg_elevated': '#22252d',
    'text_primary': '#f3f1ec',
    'text_secondary': '#a7a49d',
    'text_muted': '#6e6b66',
    'accent': '#e67a5f',
    'accent_hover': '#f08d74',
    'danger': '#e04f5f',
    'danger_hover': '#f06b7a',
    'success': '#5fae71',
    'border': '#2c2f38',
}
```

- [ ] **Step 2: Add `IconButton` component**

Replace the old `ItemRow` class with:

```python
class IconButton(ctk.CTkButton):
    def __init__(self, master, symbol: str, command=None, size: int = 28, fg_color="transparent", hover_color=None, text_color=None, **kwargs):
        super().__init__(
            master,
            text=symbol,
            width=size,
            height=size,
            fg_color=fg_color,
            hover_color=hover_color or COLORS['bg_elevated'],
            text_color=text_color or COLORS['text_secondary'],
            font=ctk.CTkFont(size=14, weight="bold"),
            command=command,
            **kwargs
        )
```

- [ ] **Step 3: Add `StatusBadge` component**

```python
class StatusBadge(ctk.CTkLabel):
    STATUS_COLORS = {
        'queued': ('#3a322a', '#a7a49d'),
        'downloading': ('#3d2e28', '#e67a5f'),
        'done': ('#26382c', '#5fae71'),
        'error': ('#3b2228', '#e04f5f'),
    }

    def __init__(self, master, status='queued'):
        bg, fg = self.STATUS_COLORS.get(status, self.STATUS_COLORS['queued'])
        super().__init__(master, text=status.upper(), fg_color=bg, text_color=fg, font=ctk.CTkFont(size=10, weight="bold"), corner_radius=4, padx=8, pady=2)
        self._status = status

    def set_status(self, status: str):
        self._status = status
        bg, fg = self.STATUS_COLORS.get(status, self.STATUS_COLORS['queued'])
        self.configure(text=status.upper(), fg_color=bg, text_color=fg)
```

- [ ] **Step 4: Add `ItemCard` component**

```python
class ItemCard(ctk.CTkFrame):
    def __init__(self, master, url: str, remove_callback, **kwargs):
        super().__init__(master, fg_color=COLORS['bg_secondary'], corner_radius=8, border_width=1, border_color=COLORS['border'], **kwargs)
        self.pack(fill="x", pady=4, padx=4)
        self.url = url
        self.book_id = book_id_from_url(url)

        # Thumbnail
        self.thumb_label = ctk.CTkLabel(self, text="", image=make_placeholder(), width=64, height=80, fg_color=COLORS['bg_elevated'], corner_radius=6)
        self.thumb_label.pack(side="left", padx=(10, 12), pady=10)

        # Info
        info_frame = ctk.CTkFrame(self, fg_color="transparent")
        info_frame.pack(side="left", fill="both", expand=True, pady=10)

        self.title_label = ctk.CTkLabel(info_frame, text=self.book_id, anchor="w", font=ctk.CTkFont(size=14, weight="bold"), text_color=COLORS['text_primary'])
        self.title_label.pack(fill="x")

        self.url_label = ctk.CTkLabel(info_frame, text=url, anchor="w", font=ctk.CTkFont(size=11), text_color=COLORS['text_muted'])
        self.url_label.pack(fill="x")

        self.status_badge = StatusBadge(info_frame)
        self.status_badge.pack(anchor="w", pady=(6, 0))

        # Remove button
        self.remove_btn = IconButton(self, "×", command=lambda: remove_callback(self), size=32, hover_color=COLORS['danger_hover'], text_color=COLORS['text_secondary'])
        self.remove_btn.pack(side="right", padx=10, pady=10)

        # Load thumbnail asynchronously
        self.after(50, self._load_thumbnail)

    def _load_thumbnail(self):
        thumb = fetch_thumbnail(self.book_id)
        if thumb:
            self.thumb_label.configure(image=thumb)

    def set_status(self, status: str):
        self.status_badge.set_status(status)
```

- [ ] **Step 5: Syntax check**

```bash
python -m py_compile gui.py
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add gui.py
git commit -m "feat: add reusable UI components (IconButton, StatusBadge, ItemCard)"
```

---

### Task 4: Rewrite main App layout

**Files:**
- Modify: `gui.py` (replace `App.__init__` and helper methods)

- [ ] **Step 1: Update window configuration**

In `App.__init__`, replace the geometry lines with:

```python
self.title("Archive.org Downloader")
self.geometry("1100x800")
self.minsize(900, 700)
self.configure(fg_color=COLORS['bg_primary'])

self.grid_columnconfigure(1, weight=1)
self.grid_rowconfigure(0, weight=1)
```

- [ ] **Step 2: Build the left sidebar**

Replace the old header/settings/items/action/output construction with a two-pane structure. First, the sidebar:

```python
# Sidebar
self.sidebar = ctk.CTkFrame(self, fg_color=COLORS['bg_secondary'], width=320, corner_radius=0)
self.sidebar.grid(row=0, column=0, sticky="nsew")
self.sidebar.grid_propagate(False)
self.sidebar.grid_rowconfigure(2, weight=1)

# Sidebar header
self.header_frame = ctk.CTkFrame(self.sidebar, fg_color="transparent")
self.header_frame.pack(fill="x", padx=20, pady=(20, 16))
ctk.CTkLabel(self.header_frame, text="Archive.org", font=ctk.CTkFont(size=20, weight="bold"), text_color=COLORS['text_primary']).pack(side="left")
ctk.CTkLabel(self.header_frame, text="Downloader", font=ctk.CTkFont(size=20, weight="normal"), text_color=COLORS['text_secondary']).pack(side="left", padx=(4, 0))
self.about_btn = IconButton(self.header_frame, "?", command=self.open_about, size=32)
self.about_btn.pack(side="right")

# Add item input
self.input_frame = ctk.CTkFrame(self.sidebar, fg_color=COLORS['bg_elevated'], corner_radius=8, border_width=1, border_color=COLORS['border'])
self.input_frame.pack(fill="x", padx=16, pady=(0, 12))
self.input_frame.grid_columnconfigure(0, weight=1)

self.item_entry = ctk.CTkEntry(self.input_frame, placeholder_text="Paste /details/ URL or book ID...", fg_color="transparent", border_width=0, text_color=COLORS['text_primary'])
self.item_entry.grid(row=0, column=0, sticky="ew", padx=12, pady=10)
self.item_entry.bind("<Return>", lambda e: self.add_item())

self.add_btn = IconButton(self.input_frame, "+", command=self.add_item, size=32, hover_color=COLORS['accent_hover'], text_color=COLORS['accent'])
self.add_btn.grid(row=0, column=1, padx=(0, 8), pady=4)

self.url_error = ctk.CTkLabel(self.sidebar, text="", font=ctk.CTkFont(size=11), text_color=COLORS['danger'])
self.url_error.pack(fill="x", padx=20, pady=(0, 8))

# Queue list
self.list_label = ctk.CTkLabel(self.sidebar, text="Download Queue (0 items)", font=ctk.CTkFont(size=14, weight="bold"), text_color=COLORS['text_primary'])
self.list_label.pack(anchor="w", padx=20, pady=(8, 8))

self.list_scroll = ctk.CTkScrollableFrame(self.sidebar, fg_color=COLORS['bg_secondary'], corner_radius=0, label_text="")
self.list_scroll.pack(fill="both", expand=True, padx=12, pady=(0, 8))

self.empty_label = ctk.CTkLabel(self.list_scroll, text="Add a book URL to get started", font=ctk.CTkFont(size=13), text_color=COLORS['text_muted'])
self.empty_label.pack(pady=40)

# Clear all link
self.clear_btn = ctk.CTkButton(self.sidebar, text="Clear Queue", command=self.clear_items, fg_color="transparent", hover_color=COLORS['bg_elevated'], text_color=COLORS['text_secondary'], font=ctk.CTkFont(size=12), height=28)
self.clear_btn.pack(anchor="w", padx=20, pady=(0, 16))
```

- [ ] **Step 3: Build the main workspace**

```python
# Main workspace
self.workspace = ctk.CTkFrame(self, fg_color=COLORS['bg_primary'], corner_radius=0)
self.workspace.grid(row=0, column=1, sticky="nsew", padx=24, pady=24)
self.workspace.grid_columnconfigure(0, weight=1)
self.workspace.grid_rowconfigure(1, weight=1)

# Settings card
self.settings_card = ctk.CTkFrame(self.workspace, fg_color=COLORS['bg_secondary'], corner_radius=12, border_width=1, border_color=COLORS['border'])
self.settings_card.grid(row=0, column=0, sticky="ew", pady=(0, 16))
self.settings_card.grid_columnconfigure(1, weight=1)

# Settings header with collapse toggle
self.settings_header = ctk.CTkFrame(self.settings_card, fg_color="transparent")
self.settings_header.grid(row=0, column=0, columnspan=3, sticky="ew", padx=16, pady=(12, 0))
self.settings_header.grid_columnconfigure(0, weight=1)
ctk.CTkLabel(self.settings_header, text="Settings", font=ctk.CTkFont(size=16, weight="bold"), text_color=COLORS['text_primary']).grid(row=0, column=0, sticky="w")
self.collapse_btn = IconButton(self.settings_header, "−", command=self.toggle_settings, size=28)
self.collapse_btn.grid(row=0, column=1, sticky="e")

# Settings body
self.settings_body = ctk.CTkFrame(self.settings_card, fg_color="transparent")
self.settings_body.grid(row=1, column=0, columnspan=3, sticky="ew", padx=16, pady=12)
self.settings_body.grid_columnconfigure(1, weight=1)

creds = load_credentials()

# Email / Password row
ctk.CTkLabel(self.settings_body, text="Email:", text_color=COLORS['text_secondary']).grid(row=0, column=0, sticky="e", padx=(0, 10))
self.user_entry = ctk.CTkEntry(self.settings_body, placeholder_text="archive.org email", fg_color=COLORS['bg_elevated'], border_color=COLORS['border'], text_color=COLORS['text_primary'])
self.user_entry.grid(row=0, column=1, sticky="ew", pady=6)
self.user_entry.insert(0, creds.get('username', ''))

ctk.CTkLabel(self.settings_body, text="Password:", text_color=COLORS['text_secondary']).grid(row=1, column=0, sticky="e", padx=(0, 10))
self.pass_entry = ctk.CTkEntry(self.settings_body, show="*", placeholder_text="password", fg_color=COLORS['bg_elevated'], border_color=COLORS['border'], text_color=COLORS['text_primary'])
self.pass_entry.grid(row=1, column=1, sticky="ew", pady=6)
self.pass_entry.insert(0, creds.get('password', ''))

# Output dir row
ctk.CTkLabel(self.settings_body, text="Output:", text_color=COLORS['text_secondary']).grid(row=2, column=0, sticky="e", padx=(0, 10))
self.dir_entry = ctk.CTkEntry(self.settings_body, placeholder_text="Select download folder...", fg_color=COLORS['bg_elevated'], border_color=COLORS['border'], text_color=COLORS['text_primary'])
self.dir_entry.grid(row=2, column=1, sticky="ew", pady=6)
last_dir = creds.get('output_dir', '')
self.dir_entry.insert(0, last_dir if last_dir else os.getcwd())
self.browse_btn = ctk.CTkButton(self.settings_body, text="Browse", width=80, command=self.browse_dir, fg_color=COLORS['bg_elevated'], hover_color=COLORS['bg_primary'], text_color=COLORS['text_primary'], border_color=COLORS['border'], border_width=1)
self.browse_btn.grid(row=2, column=2, padx=(10, 0))

# Advanced row
self.adv_frame = ctk.CTkFrame(self.settings_body, fg_color="transparent")
self.adv_frame.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(10, 0))

self.pdf_var = ctk.BooleanVar(value=True)
ctk.CTkCheckBox(self.adv_frame, text="Generate PDF", variable=self.pdf_var, fg_color=COLORS['accent'], text_color=COLORS['text_secondary']).pack(side="left", padx=(0, 16))

self.meta_var = ctk.BooleanVar(value=False)
ctk.CTkCheckBox(self.adv_frame, text="Save Metadata", variable=self.meta_var, fg_color=COLORS['accent'], text_color=COLORS['text_secondary']).pack(side="left", padx=(0, 16))

ctk.CTkLabel(self.adv_frame, text="Resolution:", text_color=COLORS['text_secondary']).pack(side="left", padx=(16, 8))
self.res_option = ctk.CTkOptionMenu(self.adv_frame, values=["0 (Best)", "1", "2", "3 (Default)", "4", "5"], width=110, fg_color=COLORS['bg_elevated'], button_color=COLORS['bg_elevated'], button_hover_color=COLORS['bg_primary'], text_color=COLORS['text_primary'])
self.res_option.set("3 (Default)")
self.res_option.pack(side="left")

# Save credentials
self.save_btn = ctk.CTkButton(self.settings_body, text="Save Credentials", command=self.save_creds, height=32, fg_color="transparent", hover_color=COLORS['bg_elevated'], text_color=COLORS['text_secondary'], border_color=COLORS['border'], border_width=1)
self.save_btn.grid(row=4, column=0, columnspan=3, sticky="w", pady=(16, 4))

# Console output
self.output_frame = ctk.CTkFrame(self.workspace, fg_color=COLORS['bg_secondary'], corner_radius=12, border_width=1, border_color=COLORS['border'])
self.output_frame.grid(row=1, column=0, sticky="nsew")
self.output_frame.grid_rowconfigure(2, weight=1)
self.output_frame.grid_columnconfigure(0, weight=1)

self.output_header = ctk.CTkFrame(self.output_frame, fg_color="transparent")
self.output_header.grid(row=0, column=0, sticky="ew", padx=16, pady=(12, 8))
ctk.CTkLabel(self.output_header, text="Console Output", font=ctk.CTkFont(size=14, weight="bold"), text_color=COLORS['text_primary']).pack(side="left")

self.progress_bar = ctk.CTkProgressBar(self.output_frame, height=6, fg_color=COLORS['bg_elevated'], progress_color=COLORS['accent'], corner_radius=3)
self.progress_bar.set(0)
self.progress_bar.grid(row=1, column=0, sticky="ew", padx=16, pady=(0, 8))

self.output_text = ctk.CTkTextbox(self.output_frame, fg_color=COLORS['bg_primary'], border_color=COLORS['border'], border_width=1, text_color=COLORS['text_secondary'], font=("SF Mono", 12) if sys.platform == "darwin" else ("Consolas", 12))
self.output_text.grid(row=2, column=0, sticky="nsew", padx=16, pady=(0, 16))
self.output_text.configure(state="disabled")

# Bottom action bar
self.action_frame = ctk.CTkFrame(self, fg_color=COLORS['bg_secondary'], height=72, corner_radius=0)
self.action_frame.grid(row=1, column=0, columnspan=2, sticky="ew")
self.action_frame.grid_propagate(False)
self.action_frame.grid_columnconfigure(0, weight=1)

self.start_btn = ctk.CTkButton(self.action_frame, text="Download 0 Books", command=self.start_download, height=44, font=ctk.CTkFont(size=15, weight="bold"), fg_color=COLORS['accent'], hover_color=COLORS['accent_hover'], text_color=COLORS['bg_primary'], corner_radius=8)
self.start_btn.grid(row=0, column=0, sticky="ew", padx=20, pady=14)

# Internal state
self.items_list: list[ItemCard] = []
self._output_queue = queue.Queue()
self._running_thread = None
self._settings_expanded = True
```

- [ ] **Step 4: Add `toggle_settings` method**

```python
def toggle_settings(self):
    if self._settings_expanded:
        self.settings_body.grid_remove()
        self.collapse_btn.configure(text="+")
    else:
        self.settings_body.grid()
        self.collapse_btn.configure(text="−")
    self._settings_expanded = not self._settings_expanded
```

- [ ] **Step 5: Syntax check**

```bash
python -m py_compile gui.py
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add gui.py
git commit -m "feat: rewrite main App layout into two-pane library-card design"
```

---

### Task 5: Update App methods for new components

**Files:**
- Modify: `gui.py` (replace `save_creds`, `browse_dir`, `add_item`, `remove_item`, `clear_items`, `update_list_header`, `set_ui_enabled`, `open_about`, `start_download`, `worker`, `poll_queue`, `print_output`)

- [ ] **Step 1: Update `save_creds`**

Replace with:

```python
def save_creds(self):
    if not messagebox.askyesno("Save Credentials", "Credentials will be stored in plain text in config.json.\n\nContinue?"):
        return
    save_credentials(self.user_entry.get(), self.pass_entry.get(), self.dir_entry.get())
    label = ctk.CTkLabel(self.settings_body, text="Credentials saved", text_color=COLORS['success'], font=ctk.CTkFont(size=12))
    label.grid(row=5, column=0, columnspan=3, sticky="w", pady=(4, 0))
    self.after(2000, label.destroy)
```

- [ ] **Step 2: Update `add_item` and helpers**

```python
def add_item(self):
    text = self.item_entry.get().strip()
    if not text:
        return

    # Accept raw IDs too
    url = text
    if not url.startswith("http"):
        url = f"https://archive.org/details/{text}"

    if not url.startswith("https://archive.org/details/"):
        self.url_error.configure(text="Enter a valid archive.org /details/ URL or book ID")
        self.item_entry.configure(border_color=COLORS['danger'])
        return

    self.url_error.configure(text="")
    self.item_entry.configure(border_color=COLORS['border'])

    card = ItemCard(self.list_scroll, url, self.remove_item)
    self.items_list.append(card)
    self.item_entry.delete(0, "end")
    self._update_empty_state()
    self.update_list_header()

def remove_item(self, card: ItemCard):
    card.destroy()
    if card in self.items_list:
        self.items_list.remove(card)
    self._update_empty_state()
    self.update_list_header()

def clear_items(self):
    for card in self.items_list:
        card.destroy()
    self.items_list.clear()
    self._update_empty_state()
    self.update_list_header()

def _update_empty_state(self):
    if self.items_list:
        self.empty_label.pack_forget()
    else:
        self.empty_label.pack(pady=40)

def update_list_header(self):
    count = len(self.items_list)
    self.list_label.configure(text=f"Download Queue ({count} item{'s' if count != 1 else ''})")
    self.start_btn.configure(text=f"Download {count} Book{'s' if count != 1 else ''}")
```

- [ ] **Step 3: Update `set_ui_enabled`**

```python
def set_ui_enabled(self, enabled: bool):
    state = "normal" if enabled else "disabled"
    self.start_btn.configure(state=state)
    self.add_btn.configure(state=state)
    self.item_entry.configure(state=state)
    self.clear_btn.configure(state=state)
    for card in self.items_list:
        card.remove_btn.configure(state=state)
```

- [ ] **Step 4: Update `open_about`**

```python
def open_about(self):
    about_window = ctk.CTkToplevel(self)
    about_window.title("About")
    about_window.geometry("420x520")
    about_window.resizable(False, False)
    about_window.configure(fg_color=COLORS['bg_primary'])
    about_window.transient(self)
    about_window.grab_set()

    try:
        ico_path = resource_path("app.ico")
        if os.path.exists(ico_path):
            img = ctk.CTkImage(Image.open(ico_path), size=(64, 64))
            ctk.CTkLabel(about_window, text="", image=img).pack(pady=(24, 10))
    except Exception:
        pass

    ctk.CTkLabel(about_window, text="Archive.org Downloader", font=ctk.CTkFont(size=22, weight="bold"), text_color=COLORS['text_primary']).pack()
    ctk.CTkLabel(about_window, text="Version 1.2.0", text_color=COLORS['text_muted']).pack(pady=2)

    info_frame = ctk.CTkScrollableFrame(about_window, width=340, height=240, fg_color=COLORS['bg_secondary'], corner_radius=8, border_color=COLORS['border'], border_width=1)
    info_frame.pack(pady=16, padx=24, fill="both", expand=True)

    info_text = (
        "A friendly desktop tool for bulk downloading books from Archive.org.\n\n"
        "Features:\n"
        "• Add items by URL or ID\n"
        "• Queue with cover thumbnails\n"
        "• Automated account loans\n"
        "• Configurable resolution and output\n"
        "• Automatic PDF conversion\n\n"
        "--- LEGAL DISCLAIMER ---\n"
        "This software is provided for educational and archiving purposes only. "
        "The authors assume no liability for misuse of this tool or violations of "
        "Archive.org's Terms of Service. Users are responsible for ensuring they have "
        "the right to download and store any content accessed through this tool.\n\n"
        "Please use responsibly."
    )
    ctk.CTkLabel(info_frame, text=info_text, justify="left", wraplength=300, text_color=COLORS['text_secondary']).pack(fill="x", pady=8)

    ctk.CTkButton(about_window, text="Close", command=about_window.destroy, width=200, height=36, fg_color=COLORS['bg_elevated'], hover_color=COLORS['border'], text_color=COLORS['text_primary'], border_color=COLORS['border'], border_width=1, corner_radius=8).pack(pady=(0, 20))
```

- [ ] **Step 5: Update `start_download` to pass status callback**

```python
def start_download(self):
    username = self.user_entry.get()
    password = self.pass_entry.get()
    items = [card.url for card in self.items_list]

    if not items:
        self.print_output("Error: Please add at least one item to the queue.\n")
        return

    out_dir = self.dir_entry.get() or os.getcwd()

    try:
        resolution = int(self.res_option.get().split()[0])
    except ValueError:
        resolution = 3

    jpg_output = not self.pdf_var.get()
    save_meta = self.meta_var.get()

    for card in self.items_list:
        card.set_status('queued')

    self.set_ui_enabled(False)
    self.progress_bar.set(0)
    self.print_output(f"--- Starting Download for {len(items)} item{'s' if len(items) != 1 else ''} ---\n")

    def status_callback(book_id: str, status: str, message: str = ""):
        self.after(0, lambda: self._update_card_status(book_id, status, message))

    self._running_thread = threading.Thread(
        target=self.worker,
        args=(username, password, items, out_dir, resolution, jpg_output, save_meta, status_callback)
    )
    self._running_thread.start()
    self.after(100, self.poll_queue)

def _update_card_status(self, book_id: str, status: str, message: str = ""):
    for card in self.items_list:
        if card.book_id == book_id:
            card.set_status(status)
            if status == 'error' and message:
                self.print_output(f"[{book_id}] {message}\n")
            break
```

- [ ] **Step 6: Update `worker` signature and `print_output` / `poll_queue`**

```python
def worker(self, username, password, items, out_dir, resolution, jpg_output, save_meta, status_callback):
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirector = StdoutRedirector(self._output_queue)
    sys.stdout = redirector
    sys.stderr = redirector

    try:
        archive_org_downloader.process_downloads(
            email=username,
            password=password,
            urls=items,
            output_dir=out_dir,
            resolution=resolution,
            jpg_output=jpg_output,
            meta_output=save_meta,
            status_callback=status_callback
        )
    except Exception as e:
        print(f"Detailed Error: {e}")
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        self._output_queue.put('__DONE__')

def poll_queue(self):
    try:
        while True:
            msg = self._output_queue.get_nowait()
            if msg == '__DONE__':
                self.set_ui_enabled(True)
                self.progress_bar.set(1.0)
                self.print_output("\n--- Process Finished ---\n")
                return
            self.print_output(msg)
    except queue.Empty:
        pass
    self.after(100, self.poll_queue)
```

`print_output` remains the same as the current version.

- [ ] **Step 7: Syntax check**

```bash
python -m py_compile gui.py
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add gui.py
git commit -m "feat: wire new UI components and status callbacks"
```

---

### Task 6: Add regression tests

**Files:**
- Create: `tests/test_archive_org_downloader.py`

- [ ] **Step 1: Create test file**

```python
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import archive_org_downloader as downloader


class TestBookIdParsing(unittest.TestCase):
    def test_canonical_url(self):
        self.assertEqual(downloader.book_id_from_url("https://archive.org/details/cannibalsnovelab0000keef"), "cannibalsnovelab0000keef")

    def test_url_with_page_mode(self):
        self.assertEqual(downloader.book_id_from_url("https://archive.org/details/cannibalsnovelab0000keef/page/8/mode/2up"), "cannibalsnovelab0000keef")

    def test_raw_id(self):
        self.assertEqual(downloader.book_id_from_url("IntermediatePython"), "IntermediatePython")


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Verify `book_id_from_url` is exported from `archive_org_downloader.py`**

After Task 1, add this helper to `archive_org_downloader.py`:

```python
def book_id_from_url(url: str) -> str:
    url = url.rstrip('/')
    if not url.startswith("http"):
        return url
    parts = url.split('/')
    if len(parts) >= 5 and parts[2] == 'archive.org' and parts[3] == 'details':
        return parts[4]
    raise ValueError(f"Cannot extract book id from URL: {url}")
```

- [ ] **Step 3: Run tests**

```bash
python -m unittest tests.test_archive_org_downloader -v
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_archive_org_downloader.py archive_org_downloader.py
git commit -m "test: add book id parsing regression tests"
```

---

### Task 7: Smoke test the redesigned UI

**Files:**
- Modify: none (manual verification)

- [ ] **Step 1: Run the GUI**

```bash
uv run python gui.py
```

- [ ] **Step 2: Verify checklist**

- [ ] Window opens with two-pane layout and warm dark colors.
- [ ] Adding `cannibalsnovelab0000keef` (raw ID) creates an `ItemCard` with a placeholder, then the real thumbnail loads.
- [ ] Adding an invalid string shows inline error and red input border.
- [ ] Settings card collapses/expands with the "−"/"+" button.
- [ ] Clicking "Download 1 Book" starts the run, progress bar moves, console output appears.
- [ ] Status badge on the item card changes to `DOWNLOADING`, then `DONE`.
- [ ] About dialog opens and closes.
- [ ] After run, controls re-enable.

- [ ] **Step 3: Commit any final tweaks**

If fixes were needed:

```bash
git add gui.py archive_org_downloader.py
git commit -m "fix: final UI polish from smoke test"
```

---

## Spec Coverage Check

| Spec Section | Task |
|--------------|------|
| Status callback hook | Task 1 |
| Thumbnail helper + caching | Task 2 |
| Color tokens + reusable components | Task 3 |
| Two-pane layout | Task 4 |
| Updated methods + status badges | Task 5 |
| Regression tests | Task 6 |
| Smoke test acceptance criteria | Task 7 |

## Placeholder Scan

No `TBD`, `TODO`, or vague steps. Every code block is complete.
