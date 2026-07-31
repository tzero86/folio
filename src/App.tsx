import { useState, useCallback, useEffect, useRef } from "react";
import { Library, List, Settings, Info, Search } from "lucide-react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { load as loadStore, Store } from "@tauri-apps/plugin-store";
import { Button } from "./components/ui/Button";
import { QueuePanel } from "./components/queue/QueuePanel";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { SearchPanel } from "./components/search/SearchPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { AboutDialog } from "./components/about/AboutDialog";
import { useShortcuts } from "./hooks/useShortcuts";
import { DebugConsole, useDebugConsole } from "./components/debug/DebugConsole";
import { ToastContainer, useToast } from "./components/ui/Toast";
import { fetchBookMetadata, onDownloadStatus, downloadBooks, findLibraryBook, addLibraryBook, getLogs } from "./lib/tauri";
import { cn } from "./lib/utils";

import type { QueueItem, AppSettings } from "./types";
import "./index.css";

type Tab = "queue" | "search" | "library" | "settings";

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
  const [activeTab, setActiveTab] = useState<Tab>("queue");
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
  });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addItem = useCallback(async (input: string) => {
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
      const metadata = await fetchBookMetadata(identifier);
      addLog("info", `Fetched metadata for ${identifier}`, JSON.stringify(metadata, null, 2));
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, metadata, status: "pending" } : item))
      );
      addToast("info", "Book added", metadata.title ?? identifier);
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
  }, [addLog]);

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
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (item.status === "started" || item.status === "downloading" || item.status === "queued") return;
      const identifier = item.metadata?.identifier ?? parseBookId(item.urlOrId);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "queued" } : i)));
      try {
        await downloadBooks(settings, [identifier]);
      } catch (e) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "error", error: String(e) } : i))
        );
      }
    },
    [settings]
  );

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
          addToast("success", "Download complete", payload.pdf ?? "PDF saved");
          const doneItem = prev.find((i) => i.metadata?.identifier === payload.id);
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
        return item;
      });
    });
  }, [addLog, addToast]);

  useEffect(() => {
    const unlisten = onDownloadStatus(handleStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleStatus]);

  useEffect(() => {
    invoke<string | null>("check_update").then((url) => {
      if (url) setUpdateUrl(url);
    }).catch(() => null);
  }, []);

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
        } else {
          addLog("info", "No saved settings found");
        }
      } catch (e) {
        addLog("error", "Failed to load settings", String(e));
      }
    };
    init();
  }, []);

  const saveSettings = useCallback(async () => {
    const store = storeRef.current;
    if (!store) {
      addLog("error", "Cannot save settings: store not loaded");
      return;
    }
    setSaveStatus("saving");
    addLog("info", "Saving settings");
    try {
      await store.set("settings", settings);
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
  }, [settings, addLog]);

  const browseOutputDir = useCallback(async () => {
    addLog("info", "Opening output directory picker");
    const dir = await openDialog({ directory: true });
    if (dir) {
      addLog("info", `Selected output directory: ${dir}`);
      setSettings((prev) => ({ ...prev, outputDir: dir }));
    }
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

  return (
    <div className="relative flex h-full w-full flex-col">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex min-h-0 w-full flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-secondary">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white font-bold">F</div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-text-primary">Folio</h1>
            <p className="text-xs text-text-muted">Archive.org Downloader</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeTab === id
                  ? "bg-accent-subtle text-accent"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {updateUrl && (
            <div className="mb-3 rounded-lg border border-accent/30 bg-accent-subtle p-2.5">
              <p className="text-xs font-medium text-accent">Update available</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-auto px-0 py-0 text-xs text-accent hover:bg-transparent"
                onClick={async () => { try { await openUrl(updateUrl); } catch (e) { addToast("error", "Failed to open update URL", String(e)); } }}
              >
                Download now
              </Button>
            </div>
          )}
          <Button variant="ghost" className="w-full justify-start gap-2 text-text-secondary" onClick={() => setAboutOpen(true)}>
            <Info size={16} />
            About
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
              onOpenOutput={openOutput}
            />
          )}
          {activeTab === "search" && (
            <SearchPanel onAdd={addItem} addToast={addToast} />
          )}
          {activeTab === "library" && <LibraryPanel addToast={addToast} />}
          {activeTab === "settings" && <SettingsPanel settings={settings} onChange={setSettings} onBrowse={browseOutputDir} onSave={saveSettings} saveStatus={saveStatus} />}
        </motion.div>
      </main>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        defaultTab={shortcutsOpen ? "shortcuts" : "about"}
      />
    </div>
    <DebugConsole logs={logs} onClear={clearLogs} />
  </div>
  );
}
