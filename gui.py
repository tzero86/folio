import customtkinter as ctk
import json
import os
import sys
import threading
import queue
import re
from tkinter import filedialog, messagebox

import archive_org_downloader
from PIL import Image

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

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

class ItemRow(ctk.CTkFrame):
    """A single row representing an item in the download list."""
    def __init__(self, master, item_text, remove_callback, *args, **kwargs):
        super().__init__(master, fg_color="transparent", *args, **kwargs)
        self.pack(fill="x", pady=2)
        
        self.label = ctk.CTkLabel(self, text=item_text, anchor="w")
        self.label.pack(side="left", padx=5, fill="x", expand=True)
        
        self.remove_btn = ctk.CTkButton(self, text="Remove", width=60, height=24, 
                                        fg_color="#ef4444", hover_color="#dc2626", 
                                        command=lambda: remove_callback(self, item_text))
        self.remove_btn.pack(side="right", padx=5)
        self.item_text = item_text

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
        self.geometry("800x850") 
        self.minsize(600, 650)

        # Grid configuration
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=10) # Items List

        self.items_list = [] # Store ItemRow objects
        
        # --- 0. Header ---
        self.header_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.header_frame.grid(row=0, column=0, sticky="ew", padx=20, pady=(20, 10))
        self.title_label = ctk.CTkLabel(self.header_frame, text="Archive.org Downloader", font=ctk.CTkFont(size=24, weight="bold"))
        self.title_label.pack(side="left")
        
        self.about_btn = ctk.CTkButton(self.header_frame, text="About", width=60, height=24, command=self.open_about, fg_color="transparent", border_width=1, text_color=("gray10", "gray90"))
        self.about_btn.pack(side="right")

        # --- 1. Settings Section (Card-like) ---
        self.settings_frame = ctk.CTkFrame(self)
        self.settings_frame.grid(row=1, column=0, sticky="ew", padx=20, pady=10)
        self.settings_frame.grid_columnconfigure(1, weight=1)

        creds = load_credentials()
        
        # Row 0: Username
        self.user_label = ctk.CTkLabel(self.settings_frame, text="Username / Email:")
        self.user_label.grid(row=0, column=0, padx=15, pady=(15, 5), sticky="e")
        self.user_entry = ctk.CTkEntry(self.settings_frame, placeholder_text="archive.org email")
        self.user_entry.grid(row=0, column=1, padx=(0, 15), pady=(15, 5), sticky="ew")
        self.user_entry.insert(0, creds.get('username', ''))

        # Row 1: Password
        self.pass_label = ctk.CTkLabel(self.settings_frame, text="Password:")
        self.pass_label.grid(row=1, column=0, padx=15, pady=5, sticky="e")
        self.pass_entry = ctk.CTkEntry(self.settings_frame, show="*", placeholder_text="password")
        self.pass_entry.grid(row=1, column=1, padx=(0, 15), pady=5, sticky="ew")
        self.pass_entry.insert(0, creds.get('password', ''))

        # Row 2: Output Dir
        self.dir_label = ctk.CTkLabel(self.settings_frame, text="Output Directory:")
        self.dir_label.grid(row=2, column=0, padx=15, pady=5, sticky="e")
        self.dir_entry = ctk.CTkEntry(self.settings_frame, placeholder_text="Select download location...")
        self.dir_entry.grid(row=2, column=1, padx=(0, 5), pady=5, sticky="ew")
        last_dir = creds.get('output_dir', '')
        self.dir_entry.insert(0, last_dir if last_dir else os.getcwd())
        
        self.browse_btn = ctk.CTkButton(self.settings_frame, text="Browse", width=80, command=self.browse_dir)
        self.browse_btn.grid(row=2, column=2, padx=15, pady=5)
        
        # Row 3: Advanced Options (Collapsible-ish via checkbox or just visible)
        # Let's make a dedicated row for it
        self.adv_frame = ctk.CTkFrame(self.settings_frame, fg_color="transparent")
        self.adv_frame.grid(row=3, column=0, columnspan=3, sticky="ew", padx=15, pady=(5, 10))
        
        ctk.CTkLabel(self.adv_frame, text="Advanced:", font=ctk.CTkFont(weight="bold")).pack(side="left", padx=(0, 10))
        
        self.pdf_var = ctk.BooleanVar(value=True)
        self.pdf_check = ctk.CTkCheckBox(self.adv_frame, text="Generate PDF", variable=self.pdf_var)
        self.pdf_check.pack(side="left", padx=10)
        
        self.meta_var = ctk.BooleanVar(value=False)
        self.meta_check = ctk.CTkCheckBox(self.adv_frame, text="Save Metadata", variable=self.meta_var)
        self.meta_check.pack(side="left", padx=10)
        
        ctk.CTkLabel(self.adv_frame, text="Resolution:").pack(side="left", padx=(20, 5))
        self.res_option = ctk.CTkOptionMenu(self.adv_frame, values=["0 (Best)", "1", "2", "3 (Default)", "4", "5"], width=100)
        self.res_option.set("3 (Default)")
        self.res_option.pack(side="left")

        # Row 4: Buttons
        self.save_btn = ctk.CTkButton(self.settings_frame, text="Save Credentials", command=self.save_creds, height=32)
        self.save_btn.grid(row=4, column=0, columnspan=3, padx=15, pady=(10, 15), sticky="ew")

        # --- 2. Items Section ---
        self.items_container = ctk.CTkFrame(self, fg_color="transparent")
        self.items_container.grid(row=2, column=0, sticky="nsew", padx=20, pady=10)
        self.items_container.grid_rowconfigure(2, weight=1)
        self.items_container.grid_columnconfigure(0, weight=1)

        # Input Row
        self.input_frame = ctk.CTkFrame(self.items_container, fg_color="transparent")
        self.input_frame.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        
        self.item_entry = ctk.CTkEntry(self.input_frame, placeholder_text="Enter Identifier or URL (e.g., https://archive.org/details/...)")
        self.item_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        self.item_entry.bind("<Return>", lambda e: self.add_item())
        
        self.add_btn = ctk.CTkButton(self.input_frame, text="Add Item", width=100, command=self.add_item)
        self.add_btn.pack(side="right")

        # List Header Row (Label + Clear Button)
        self.list_header_frame = ctk.CTkFrame(self.items_container, fg_color="transparent")
        self.list_header_frame.grid(row=1, column=0, sticky="ew", pady=(0, 5))
        
        self.list_label = ctk.CTkLabel(self.list_header_frame, text="Download Queue (0 items)", font=ctk.CTkFont(size=14, weight="bold"))
        self.list_label.pack(side="left")
        
        self.clear_btn = ctk.CTkButton(self.list_header_frame, text="Clear All", width=80, height=24, fg_color="#ef4444", hover_color="#dc2626", command=self.clear_items)
        self.clear_btn.pack(side="right")
        
        self.list_scroll = ctk.CTkScrollableFrame(self.items_container, label_text="Items")
        self.list_scroll.grid(row=2, column=0, sticky="nsew")

        # --- 3. Action Section ---
        self.action_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.action_frame.grid(row=3, column=0, sticky="ew", padx=20, pady=10)
        
        self.start_btn = ctk.CTkButton(self.action_frame, text="START DOWNLOAD", command=self.start_download, 
                                       height=45, font=ctk.CTkFont(size=16, weight="bold"), 
                                       fg_color="#10b981", hover_color="#059669")
        self.start_btn.pack(fill="x")

        # --- 4. Output Section ---
        self.output_frame = ctk.CTkFrame(self)
        self.output_frame.grid(row=4, column=0, sticky="nsew", padx=20, pady=(0, 20))
        self.grid_rowconfigure(2, weight=10)
        self.grid_rowconfigure(4, weight=1)
        
        # Progress Bar
        self.progress_bar = ctk.CTkProgressBar(self.output_frame, height=12)
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x", padx=10, pady=(10, 5))

        self.output_label = ctk.CTkLabel(self.output_frame, text="Console Output", anchor="w")
        self.output_label.pack(fill="x", padx=10, pady=(5, 0))
        
        self.output_text = ctk.CTkTextbox(self.output_frame, font=("Consolas", 12))
        self.output_text.pack(fill="both", expand=True, padx=10, pady=10)
        self.output_text.configure(state="disabled")

        # --- Queue ---
        self._output_queue = queue.Queue()
        self._running_thread = None

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

        row = ItemRow(self.list_scroll, text, self.remove_item)
        self.items_list.append(row)
        self.item_entry.delete(0, "end")
        self.update_list_header()

    def remove_item(self, row_widget, item_text):
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
        items = [row.item_text for row in self.items_list]

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
