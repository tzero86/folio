import type { ReactNode } from "react";
import { X, ImageOff } from "lucide-react";
import { cn } from "../../lib/utils";

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
  className?: string;
}

/**
 * Right-hand details panel: large cover, readable typography, metadata fields
 * and action buttons. Used by Search, Library and Queue panels.
 */
export function BookDetails({ coverUrl, title, fields, description, actions, onClose, className }: BookDetailsProps) {
  const visibleFields = fields.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");

  return (
    <aside
      className={cn("flex w-80 shrink-0 flex-col border-l border-border bg-bg-secondary", className)}
      aria-label="Book details"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold text-text-primary">Details</h2>
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
                <dd className="mt-0.5 text-sm leading-snug text-text-primary">{f.value}</dd>
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
