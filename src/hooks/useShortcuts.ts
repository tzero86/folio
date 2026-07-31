import { useEffect, useCallback } from "react";
import { isMac } from "../lib/shortcuts";

export interface ShortcutActions {
  addFromClipboard?: () => void;
  startDownload?: () => void;
  openSettings?: () => void;
  openShortcuts?: () => void;
  removeSelected?: () => void;
  closeModal?: () => void;
}

export function useShortcuts(actions: ShortcutActions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key;

      if (mod && key === "v" && actions.addFromClipboard) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        actions.addFromClipboard();
      }

      if (mod && key === "Enter" && actions.startDownload) {
        e.preventDefault();
        actions.startDownload();
      }

      if (mod && key === "," && actions.openSettings) {
        e.preventDefault();
        actions.openSettings();
      }

      if (mod && key === "/" && actions.openShortcuts) {
        e.preventDefault();
        actions.openShortcuts();
      }

      if (key === "Delete" && actions.removeSelected) {
        actions.removeSelected();
      }

      if (key === "Escape" && actions.closeModal) {
        actions.closeModal();
      }
    },
    [actions]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
