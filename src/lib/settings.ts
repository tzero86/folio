import type { AppSettings, Tab } from "../types";

const VALID_TABS: Tab[] = ["queue", "search", "library", "settings"];

/**
 * Coerce an unknown value into a complete, valid AppSettings object.
 * Ignores unexpected keys and non-primitive values (e.g. DOM nodes that leak
 * in through event handlers), and fills missing fields with defaults.
 */
export function sanitizeSettings(raw: unknown): AppSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  return {
    email: typeof s.email === "string" ? s.email : "",
    password: typeof s.password === "string" ? s.password : "",
    outputDir: typeof s.outputDir === "string" ? s.outputDir : "",
    resolution: num(s.resolution, 1, 4, 2),
    createPdf: s.createPdf !== false,
    saveCredentials: s.saveCredentials === true,
    saveMetadata: s.saveMetadata === true,
    autoDownload: s.autoDownload !== false,
    defaultTab:
      typeof s.defaultTab === "string" && (VALID_TABS as string[]).includes(s.defaultTab)
        ? (s.defaultTab as Tab)
        : "library",
    theme: s.theme === "light" ? "light" : "dark",
    fontScale: num(s.fontScale, 0.8, 1.5, 1),
    openOutputAfterDownload: s.openOutputAfterDownload === true,
    showDetailsPanel: s.showDetailsPanel !== false,
  };
}
