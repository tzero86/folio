import { useState, useEffect } from "react";
import { BookOpen, FileText, Trash2, FolderOpen, Eye } from "lucide-react";
import { Button } from "../ui/Button";
import { BookDetails } from "../ui/BookDetails";
import { PdfViewerDialog } from "../ui/PdfViewerDialog";
import { listLibraryBooks, deleteLibraryBook } from "../../lib/tauri";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { cn } from "../../lib/utils";
import type { LibraryBook } from "../../lib/tauri";
import type { ToastType } from "../ui/Toast";

interface LibraryPanelProps {
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => string;
}

export function LibraryPanel({ addToast }: LibraryPanelProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LibraryBook | null>(null);
  const [viewerPath, setViewerPath] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listLibraryBooks();
      setBooks(result);
    } catch {
      setBooks([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const isPdf = (path: string): boolean => path.toLowerCase().endsWith(".pdf");

  const handleOpen = async (book: LibraryBook) => {
    try {
      await openPath(book.pdf_path);
    } catch (e) {
      addToast("error", "Failed to open", String(e));
    }
  };

  const handleOpenLocation = async (book: LibraryBook) => {
    try {
      if (isPdf(book.pdf_path)) {
        await revealItemInDir(book.pdf_path);
      } else {
        await openPath(book.pdf_path);
      }
    } catch (e) {
      addToast("error", "Failed to open location", String(e));
    }
  };

  const handleDelete = async (book: LibraryBook) => {
    try {
      await deleteLibraryBook(book.identifier);
      setBooks((prev) => prev.filter((b) => b.identifier !== book.identifier));
      if (selected?.identifier === book.identifier) setSelected(null);
      addToast("info", "Removed from library", book.title);
    } catch (e) {
      addToast("error", "Failed to remove", String(e));
    }
  };

  const detailsActions = selected ? (
    <>
      {isPdf(selected.pdf_path) && (
        <Button size="sm" onClick={() => setViewerPath(selected.pdf_path)}>
          <Eye size={14} />
          View
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => handleOpen(selected)}>
        <FileText size={14} />
        Open PDF
      </Button>
      <Button variant="secondary" size="sm" onClick={() => handleOpenLocation(selected)}>
        <FolderOpen size={14} />
        Location
      </Button>
      <Button variant="ghost" size="sm" onClick={() => handleDelete(selected)}>
        <Trash2 size={14} />
        Remove
      </Button>
    </>
  ) : null;

  const detailsFields = selected
    ? [
        { label: "Creator", value: selected.creator },
        { label: "Year", value: selected.year },
        { label: "Pages", value: selected.pages },
        { label: "Downloaded", value: new Date(selected.downloaded_at).toLocaleString() },
        { label: "File", value: selected.pdf_path },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted text-sm">Loading...</div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
        <div className="mb-3 rounded-full bg-bg-elevated p-4">
          <BookOpen size={24} />
        </div>
        <p className="text-sm font-medium">Your library is empty</p>
        <p className="mt-1 max-w-xs text-xs">Downloaded books will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
          Library ({books.length})
        </h2>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                onClick={() => setSelected(book)}
                aria-pressed={selected?.identifier === book.identifier}
                className={cn(
                  "flex gap-3 rounded-xl border p-3 text-left transition-colors",
                  selected?.identifier === book.identifier
                    ? "border-accent bg-accent-subtle"
                    : "border-border bg-bg-secondary hover:bg-bg-elevated hover:shadow-lg hover:shadow-black/20"
                )}
              >
                <div className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-text-muted">
                      <FileText size={20} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-text-primary">{book.title}</h3>
                  {book.creator && <p className="mt-0.5 truncate text-xs text-text-secondary">{book.creator}</p>}
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    {book.year && <span>{book.year}</span>}
                    {book.pages && <span>{book.pages} pages</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <BookDetails
          coverUrl={selected.cover_url}
          title={selected.title}
          fields={detailsFields}
          onClose={() => setSelected(null)}
          actions={detailsActions}
        />
      )}

      {viewerPath && (
        <PdfViewerDialog
          open
          path={viewerPath}
          title={selected?.title ?? "PDF"}
          onClose={() => setViewerPath(null)}
        />
      )}
    </div>
  );
}
