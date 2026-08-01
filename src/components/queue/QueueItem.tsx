import { Play, Trash2, FileText, ImageIcon, Square } from "lucide-react";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { cn } from "../../lib/utils";
import type { QueueItem as QueueItemType } from "../../types";

interface QueueItemProps {
  item: QueueItemType;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function QueueItem({ item, isSelected, onSelect, onRemove, onDownload, onCancel, onContextMenu }: QueueItemProps) {
  const meta = item.metadata;
  const isActive = item.status === "started" || item.status === "downloading" || item.status === "queued";
  const coverUrl = meta
    ? `https://archive.org/download/${meta.identifier}/__ia_thumb.jpg`
    : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        isSelected
          ? "border-accent bg-accent-subtle"
          : "border-border bg-bg-secondary hover:bg-bg-elevated hover:shadow-lg hover:shadow-black/20"
      )}
    >
      <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-bg-elevated">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={meta?.title ?? "Book cover"}
            className="h-full w-full object-contain bg-bg-elevated"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <ImageIcon size={20} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-text-primary">
            {meta?.title || item.urlOrId}
          </h3>
          <StatusBadge status={item.status} />
        </div>

        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {meta?.creator?.join("; ") || "Unknown author"}
        </p>

        <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
          {meta?.date && <span>{meta.date}</span>}
          {meta?.image_count != null && (
            <span className="flex items-center gap-1">
              <FileText size={12} />
              {meta.image_count} pages
            </span>
          )}
        </div>

        {(item.status === "downloading" || item.status === "started") && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-text-muted">
              <span>{item.status === "started" ? "Starting..." : item.progress >= 100 ? "Assembling PDF..." : "Downloading..."}</span>
              <span>{item.progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        )}

        {item.error && (
          <p className="mt-2 text-xs text-danger">{item.error}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {isActive ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            title="Cancel download"
            aria-label={`Cancel download of ${meta?.title ?? item.urlOrId}`}
          >
            <Square size={14} className="text-danger" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            title="Download now"
            aria-label={`Download ${meta?.title ?? item.urlOrId}`}
          >
            <Play size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove"
          aria-label={`Remove ${meta?.title ?? item.urlOrId}`}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
