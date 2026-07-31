import { useState, useEffect } from "react";
import { BookOpen, FileText, Trash2, FolderOpen } from "lucide-react";
import { Button } from "../ui/Button";
import { listLibraryBooks, deleteLibraryBook } from "../../lib/tauri";
import { open } from "@tauri-apps/plugin-shell";
import type { LibraryBook } from "../../lib/tauri";

export function LibraryPanel() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { load(); }, []);

  const handleDelete = async (identifier: string) => {
    await deleteLibraryBook(identifier);
    setBooks((prev) => prev.filter((b) => b.identifier !== identifier));
  };

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
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-4 text-lg font-semibold">Library ({books.length})</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <div key={book.id} className="flex gap-3 rounded-xl border border-border bg-bg-secondary p-3">
            <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-bg-elevated">
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-muted">
                  <FileText size={20} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-text-primary">{book.title}</h3>
              {book.creator && <p className="truncate text-xs text-text-secondary">{book.creator}</p>}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                {book.year && <span>{book.year}</span>}
                {book.pages && <span>{book.pages} pages</span>}
              </div>
              <div className="mt-2 flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => open(book.pdf_path)} title="Open PDF">
                  <FileText size={12} />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                  const path = book.pdf_path.substring(0, book.pdf_path.lastIndexOf("\\"));
                  if (path) open(path);
                }} title="Open file location">
                  <FolderOpen size={12} />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleDelete(book.identifier)} title="Remove from library">
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
