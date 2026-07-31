import customtkinter as ctk
import json
import os
import sys
import threading
import queue
import re
import io
from tkinter import filedialog, messagebox

import requests
import archive_org_downloader
from PIL import Image

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

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)


def book_id_from_url(url: str) -> str:
    """Extract the Archive.org identifier from a /details/ URL."""
    url = url.rstrip('/')
    parts = url.split('/')
    if len(parts) >= 5 and parts[2] == 'archive.org' and parts[3] == 'details':
        return parts[4]
    raise ValueError(f"Cannot extract book id from URL: {url}")


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


def make_placeholder(size: tuple[int, int] = _PLACEHOLDER_SIZE, color: str = "#2c2f38") -> ctk.CTkImage:
    """Return a simple colored rectangle placeholder."""
    image = Image.new('RGB', size, color)
    return ctk.CTkImage(image, size=size)


ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

CONFIG_FILE = 'config.json'

def load_credentials():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {'username': '', 'password': ''}
    return {'username': '', 'password': ''}

def save_credentials(username, password, output_dir=None):
    data = {'username': username, 'password': password}
    if output_dir:
        data['output_dir'] = output_dir
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f)

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

class StdoutRedirector:
    def __init__(self, queue):
        self.queue = queue

    def write(self, text):
        if text:
            self.queue.put(text)

    def flush(self):
        pass

