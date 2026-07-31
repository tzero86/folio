import { Play, Trash2, FileText, ImageIcon } from "lucide-react";
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
}

export function QueueItem({ item, isSelected, onSelect, onRemove, onDownload }: QueueItemProps) {
  const meta = item.metadata;
  const coverUrl = meta
    ? `https://archive.org/download/${meta.identifier}/__ia_thumb.jpg`
    : null;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer",
        isSelected
          ? "border-accent bg-accent-subtle"
          : "border-border bg-bg-secondary hover:bg-bg-elevated"
      )}
    >
      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md bg-bg-elevated">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={meta?.title ?? "Book cover"}
            className="h-full w-full object-contain bg-bg-elevated"
            loading="lazy"
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

        <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
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
            <div className="mb-1 flex justify-between text-[10px] text-text-muted">
              <span>{item.status === "started" ? "Starting..." : "Downloading..."}</span>
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

      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download now">
          <Play size={14} />
        </Button>
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove">
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
