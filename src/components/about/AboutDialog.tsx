import { useState, useEffect } from "react";
import { X, ExternalLink, Github, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/Button";
import { formatShortcut, SHORTCUTS } from "../../lib/shortcuts";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: "about" | "shortcuts";
}

const VERSION = "0.1.0";

export function AboutDialog({ open, onClose, defaultTab = "about" }: AboutDialogProps) {
  const [tab, setTab] = useState(defaultTab);
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg-secondary shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex gap-1 rounded-lg bg-bg-elevated p-1">
                <button
                  onClick={() => setTab("about")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === "about" ? "bg-accent text-accent-ink" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  About
                </button>
                <button
                  onClick={() => setTab("shortcuts")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === "shortcuts" ? "bg-accent text-accent-ink" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Shortcuts
                </button>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={16} />
              </Button>
            </div>

            <div className="p-5">
              {tab === "about" ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-white">F</div>
                  <div>
                    <h2 className="text-lg font-semibold">Folio {VERSION}</h2>
                    <p className="text-sm text-text-secondary">A fast, beautiful Archive.org downloader.</p>
                  </div>

                  <div className="rounded-lg border border-border bg-bg-elevated p-4 text-left text-sm">
                    <p className="text-text-secondary">
                      Folio is an unofficial desktop app. It is not affiliated with or endorsed by Archive.org.
                      Please respect copyright and loan terms.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-bg-elevated p-4 text-left text-sm">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">Credits</p>
                    <p className="text-text-secondary">
                      Designed and built by <span className="font-semibold text-text-primary">tzero86</span> — the
                      Rust/Tauri rewrite of the original Python downloader, with a reader, search, library and
                      self-updates.
                    </p>
                  </div>

                  <div className="flex justify-center gap-2">
                    <Button variant="secondary" className="gap-2">
                      <Github size={16} />
                      GitHub
                    </Button>
                    <Button variant="secondary" className="gap-2">
                      <ExternalLink size={16} />
                      Website
                    </Button>
                  </div>

                  <p className="flex items-center justify-center gap-1 text-xs text-text-muted">
                    Made with <Heart size={12} className="text-danger" /> for readers
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(SHORTCUTS).map(([action, parts]) => (
                    <div key={action} className="flex items-center justify-between rounded-lg bg-bg-elevated px-3 py-2">
                      <span className="text-sm capitalize text-text-secondary">{action.replace(/([A-Z])/g, " $1")}</span>
                      <span className="kbd">{formatShortcut(parts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
