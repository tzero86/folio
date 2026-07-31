import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X, ImageOff, ChevronsRight, ChevronsLeft } from "lucide-react";

export interface BookDetailField {
  label: string;
  value: string | number | null | undefined;
}

interface BookDetailsProps {
  coverUrl?: string | null;
  title: string;
  fields: BookDetailField[];
  description?: string | null;
  actions?: ReactNode;
  onClose?: () => void;
}

const STORAGE_WIDTH = "folio.ui.detailsWidth";
const STORAGE_COLLAPSED = "folio.ui.detailsCollapsed";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 260;
const MAX_WIDTH = 480;

function useUiPrefs<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const update = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable - keep in-memory state */
      }
    },
    [key]
  );
  return [value, update];
}

/**
 * Right-hand details panel: large cover, readable typography, metadata fields
 * and action buttons. Collapsible and width-resizable via the left-edge grip.
 */
export function BookDetails({ coverUrl, title, fields, description, actions, onClose }: BookDetailsProps) {
  const [width, setWidth] = useUiPrefs(STORAGE_WIDTH, DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useUiPrefs(STORAGE_COLLAPSED, false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const visibleFields = fields.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");

  useEffect(() => {
    if (!dragState.current) return;
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.startWidth - (e.clientX - s.startX)));
      setWidth(next);
    };
    const onUp = () => {
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [setWidth]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Expand details panel"
        title="Expand details panel"
        className="flex w-9 shrink-0 flex-col items-center justify-start border-l border-border bg-bg-secondary pt-3 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
      >
        <ChevronsLeft size={16} />
      </button>
    );
  }

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-border bg-bg-secondary" style={{ width }}>
      {/* resize grip */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details panel"
        onMouseDown={(e) => {
          dragState.current = { startX: e.clientX, startWidth: width };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-accent/60"
      />

      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3 pl-4">
        <h2 className="text-sm font-semibold text-text-primary">Details</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse details panel"
            title="Collapse"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <ChevronsRight size={16} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close details"
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className="h-60 w-40 rounded-lg border border-border bg-bg-elevated object-contain"
            />
          ) : (
            <div className="flex h-60 w-40 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted">
              <ImageOff size={32} />
            </div>
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-snug text-text-primary">{title}</h3>

        {visibleFields.length > 0 && (
          <dl className="mt-4 space-y-3">
            {visibleFields.map((f) => (
              <div key={f.label}>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{f.label}</dt>
                <dd className="mt-0.5 break-words text-sm leading-snug text-text-primary">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {description && (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Description</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
          </div>
        )}

        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </aside>
  );
}
