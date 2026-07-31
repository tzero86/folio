import { FolderOpen } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { AppSettings } from "../../types";

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-2xl font-semibold">Settings</h2>
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
            <Input value={settings.outputDir} readOnly className="flex-1" />
            <Button variant="secondary" onClick={() => { /* dialog handled by parent */ }} type="button">
              <FolderOpen size={16} />
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
      </div>
    </div>
  );
}
