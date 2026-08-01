import { useState, useCallback, useEffect, useRef } from "react";
import { Library, List, Settings, Info, Search, ChevronsRight, ChevronsLeft } from "lucide-react";
import { motion } from "framer-motion";
import { openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { load as loadStore, Store } from "@tauri-apps/plugin-store";
import { Button } from "./components/ui/Button";
import { QueuePanel } from "./components/queue/QueuePanel";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { SearchPanel } from "./components/search/SearchPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SetupDialog } from "./components/settings/SetupDialog";
import { AboutDialog } from "./components/about/AboutDialog";
import { useShortcuts } from "./hooks/useShortcuts";
import { DebugConsole, useDebugConsole } from "./components/debug/DebugConsole";
import { ToastContainer, useToast } from "./components/ui/Toast";
import { metadataCache } from "./lib/cache";
import { fetchBookMetadata, onDownloadStatus, downloadBooks, findLibraryBook, addLibraryBook, getLogs, cancelDownload } from "./lib/tauri";
import { cn } from "./lib/utils";

import type { QueueItem, AppSettings, Tab, BookMetadata } from "./types";
import "./index.css";

const NAV: { id: Tab; label: string; icon: typeof List }[] = [
  { id: "queue", label: "Queue", icon: List },
  { id: "search", label: "Search", icon: Search },
  { id: "library", label: "Library", icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
];

function parseBookId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.includes("/")) return trimmed;
  const match = trimmed.match(/archive\.org\/details\/([^/?#]+)/);
  return match?.[1] ?? trimmed.split("/").pop() ?? trimmed;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const storeRef = useRef<Store | null>(null);
  const { logs, addLog, clearLogs } = useDebugConsole();
  const { toasts, addToast, dismissToast } = useToast();
  const [settings, setSettings] = useState<AppSettings>({
    email: "",
    password: "",
    outputDir: "",
    resolution: 2,
    createPdf: true,
    saveCredentials: false,
    saveMetadata: false,
    autoDownload: true,
    defaultTab: "library",
    theme: "dark",
    fontScale: 1,
    openOutputAfterDownload: false,
  });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; status: "downloading" | "ready" | "error"; progress: number } | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // --- Queue persistence across restarts ---
  const QUEUE_KEY = "folio.queue";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { id: string; urlOrId: string; metadata?: BookMetadata }[];
      if (!Array.isArray(saved) || saved.length === 0) return;
      setItems(
        saved.map((s) => ({
          id: s.id,
          urlOrId: s.urlOrId,
          status: "pending" as const,
          progress: 0,
          metadata: s.metadata,
        }))
      );
      setSelectedId(saved[0]?.id ?? null);
      addLog("info", `Restored ${saved.length} queued item(s)`);
    } catch (e) {
      addLog("error", "Failed to restore queue", String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const persistable = items
      .filter((i) => i.status !== "done" && i.status !== "error")
      .map((i) => ({ id: i.id, urlOrId: i.urlOrId, metadata: i.metadata }));
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(persistable));
    } catch {
      /* storage unavailable */
    }
  }, [items]);

  // --- Taskbar download progress ---
  useEffect(() => {
    const active = items.filter((i) => i.status === "downloading" || i.status === "started");
    try {
      const win = getCurrentWindow();
      if (active.length === 0) {
        win.setProgressBar({ status: ProgressBarStatus.None }).catch(() => {});
      } else {
        const avg = active.reduce((sum, i) => sum + i.progress, 0) / active.length;
        win.setProgressBar({ status: ProgressBarStatus.Normal, progress: Math.max(0, Math.min(100, Math.round(avg))) }).catch(() => {});
      }
    } catch {
      /* not in Tauri (plain browser) - ignore */
    }
  }, [items]);

  /** Mark a queue item queued and fire the backend download. Errors from the
   *  actual download arrive via status events; this only handles invoke errors. */
  const downloadSingle = useCallback(
    (id: string, identifier: string) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "queued" } : i)));
      downloadBooks(settings, [identifier]).catch((e) => {
        const err = String(e);
        addLog("error", "Download failed to start", err);
        addToast("error", "Download failed", err);
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "error", error: err } : i)));
      });
    },
    [settings, addLog, addToast]
  );

  const addItem = useCallback(
    async (input: string) => {
      addLog("info", `Adding item: ${input}`);
      const id = crypto.randomUUID();
      const identifier = parseBookId(input);
      const newItem: QueueItem = {
        id,
        urlOrId: input,
        status: "fetching",
        progress: 0,
      };
      setItems((prev) => [newItem, ...prev]);
      setSelectedId(id);
      try {
        const cached = metadataCache.get(identifier);
        const metadata = cached ?? (await fetchBookMetadata(identifier));
        if (!cached) metadataCache.set(identifier, metadata);
        addLog("info", cached ? `Loaded cached metadata for ${identifier}` : `Fetched metadata for ${identifier}`, JSON.stringify(metadata, null, 2));
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, metadata, status: "pending" } : item))
        );
        addToast("info", "Book added", metadata.title ?? identifier);

        if (settings.autoDownload && settings.outputDir) {
          downloadSingle(id, identifier);
          addToast("info", "Download started", metadata.title ?? identifier);
        } else if (settings.autoDownload) {
          addToast("info", "Output directory not set", "Set one in Settings to auto-download.");
        }

        // Check if already downloaded (separate try/catch so it doesn't pollute metadata errors)
        try {
          const existing = await findLibraryBook(identifier);
          if (existing) {
            addToast("info", "Already downloaded", `${metadata.title ?? identifier} was downloaded before. Redownload if needed.`);
          }
        } catch (libErr) {
          addLog("error", "Library check failed", String(libErr));
        }
      } catch (e) {
        const err = String(e);
        addLog("error", `Metadata fetch failed for ${identifier}`, err);
        addToast("error", "Failed to fetch book metadata", err);
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: "error", error: err, metadata: { identifier, title: identifier } }
              : item
          )
        );
      }
    },
    [addLog, addToast, settings.autoDownload, settings.outputDir, downloadSingle]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const clearItems = useCallback(() => {
    setItems([]);
    setSelectedId(null);
  }, []);

  const startDownload = useCallback(async () => {
    addLog("info", "Starting downloads", JSON.stringify(settings));
    const pending = itemsRef.current.filter((item) => item.status === "pending");
    if (pending.length === 0) return;
    const ids = pending.map((item) => item.id);
    const identifiers = pending.map((item) => item.metadata?.identifier ?? parseBookId(item.urlOrId));
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, status: "queued" } : item))
    );
    try {
      await downloadBooks(settings, identifiers);
      addToast("info", "Download started", `${identifiers.length} book(s) queued`);
    } catch (e) {
      const err = String(e);
      addLog("error", "Download batch failed", err);
      addToast("error", "Download failed", err);
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id) ? { ...item, status: "error", error: err } : item
        )
      );
    }
  }, [settings, addLog]);

  const startSingleDownload = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (item.status === "started" || item.status === "downloading" || item.status === "queued") return;
      const identifier = item.metadata?.identifier ?? parseBookId(item.urlOrId);
      downloadSingle(id, identifier);
    },
    [downloadSingle]
  );

  const cancelItem = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      const identifier = item.metadata?.identifier ?? parseBookId(item.urlOrId);
      cancelDownload(identifier).catch((e) => addLog("error", "Cancel failed", String(e)));
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "pending", progress: 0, error: undefined } : i))
      );
      addLog("info", `Cancelling ${identifier}`);
    },
    [addLog]
  );

  // --- System notifications on download completion ---
  const notifyComplete = useCallback(async (title: string, message: string) => {
    try {
      if (await getCurrentWindow().isFocused()) return;
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (granted) sendNotification({ title, body: message });
    } catch {
      /* not in Tauri - ignore */
    }
  }, []);

  const handleStatus = useCallback((payload: { id: string; status: string; pdf?: string; message?: string; current?: string; total?: string }) => {
    addLog("debug", `Status ${payload.status} for ${payload.id}`, JSON.stringify(payload));
    setItems((prev) => {
      return prev.map((item) => {
        if (item.metadata?.identifier !== payload.id) return item;
        if (payload.status === "started") return { ...item, status: "started", progress: 0 };
        if (payload.status === "downloading") {
          const current = payload.current ? parseInt(payload.current, 10) : 0;
          const total = payload.total ? parseInt(payload.total, 10) : 0;
          const progress = total > 0 ? Math.round((current / total) * 100) : 0;
          return { ...item, status: "downloading", progress };
        }
        if (payload.status === "assembling") {
          return { ...item, status: "downloading", progress: 100 };
        }
        if (payload.status === "done") {
          const doneItem = prev.find((i) => i.metadata?.identifier === payload.id);
          addToast("success", "Download complete", payload.pdf ?? "PDF saved");
          notifyComplete("Download complete", doneItem?.metadata?.title ?? payload.id);
          if (settingsRef.current.openOutputAfterDownload && payload.pdf) {
            const sep = Math.max(payload.pdf.lastIndexOf("\\"), payload.pdf.lastIndexOf("/"));
            const dir = sep > 0 ? payload.pdf.slice(0, sep) : payload.pdf;
            openPath(dir).catch(() => {});
          }
          if (doneItem?.metadata) {
            addLibraryBook({
              id: crypto.randomUUID(),
              identifier: payload.id,
              title: doneItem.metadata.title ?? payload.id,
              creator: doneItem.metadata.creator?.join("; ") ?? null,
              year: doneItem.metadata.date?.slice(0, 4) ?? null,
              pages: doneItem.metadata.image_count ?? null,
              pdf_path: payload.pdf ?? "",
              cover_url: `https://archive.org/download/${payload.id}/__ia_thumb.jpg`,
              downloaded_at: new Date().toISOString(),
            }).catch((e) => addLog("error", "Failed to save to library", String(e)));
          }
          return { ...item, status: "done", pdfPath: payload.pdf, progress: 100 };
        }
        if (payload.status === "error") {
          const msg = payload.message ?? "Failed";
          addLog("error", `Download failed for ${payload.id}`, msg);
          addToast("error", "Download failed", msg);
          return { ...item, status: "error", error: msg };
        }
        if (payload.status === "cancelled") {
          addLog("warn", `Download cancelled for ${payload.id}`);
          addToast("info", "Download cancelled", payload.id);
          return { ...item, status: "pending", progress: 0, error: undefined };
        }
        return item;
      });
    });
  }, [addLog, addToast, notifyComplete]);

  useEffect(() => {
    const unlisten = onDownloadStatus(handleStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleStatus]);

  // Self-update: check on launch, auto-download and install, then relaunch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const update = await check();
        if (!update || cancelled) return;
        addLog("info", `Update available: v${update.version}`);
        setUpdateInfo({ version: update.version, status: "downloading", progress: 0 });
        let transferred = 0;
        let total = 0;
        await update.downloadAndInstall((e) => {
          if (e.event === "Started") total = e.data.contentLength ?? 0;
          if (e.event === "Progress") {
            transferred += e.data.chunkLength;
            setUpdateInfo((prev) =>
              prev ? { ...prev, progress: total > 0 ? Math.round((transferred / total) * 100) : 0 } : prev
            );
          }
        });
        if (cancelled) return;
        setUpdateInfo({ version: update.version, status: "ready", progress: 100 });
        addToast("success", "Update installed", `v${update.version} — restarting…`);
        setTimeout(() => {
          relaunch().catch((e) => addLog("error", "Relaunch failed", String(e)));
        }, 1500);
      } catch (e) {
        if (!cancelled) addLog("debug", "Update check failed", String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addLog, addToast, notifyComplete]);

  // Poll Rust tracing logs every 2 seconds
  useEffect(() => {
    let lastCount = 0;
    const interval = setInterval(async () => {
      try {
        const [lines, total] = await getLogs(lastCount);
        for (const line of lines) {
          addLog("debug", line);
        }
        lastCount = total;
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [addLog]);


  useEffect(() => {
    const init = async () => {
      try {
        const store = await loadStore("settings.bin");
        storeRef.current = store;
        const saved = await store.get<AppSettings>("settings");
        if (saved) {
          addLog("info", "Loaded saved settings", JSON.stringify(saved));
          setSettings((prev) => ({ ...prev, ...saved, password: saved.password ?? "" }));
          if (saved.defaultTab) setActiveTab(saved.defaultTab);
        } else {
          addLog("info", "No saved settings found");
          // First run: prompt for setup unless the user explicitly skipped it before.
          const setup = await store.get<{ dismissed?: boolean }>("setup");
          if (!setup?.dismissed) setSetupOpen(true);
        }
      } catch (e) {
        addLog("error", "Failed to load settings", String(e));
      }
    };
    init();
  }, []);

  const saveSettings = useCallback(async (next?: AppSettings) => {
    const store = storeRef.current;
    if (!store) {
      addLog("error", "Cannot save settings: store not loaded");
      return;
    }
    const toSave = next ?? settings;
    setSaveStatus("saving");
    addLog("info", "Saving settings");
    try {
      await store.set("settings", toSave);
      await store.save();
      setSaveStatus("saved");
      addLog("info", "Settings saved");
      addToast("success", "Settings saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch (e) {
      addLog("error", "Failed to save settings", String(e));
      addToast("error", "Failed to save settings", String(e));
      setSaveStatus("idle");
    }
  }, [settings, addLog, addToast]);

  const completeSetup = useCallback(
    async (next: AppSettings) => {
      setSettings(next);
      await saveSettings(next);
      setSetupOpen(false);
    },
    [saveSettings]
  );

  const skipSetup = useCallback(async () => {
    try {
      await storeRef.current?.set("setup", { dismissed: true });
      await storeRef.current?.save();
    } catch {
      /* non-fatal */
    }
    setSetupOpen(false);
  }, []);

  const browseOutputDir = useCallback(async (): Promise<string | null> => {
    addLog("info", "Opening output directory picker");
    const dir = await openDialog({ directory: true });
    if (dir) {
      addLog("info", `Selected output directory: ${dir}`);
      setSettings((prev) => ({ ...prev, outputDir: dir }));
    }
    return dir ?? null;
  }, [addLog]);

  useShortcuts({
    addFromClipboard: () => {
      navigator.clipboard.readText().then((text) => {
        if (text) addItem(text);
      });
    },
    startDownload: () => startDownload(),
    openSettings: () => setActiveTab("settings"),
    openShortcuts: () => setShortcutsOpen(true),
    removeSelected: () => {
      if (selectedId) removeItem(selectedId);
    },
    closeModal: () => {
      setAboutOpen(false);
      setShortcutsOpen(false);
    },
  });

  const openOutput = useCallback(async () => {
    if (settings.outputDir) {
      try {
        await openPath(settings.outputDir);
      } catch (e) {
        addToast("error", "Failed to open output directory", String(e));
      }
    } else {
      addToast("info", "No output directory set", "Set one in Settings first");
    }
  }, [settings.outputDir, addToast]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("folio.ui.sidebarCollapsed");
      return raw !== null ? (JSON.parse(raw) as boolean) : false;
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("folio.ui.sidebarCollapsed", JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  // --- Theme + font size ---
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.fontSize = `${16 * settings.fontScale}px`;
  }, [settings.theme, settings.fontScale]);

  // --- Drag & drop Archive.org links onto the window ---
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      const urls = text
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && !u.startsWith("#"));
      if (urls.length === 0) return;
      addLog("info", `Dropped ${urls.length} link(s)`);
      urls.forEach((u) => addItem(u));
    },
    [addItem, addLog]
  );

  return (
    <div
      className="relative flex h-full w-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center border-4 border-dashed border-accent bg-accent-subtle/40">
          <p className="rounded-lg bg-bg-secondary px-4 py-2 text-sm font-medium text-accent">Drop to add to queue</p>
        </div>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex min-h-0 w-full flex-1">
        <aside className={cn("flex shrink-0 flex-col border-r border-border bg-bg-secondary transition-[width] duration-150", sidebarCollapsed ? "w-14" : "w-64")}>
        <div className={cn("flex items-center border-b border-border", sidebarCollapsed ? "justify-center p-2" : "justify-between p-3")}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink font-bold">F</div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-text-primary">Folio</h1>
                <p className="text-xs text-text-muted">Archive.org Downloader</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm text-accent-ink font-bold" title="Folio">F</div>
          )}
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <ChevronsLeft size={16} />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-label={sidebarCollapsed ? label : undefined}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                sidebarCollapsed ? "justify-center px-2" : "",
                activeTab === id
                  ? "bg-accent-subtle text-accent"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
            >
              <Icon size={18} />
              {!sidebarCollapsed && label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="mb-2 flex w-full items-center justify-center rounded-md p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <ChevronsRight size={16} />
            </button>
          )}
          {updateInfo && !sidebarCollapsed && (
            <div className="mb-3 rounded-lg border border-accent/30 bg-accent-subtle p-2.5">
              <p className="text-xs font-medium text-accent">
                {updateInfo.status === "ready"
                  ? "Update installed — restarting…"
                  : updateInfo.status === "error"
                    ? "Update failed"
                    : `Updating to v${updateInfo.version}…`}
              </p>
              {updateInfo.status === "downloading" && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-elevated">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${updateInfo.progress}%` }} />
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            className={cn("w-full justify-start gap-2 text-text-secondary", sidebarCollapsed ? "justify-center px-2" : "")}
            onClick={() => setAboutOpen(true)}
            title="About"
            aria-label="About"
          >
            <Info size={16} />
            {!sidebarCollapsed && "About"}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-bg-primary">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          {activeTab === "queue" && (
            <QueuePanel
              items={items}
              settings={settings}
              selectedId={selectedId}
              onAdd={addItem}
              onRemove={removeItem}
              onClear={clearItems}
              onSelect={setSelectedId}
              onDownload={startDownload}
              onDownloadItem={startSingleDownload}
              onCancelItem={cancelItem}
              onOpenOutput={openOutput}
            />
          )}
          {activeTab === "search" && (
            <SearchPanel onAdd={addItem} addToast={addToast} />
          )}
          {activeTab === "library" && (
            <LibraryPanel addToast={addToast} onGoToSearch={() => setActiveTab("search")} />
          )}
          {activeTab === "settings" && <SettingsPanel settings={settings} onChange={setSettings} onBrowse={browseOutputDir} onSave={saveSettings} saveStatus={saveStatus} />}
        </motion.div>
      </main>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        defaultTab={shortcutsOpen ? "shortcuts" : "about"}
      />
      <SetupDialog
        open={setupOpen}
        initial={settings}
        onBrowse={browseOutputDir}
        onComplete={completeSetup}
        onSkip={skipSetup}
      />
    </div>
    <DebugConsole logs={logs} onClear={clearLogs} />
  </div>
  );
}
