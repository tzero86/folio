import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BookMetadata, AppSettings } from "../types";

export async function fetchBookMetadata(identifier: string): Promise<BookMetadata> {
  return invoke("fetch_book_metadata", { identifier });
}

export interface DownloadStatusPayload {
  id: string;
  status: string;
  pdf?: string;
  message?: string;
}

export async function downloadBooks(settings: AppSettings, identifiers: string[]): Promise<void> {
  return invoke("download_books", { request: { ...settings, identifiers } });
}

export function onDownloadStatus(callback: (payload: DownloadStatusPayload) => void) {
  return listen<DownloadStatusPayload>("download-status", (event) => callback(event.payload));
}
