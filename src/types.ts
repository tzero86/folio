export type DownloadStatus = "pending" | "fetching" | "queued" | "started" | "downloading" | "done" | "error";

export interface BookMetadata {
  identifier: string;
  title?: string | null;
  creator?: string[] | null;
  date?: string | null;
  publisher?: string | null;
  language?: string | null;
  image_count?: number | null;
}

export interface QueueItem {
  id: string;
  urlOrId: string;
  status: DownloadStatus;
  progress: number;
  metadata?: BookMetadata;
  pdfPath?: string;
  error?: string;
}

export interface AppSettings {
  email: string;
  password: string;
  outputDir: string;
  resolution: number;
  createPdf: boolean;
  saveCredentials: boolean;
  saveMetadata: boolean;
}

export interface SearchResult {
  identifier: string;
  title: string;
  creator: string | null;
  year: string | null;
  description: string | null;
}

export interface SearchResponse {
  num_found: number;
  start: number;
  docs: SearchResult[];
}