class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        # Window setup
        self.title("Archive.org Downloader")
        self.geometry("1100x800")
        self.minsize(900, 700)
        self.configure(fg_color=COLORS['bg_primary'])

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

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

    def toggle_settings(self):
        if self._settings_expanded:
            self.settings_body.grid_remove()
            self.collapse_btn.configure(text="+")
        else:
            self.settings_body.grid()
            self.collapse_btn.configure(text="−")
        self._settings_expanded = not self._settings_expanded

    def save_creds(self):
        answer = messagebox.askyesno(
            "Save Credentials",
            "Credentials will be stored in plain text in config.json in the current folder.\n\n"
            "Do you want to continue?"
        )
        if not answer:
            return
        save_credentials(self.user_entry.get(), self.pass_entry.get(), self.dir_entry.get())
        dialog = ctk.CTkLabel(self, text="Credentials Saved!", fg_color="#10b981", text_color="white", corner_radius=6)
        dialog.place(relx=0.5, rely=0.5, anchor="center")
        self.after(2000, dialog.destroy)

    def browse_dir(self):
        d = filedialog.askdirectory(initialdir=self.dir_entry.get())
        if d:
            self.dir_entry.delete(0, "end")
            self.dir_entry.insert(0, d)

    def add_item(self):
        text = self.item_entry.get().strip()
        if not text:
            return

        if not text.startswith("https://archive.org/details/"):
            self.item_entry.configure(border_color="red")
            return

        self.item_entry.configure(border_color=["#979DA2", "#565B5E"])

        row = ItemCard(self.list_scroll, text, self.remove_item)
        self.items_list.append(row)
        self.item_entry.delete(0, "end")
        self.update_list_header()

    def remove_item(self, row_widget):
        row_widget.destroy()
        if row_widget in self.items_list:
            self.items_list.remove(row_widget)
        self.update_list_header()
    
    def clear_items(self):
        for row in self.items_list:
            row.destroy()
        self.items_list.clear()
        self.update_list_header()
        
    def update_list_header(self):
        count = len(self.items_list)
        self.list_label.configure(text=f"Download Queue ({count} items)")

    def print_output(self, text):
        self.output_text.configure(state="normal")

        percentages = re.findall(r'(\d+)%', text)
        if percentages:
            try:
                percent = int(percentages[-1])
                self.progress_bar.set(min(percent / 100.0, 1.0))
            except ValueError:
                pass

        if '\r' in text:
            lines = text.split('\r')
            for line in lines:
                if not line:
                    continue
                self.output_text.delete("end-2l", "end-1c")
                self.output_text.insert("end", line + "\n")
        else:
            self.output_text.insert("end", text + "\n")

        self.output_text.see("end")
        self.output_text.configure(state="disabled")

    def start_download(self):
        username = self.user_entry.get()
        password = self.pass_entry.get()
        items = [row.url for row in self.items_list]

        if not items:
            self.print_output("Error: Please add at least one item queue.\n")
            return
            
        out_dir = self.dir_entry.get()
        if not out_dir:
            out_dir = os.getcwd()

        # Advanced options
        resolution_str = self.res_option.get().split(" ")[0] # "3 (Default)" -> "3"
        try:
            resolution = int(resolution_str)
        except:
            resolution = 3
            
        generate_pdf = self.pdf_var.get()
        save_meta = self.meta_var.get()
        jpg_output = not generate_pdf

        self.set_ui_enabled(False)
        self.progress_bar.set(0)
        self.print_output(f"--- Starting Download for {len(items)} items ---\n")
        
        # Start worker
        self._running_thread = threading.Thread(
            target=self.worker, 
            args=(username, password, items, out_dir, resolution, jpg_output, save_meta)
        )
        self._running_thread.start()
        self.after(100, self.poll_queue)

    def worker(self, username, password, items, out_dir, resolution, jpg_output, save_meta):
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
                meta_output=save_meta
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
                    self.progress_bar.set(1.0) # Finish bar
                    self.print_output("\n--- Process Finished ---\n")
                    return
                self.print_output(msg)
        except queue.Empty:
            pass
        self.after(100, self.poll_queue)

    def set_ui_enabled(self, enabled):
        state = "normal" if enabled else "disabled"
        self.start_btn.configure(state=state)
        self.add_btn.configure(state=state)
        # Disable clear button too during download
        self.clear_btn.configure(state=state)

    def open_about(self):
        about_window = ctk.CTkToplevel(self)
        about_window.title("About")
        about_window.geometry("450x550")
        about_window.resizable(False, False)
        
        # Make modal
        about_window.transient(self)
        about_window.grab_set()

        # Logo
        try:
            ico_path = resource_path("app.ico")
            if os.path.exists(ico_path):
                img = ctk.CTkImage(Image.open(ico_path), size=(64, 64))
                ctk.CTkLabel(about_window, text="", image=img).pack(pady=(20, 10))
        except Exception:
            pass

        ctk.CTkLabel(about_window, text="Archive.org Downloader", font=ctk.CTkFont(size=22, weight="bold")).pack(pady=(5, 5))
        ctk.CTkLabel(about_window, text="Version 1.1.0").pack(pady=2)
        
        # Scrollable Info Area
        info_frame = ctk.CTkScrollableFrame(about_window, width=350, height=250, fg_color="transparent")
        info_frame.pack(pady=15, padx=20, fill="both", expand=True)
        
        info_text = (
            "A GUI tool for bulk downloading books from Archive.org.\n\n"
            "Features:\n"
            "• Add items by URL or ID\n"
            "• Bulk Queue Management\n"
            "• Automated Account Loans\n"
            "• Image Fetching\n"
            "• Automatic PDF Conversion\n\n"
            "--- LEGAL DISCLAIMER ---\n"
            "This software is provided for educational and archiving purposes only. "
            "The authors assume no liability for misuse of this tool or violations of "
            "Archive.org's Terms of Service. Users are responsible for ensuring they have "
            "the right to download and store any content accessed through this tool.\n\n"
            "Please use responsibly."
        )
        
        # Use a label inside scroll frame for text wrapping
        desc_label = ctk.CTkLabel(info_frame, text=info_text, justify="left", wraplength=320, text_color=("gray20", "gray80"))
        desc_label.pack(fill="x", pady=5)
        
        # Wide Close Button
        ctk.CTkButton(about_window, text="Close", command=about_window.destroy, width=200, height=35).pack(pady=20)

if __name__ == "__main__":
    app = App()
    app.mainloop()
