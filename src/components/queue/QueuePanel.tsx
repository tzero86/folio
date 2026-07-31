import { useState, useRef, useCallback } from "react";
import { Plus, Download, FolderOpen, Trash2, Play } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { QueueItem } from "./QueueItem";
import { BookDetails } from "../ui/BookDetails";
import { formatShortcut, SHORTCUTS } from "../../lib/shortcuts";
import type { QueueItem as QueueItemType, AppSettings } from "../../types";

interface QueuePanelProps {
  items: QueueItemType[];
  settings: AppSettings;
  selectedId: string | null;
  onAdd: (urlOrId: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSelect: (id: string) => void;
  onDownload: () => void;
  onDownloadItem: (id: string) => void;
  onOpenOutput: () => void;
}

export function QueuePanel({
  items,
  selectedId,
  onAdd,
  onRemove,
  onClear,
  onSelect,
  onDownload,
  onDownloadItem,
  onOpenOutput,
}: QueuePanelProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    onAdd(value);
    setInput("");
  }, [input, onAdd]);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const detailsActions = selectedItem ? (
    <>
      <Button
        size="sm"
        onClick={() => onDownloadItem(selectedItem.id)}
        disabled={
          selectedItem.status === "started" ||
          selectedItem.status === "downloading" ||
          selectedItem.status === "queued"
        }
      >
        <Play size={14} />
        Download now
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onRemove(selectedItem.id)}>
        <Trash2 size={14} />
        Remove
      </Button>
    </>
  ) : null;

  const detailsFields = selectedItem
    ? [
        { label: "Status", value: selectedItem.status },
        ...(selectedItem.metadata?.creator
          ? [{ label: "Creator", value: selectedItem.metadata.creator.join("; ") }]
          : []),
        ...(selectedItem.metadata?.date
          ? [{ label: "Date", value: selectedItem.metadata.date }]
          : []),
        ...(selectedItem.metadata?.image_count != null
          ? [{ label: "Pages", value: selectedItem.metadata.image_count }]
          : []),
        ...(selectedItem.metadata?.language
          ? [{ label: "Language", value: selectedItem.metadata.language }]
          : []),
        ...(selectedItem.metadata?.publisher
          ? [{ label: "Publisher", value: selectedItem.metadata.publisher }]
          : []),
        ...(selectedItem.error ? [{ label: "Error", value: selectedItem.error }] : []),
        ...(selectedItem.pdfPath ? [{ label: "Output", value: selectedItem.pdfPath }] : []),
      ]
    : [];

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef as unknown as React.Ref<HTMLInputElement>}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Archive.org URL or book ID..."
              className="flex-1"
            />
            <Button type="submit" className="shrink-0">
              <Plus size={16} />
              Add
            </Button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
              <div className="mb-3 rounded-full bg-bg-elevated p-4">
                <Plus size={24} />
              </div>
              <p className="text-sm font-medium">Your queue is empty</p>
              <p className="mt-1 text-xs">Paste a link with {formatShortcut(SHORTCUTS.addFromClipboard)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedId}
                  onSelect={() => onSelect(item.id)}
                  onRemove={() => onRemove(item.id)}
                  onDownload={() => onDownloadItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-bg-secondary p-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClear} disabled={items.length === 0}>
              <Trash2 size={14} />
              Clear
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenOutput}>
              <FolderOpen size={14} />
              Output
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{items.length} item{items.length !== 1 ? "s" : ""}</span>
            <Button onClick={onDownload} disabled={items.length === 0}>
              <Download size={16} />
              Download
              <span className="kbd">{formatShortcut(SHORTCUTS.startDownload)}</span>
            </Button>
          </div>
        </div>
      </div>

      {selectedItem && (
        <BookDetails
          coverUrl={
            selectedItem.metadata
              ? `https://archive.org/download/${selectedItem.metadata.identifier}/__ia_thumb.jpg`
              : null
          }
          title={selectedItem.metadata?.title ?? selectedItem.urlOrId}
          fields={detailsFields}
          onClose={() => onSelect("")}
          actions={detailsActions}
          className="w-80"
        />
      )}
    </div>
  );
}
