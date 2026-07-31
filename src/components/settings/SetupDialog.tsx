import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderOpen, BookMarked } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { AppSettings } from "../../types";

interface SetupDialogProps {
  open: boolean;
  initial: AppSettings;
  onBrowse: () => Promise<string | null>;
  onComplete: (settings: AppSettings) => Promise<void>;
  onSkip: () => void;
}

/**
 * First-run setup: collect Archive.org credentials and an output directory
 * before the user starts downloading.
 */
export function SetupDialog({ open, initial, onBrowse, onComplete, onSkip }: SetupDialogProps) {
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState(initial.password);
  const [outputDir, setOutputDir] = useState(initial.outputDir);
  const [saving, setSaving] = useState(false);

  const handleBrowse = async () => {
    const dir = await onBrowse();
    if (dir) setOutputDir(dir);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outputDir.trim()) return;
    setSaving(true);
    try {
      await onComplete({ ...initial, email: email.trim(), password, outputDir: outputDir.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Folio"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-ink">
                <BookMarked size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Welcome to Folio</h2>
                <p className="text-sm text-text-muted">One-time setup before your first download</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Archive.org email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Output directory</label>
                <div className="flex gap-2">
                  <Input value={outputDir} readOnly className="flex-1" placeholder="Select a folder..." />
                  <Button variant="secondary" type="button" onClick={handleBrowse}>
                    <FolderOpen size={16} />
                    Browse
                  </Button>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-text-muted">
                Your credentials are stored locally on this device and only sent to Archive.org to log in.
                You can change everything later in Settings.
              </p>

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" type="button" onClick={onSkip}>
                  Skip for now
                </Button>
                <Button type="submit" disabled={!outputDir.trim() || saving}>
                  {saving ? "Saving…" : "Get started"}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
