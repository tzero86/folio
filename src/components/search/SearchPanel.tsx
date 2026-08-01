import { useState, useCallback } from "react";
import { Search, Plus, Loader2, FileText } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { BookDetails } from "../ui/BookDetails";
import { searchArchive, fetchBookMetadata, type SearchFilters } from "../../lib/tauri";
import { searchCache, metadataCache } from "../../lib/cache";
import { cn } from "../../lib/utils";
import type { SearchResult, BookMetadata } from "../../types";
import type { ToastType } from "../ui/Toast";

interface SearchPanelProps {
  onAdd: (urlOrId: string) => Promise<void>;
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => string;
}

const ROWS = 50;
const STORAGE_KEY = "folio.ui.lastSearch";

interface SavedSearch {
  query: string;
  author?: string;
  yearFrom?: string;
  yearTo?: string;
  sort?: SearchFilters["sort"];
}

function loadSavedSearch(): SavedSearch {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch) : { query: "" };
  } catch {
    return { query: "" };
  }
}

export function SearchPanel({ onAdd, addToast }: SearchPanelProps) {
  const [query, setQuery] = useState(() => loadSavedSearch().query);
  const [author, setAuthor] = useState(() => loadSavedSearch().author ?? "");
  const [yearFrom, setYearFrom] = useState(() => loadSavedSearch().yearFrom ?? "");
  const [yearTo, setYearTo] = useState(() => loadSavedSearch().yearTo ?? "");
  const [sort, setSort] = useState<SearchFilters["sort"]>(() => loadSavedSearch().sort ?? "relevance");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [numFound, setNumFound] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [detailsMeta, setDetailsMeta] = useState<BookMetadata | null>(null);

  const runSearch = useCallback(
    async (pageToLoad: number) => {
      const q = query.trim();
      if (!q) return;
      const filters: SearchFilters = {
        author: author.trim() || undefined,
        yearFrom: yearFrom ? Number(yearFrom) : undefined,
        yearTo: yearTo ? Number(yearTo) : undefined,
        sort,
      };
      // remember the last search + filters across sessions
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ query: q, author: author.trim(), yearFrom, yearTo, sort } satisfies SavedSearch)
        );
      } catch {
        /* storage unavailable */
      }
      setLoading(true);
      setSearched(true);
      const cacheKey = `${q}|${pageToLoad}|${ROWS}|${author}|${yearFrom}|${yearTo}|${sort}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        setResults(cached.docs);
        setNumFound(cached.num_found);
        setPage(pageToLoad);
        setLoading(false);
        return;
      }
      try {
        const resp = await searchArchive(q, pageToLoad, filters, ROWS);
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
    [query, author, yearFrom, yearTo, sort, addToast]
  );

  const hasActiveFilters = Boolean(author.trim() || yearFrom || yearTo || sort !== "relevance");

  const selectResult = useCallback((result: SearchResult) => {
    setSelected(result);
    setDetailsMeta(null);
    const cached = metadataCache.get(result.identifier);
    if (cached) {
      setDetailsMeta(cached);
      return;
    }
    fetchBookMetadata(result.identifier)
      .then((meta) => {
        metadataCache.set(result.identifier, meta);
        setDetailsMeta(meta);
      })
      .catch(() => {
        /* details panel just omits extra metadata */
      });
  }, []);

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

  const selectedMetaFields = selected
    ? [
        { label: "Creator", value: selected.creator },
        { label: "Year", value: selected.year },
        { label: "Identifier", value: selected.identifier },
        { label: "Pages", value: detailsMeta?.image_count },
        { label: "Language", value: detailsMeta?.language },
        { label: "Publisher", value: detailsMeta?.publisher },
      ]
    : [];

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
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
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author…"
              className="h-8 w-40 text-xs"
              aria-label="Filter by author"
            />
            <Input
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Year from"
              className="h-8 w-24 text-xs"
              aria-label="Year from"
              inputMode="numeric"
            />
            <Input
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Year to"
              className="h-8 w-24 text-xs"
              aria-label="Year to"
              inputMode="numeric"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SearchFilters["sort"])}
              aria-label="Sort results"
              className="h-8 rounded-lg border border-border bg-bg-secondary px-2 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="relevance">Relevance</option>
              <option value="downloads">Most downloaded</option>
              <option value="title">Title A–Z</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setAuthor("");
                  setYearFrom("");
                  setYearTo("");
                  setSort("relevance");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((result) => (
                <div
                  key={result.identifier}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected?.identifier === result.identifier}
                  onClick={() => selectResult(result)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectResult(result);
                    }
                  }}
                  className={cn(
                    "flex gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selected?.identifier === result.identifier
                      ? "border-accent bg-accent-subtle"
                      : "border-border bg-bg-secondary hover:bg-bg-elevated hover:shadow-lg hover:shadow-black/20"
                  )}
                >
                  <div className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                    <img
                      src={`https://archive.org/services/img/${result.identifier}`}
                      alt={result.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    {!result.identifier && <FileText size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-text-primary" title={result.title}>
                      {result.title}
                    </h3>
                    {result.creator && (
                      <p className="mt-0.5 truncate text-xs text-text-secondary">{result.creator}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                      {result.year && <span>{result.year}</span>}
                      <span className="truncate font-mono">{result.identifier}</span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdd(result);
                      }}
                      disabled={addingId !== null}
                    >
                      {addingId === result.identifier ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} />
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

      {selected && (
        <BookDetails
          coverUrl={`https://archive.org/services/img/${selected.identifier}`}
          title={selected.title}
          fields={selectedMetaFields}
          description={selected.description}
          onClose={() => setSelected(null)}
          actions={
            <Button
              size="sm"
              onClick={() => handleAdd(selected)}
              disabled={addingId !== null}
            >
              {addingId === selected.identifier ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add to queue
            </Button>
          }
        />
      )}
    </div>
  );
}
