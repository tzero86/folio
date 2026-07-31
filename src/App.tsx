import { useState, useCallback, useEffect, useRef } from "react";
import { Library, List, Settings, Info } from "lucide-react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "./components/ui/Button";
import { QueuePanel } from "./components/queue/QueuePanel";
import { LibraryPanel } from "./components/library/LibraryPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { AboutDialog } from "./components/about/AboutDialog";
import { useShortcuts } from "./hooks/useShortcuts";
import { fetchBookMetadata, onDownloadStatus, downloadBooks } from "./lib/tauri";
import { cn } from "./lib/utils";

import type { QueueItem, AppSettings } from "./types";
import "./index.css";

type Tab = "queue" | "library" | "settings";

const NAV: { id: Tab; label: string; icon: typeof List }[] = [
  { id: "queue", label: "Queue", icon: List },
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
  const [settings, setSettings] = useState<AppSettings>({
    email: "",
    password: "",
    outputDir: "",
    resolution: 2,
    createPdf: true,
    saveCredentials: false,
  });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const addItem = useCallback(async (input: string) => {
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
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, metadata, status: "pending" } : item))
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: "error", error: String(e), metadata: { identifier, title: identifier } }
            : item
        )
      );
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const clearItems = useCallback(() => {
    setItems([]);
    setSelectedId(null);
  }, []);

  const startDownload = useCallback(async () => {
    const pending = itemsRef.current.filter((item) => item.status !== "done" && item.status !== "error");
    if (pending.length === 0) return;
    const ids = pending.map((item) => item.id);
    const identifiers = pending.map((item) => item.metadata?.identifier ?? parseBookId(item.urlOrId));
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, status: "queued" } : item))
    );
    try {
      await downloadBooks(settings, identifiers);
    } catch (e) {
      setItems((prev) =>
        prev.map((item) =>
          ids.includes(item.id) ? { ...item, status: "error", error: String(e) } : item
        )
      );
    }
  }, [settings]);

  const startSingleDownload = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
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

  const handleStatus = useCallback((payload: { id: string; status: string; pdf?: string; message?: string }) => {
    setItems((prev) => {
      const match = prev.find((item) => item.metadata?.identifier === payload.id);
      if (!match) return prev;
      return prev.map((item) => {
        if (item.metadata?.identifier !== payload.id) return item;
        if (payload.status === "started") return { ...item, status: "started", progress: 0 };
        if (payload.status === "done") return { ...item, status: "done", pdfPath: payload.pdf, progress: 100 };
        if (payload.status === "error") return { ...item, status: "error", error: payload.message ?? "Failed" };
        return item;
      });
    });
  }, []);

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

  const openOutput = useCallback(() => {
    if (settings.outputDir) open(settings.outputDir);
  }, [settings.outputDir]);

  return (
    <div className="flex h-full w-full">
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
                onClick={() => open(updateUrl)}
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
          {activeTab === "library" && <LibraryPanel />}
          {activeTab === "settings" && <SettingsPanel settings={settings} onChange={setSettings} />}
        </motion.div>
      </main>

      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        defaultTab={shortcutsOpen ? "shortcuts" : "about"}
      />
    </div>
  );
}
