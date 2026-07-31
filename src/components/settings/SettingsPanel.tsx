import { FolderOpen, Save } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { AppSettings } from "../../types";

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onBrowse: () => void;
  onSave: () => void;
  saveStatus?: "idle" | "saving" | "saved";
}

export function SettingsPanel({ settings, onChange, onBrowse, onSave, saveStatus = "idle" }: SettingsPanelProps) {
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-sm text-success">Saved</span>
          )}
          <Button onClick={onSave} disabled={saveStatus === "saving"}>
            <Save size={16} />
            {saveStatus === "saving" ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-border bg-bg-secondary p-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Archive.org email</label>
          <Input
            type="email"
            value={settings.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Password</label>
          <Input
            type="password"
            value={settings.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Output directory</label>
          <div className="flex gap-2">
            <Input value={settings.outputDir} readOnly className="flex-1" placeholder="Select a folder..." />
            <Button variant="secondary" onClick={onBrowse} type="button">
              <FolderOpen size={16} />
              Browse
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Image resolution</label>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={settings.resolution}
            onChange={(e) => update("resolution", Number(e.target.value))}
            className="w-full accent-accent"
          />
          <p className="text-xs text-text-muted">Current scale: {settings.resolution}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-secondary">Default page on launch</label>
          <select
            value={settings.defaultTab}
            onChange={(e) => update("defaultTab", e.target.value as AppSettings["defaultTab"])}
            className="flex h-10 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="library">Library</option>
            <option value="queue">Queue</option>
            <option value="search">Search</option>
            <option value="settings">Settings</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">Create PDF</label>
          <input
            type="checkbox"
            checked={settings.createPdf}
            onChange={(e) => update("createPdf", e.target.checked)}
            className="accent-accent h-4 w-4"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-text-secondary">Auto-download added books</label>
            <p className="text-xs text-text-muted">Starts the download immediately when a book is added, if an output directory is set.</p>
          </div>
          <input
            type="checkbox"
            checked={settings.autoDownload}
            onChange={(e) => update("autoDownload", e.target.checked)}
            className="accent-accent h-4 w-4"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">Save metadata.json</label>
          <input
            type="checkbox"
            checked={settings.saveMetadata}
            onChange={(e) => update("saveMetadata", e.target.checked)}
            className="accent-accent h-4 w-4"
          />
        </div>
      </div>
    </div>
  );
}
