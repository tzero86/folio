export const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
export const mod = isMac ? "⌘" : "Ctrl";

export const SHORTCUTS = {
  addFromClipboard: [mod, "V"],
  startDownload: [mod, "Enter"],
  openSettings: [mod, ","],
  openShortcuts: [mod, "/"],
  removeSelected: ["Delete"],
  closeModal: ["Escape"],
};

export function formatShortcut(parts: string[]): string {
  return parts.join(isMac ? " " : "+");
}
