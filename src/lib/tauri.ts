import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BookMetadata, AppSettings, SearchResponse } from "../types";

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
  return invoke("download_books", {
    request: {
      email: settings.email,
      password: settings.password,
      identifiers,
      output_dir: settings.outputDir,
      resolution: settings.resolution,
      create_pdf: settings.createPdf,
      save_credentials: settings.saveCredentials,
      save_metadata: settings.saveMetadata,
    },
  });
}

export function onDownloadStatus(callback: (payload: DownloadStatusPayload) => void) {
  return listen<DownloadStatusPayload>("download-status", (event) => callback(event.payload));
}


export interface LibraryBook {
  id: string;
  identifier: string;
  title: string;
  creator: string | null;
  year: string | null;
  pages: number | null;
  pdf_path: string;
  cover_url: string | null;
  downloaded_at: string;
}

export async function addLibraryBook(book: LibraryBook): Promise<void> {
  return invoke("add_library_book", { book });
}

export async function listLibraryBooks(): Promise<LibraryBook[]> {
  return invoke("list_library_books");
}

export async function findLibraryBook(identifier: string): Promise<LibraryBook | null> {
  return invoke("find_library_book", { identifier });
}

export async function deleteLibraryBook(identifier: string): Promise<void> {
  return invoke("delete_library_book", { identifier });
}

export async function getLogs(lastCount: number): Promise<[string[], number]> {
  return invoke("get_logs", { lastCount });
}

export async function searchArchive(query: string, page: number, rows = 50): Promise<SearchResponse> {
  return invoke("search_archive", { req: { query, page, rows } });
}
