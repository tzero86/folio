import { useState, useCallback } from "react";
import { Search, Plus, Loader2, FileText } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { searchArchive } from "../../lib/tauri";
import { createTtlCache } from "../../lib/cache";
import type { SearchResult, SearchResponse } from "../../types";
import type { ToastType } from "../ui/Toast";

interface SearchPanelProps {
  onAdd: (urlOrId: string) => Promise<void>;
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => string;
}

const ROWS = 50;
// Re-searching the same query+page within 10 minutes hits this instead of the network.
const searchCache = createTtlCache<SearchResponse>(10 * 60 * 1000);

export function SearchPanel({ onAdd, addToast }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [numFound, setNumFound] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const runSearch = useCallback(
    async (pageToLoad: number) => {
      const q = query.trim();
      if (!q) return;
      setLoading(true);
      setSearched(true);
      const cacheKey = `${q}|${pageToLoad}|${ROWS}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        setResults(cached.docs);
        setNumFound(cached.num_found);
        setPage(pageToLoad);
        setLoading(false);
        return;
      }
      try {
        const resp = await searchArchive(q, pageToLoad, ROWS);
        searchCache.set(cacheKey, resp);
        setResults(resp.docs);
        setNumFound(resp.num_found);
        setPage(pageToLoad);
      } catch (e) {
        addToast("error", "Search failed", String(e));
        setResults([]);
        setNumFound(0);
      } finally {
        setLoading(false);
      }
    },
    [query, addToast]
  );

  const handleAdd = async (result: SearchResult) => {
    if (addingId) return;
    setAddingId(result.identifier);
    try {
      await onAdd(result.identifier);
      addToast("info", "Added to queue", result.title);
    } catch {
      // onAdd shows its own error toast for metadata failures
    } finally {
      setAddingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(numFound / ROWS));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(1);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books on Archive.org…"
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </Button>
        </form>
        {searched && !loading && (
          <p className="mt-2 text-xs text-text-muted">
            {numFound.toLocaleString()} result{numFound === 1 ? "" : "s"} · page {page} of {totalPages}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!searched ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
            <div className="mb-3 rounded-full bg-bg-elevated p-4">
              <Search size={24} />
            </div>
            <p className="text-sm font-medium">Search Archive.org</p>
            <p className="mt-1 max-w-xs text-xs">
              Find books by title, author, or identifier, then add them to your download queue.
            </p>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-text-muted">
            <Loader2 size={20} className="animate-spin" />
            <span className="ml-2 text-sm">Searching…</span>
          </div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-text-muted">
            <p className="text-sm">No results found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => (
              <div
                key={result.identifier}
                className="flex gap-3 rounded-xl border border-border bg-bg-secondary p-3"
              >
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                  <img
                    src={`https://archive.org/services/img/${result.identifier}`}
                    alt={result.title}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <div className="hidden h-full w-full items-center justify-center text-text-muted">
                    <FileText size={20} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-text-primary" title={result.title}>
                    {result.title}
                  </h3>
                  {result.creator && (
                    <p className="truncate text-xs text-text-secondary">{result.creator}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
                    {result.year && <span>{result.year}</span>}
                    <span className="truncate font-mono">{result.identifier}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-7 px-2 text-xs"
                    onClick={() => handleAdd(result)}
                    disabled={addingId !== null}
                  >
                    {addingId === result.identifier ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Add to queue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {searched && !loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border bg-bg-secondary p-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => runSearch(page - 1)}>
            Previous
          </Button>
          <span className="text-xs text-text-muted">
            Page {page} / {totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => runSearch(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
