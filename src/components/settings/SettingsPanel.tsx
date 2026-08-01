import { useState } from "react";
import { FolderOpen, Save, User, Download, Palette } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../lib/utils";
import type { AppSettings } from "../../types";

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onBrowse: () => void;
  onSave: () => void;
  saveStatus?: "idle" | "saving" | "saved";
}

type SettingsTab = "account" | "downloads" | "appearance";

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "appearance", label: "Appearance", icon: Palette },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label className="text-sm font-medium text-text-secondary">{label}</label>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent h-4 w-4 shrink-0"
      />
    </div>
  );
}

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function SettingsPanel({ settings, onChange, onBrowse, onSave, saveStatus = "idle" }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("account");
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && <span className="text-sm text-success">Saved</span>}
          <Button onClick={() => onSave()} disabled={saveStatus === "saving"}>
            <Save size={16} />
            {saveStatus === "saving" ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="mb-5 flex gap-1 rounded-lg bg-bg-elevated p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === id ? "bg-accent text-accent-ink" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-bg-secondary p-5">
        {tab === "account" && (
          <Section title="Archive.org account">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Email</label>
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
            <p className="text-xs leading-relaxed text-text-muted">
              Stored locally on this device and only sent to Archive.org to log in.
            </p>
          </Section>
        )}

        {tab === "downloads" && (
          <>
            <Section title="Output">
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
              <ToggleRow
                label="Open output folder after download"
                checked={settings.openOutputAfterDownload}
                onChange={(v) => update("openOutputAfterDownload", v)}
              />
            </Section>

            <Section title="Downloading">
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
                <p className="text-xs text-text-muted">Current scale: {settings.resolution} (1 = smallest, 4 = full size)</p>
              </div>
              <ToggleRow
                label="Create PDF"
                hint="Assemble downloaded pages into a PDF; off keeps the JPGs"
                checked={settings.createPdf}
                onChange={(v) => update("createPdf", v)}
              />
              <ToggleRow
                label="Auto-download added books"
                hint="Starts the download immediately when a book is added, if an output directory is set"
                checked={settings.autoDownload}
                onChange={(v) => update("autoDownload", v)}
              />
              <ToggleRow
                label="Save metadata.json"
                checked={settings.saveMetadata}
                onChange={(v) => update("saveMetadata", v)}
              />
            </Section>
          </>
        )}

        {tab === "appearance" && (
          <>
            <Section title="Appearance">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-text-secondary">Theme</label>
                <select
                  value={settings.theme}
                  onChange={(e) => update("theme", e.target.value as AppSettings["theme"])}
                  className={cn(selectClass, "w-40")}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-text-secondary">Font size</label>
                <select
                  value={settings.fontScale}
                  onChange={(e) => update("fontScale", Number(e.target.value))}
                  className={cn(selectClass, "w-40")}
                >
                  <option value={0.9}>Small</option>
                  <option value={1}>Default</option>
                  <option value={1.1}>Large</option>
                  <option value={1.25}>Extra large</option>
                </select>
              </div>
              <ToggleRow
                label="Show details panel by default"
                hint="Book details and actions appear on the right when you select something"
                checked={settings.showDetailsPanel}
                onChange={(v) => update("showDetailsPanel", v)}
              />
            </Section>

            <Section title="Startup">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-secondary">Default page on launch</label>
                <select
                  value={settings.defaultTab}
                  onChange={(e) => update("defaultTab", e.target.value as AppSettings["defaultTab"])}
                  className={selectClass}
                >
                  <option value="library">Library</option>
                  <option value="queue">Queue</option>
                  <option value="search">Search</option>
                  <option value="settings">Settings</option>
                </select>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
