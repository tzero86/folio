import { cn } from "../../lib/utils";
import type { DownloadStatus } from "../../types";

const variants: Record<DownloadStatus, string> = {
  pending: "bg-bg-elevated text-text-muted",
  fetching: "bg-warning/10 text-warning",
  queued: "bg-accent-subtle text-accent",
  started: "bg-accent-subtle text-accent",
  downloading: "bg-accent-subtle text-accent",
  done: "bg-success/10 text-success",
  error: "bg-danger/10 text-danger",
};

const labels: Record<DownloadStatus, string> = {
  pending: "Pending",
  fetching: "Fetching",
  queued: "Queued",
  started: "Started",
  downloading: "Downloading",
  done: "Done",
  error: "Error",
};

interface StatusBadgeProps {
  status: DownloadStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[status],
        className
      )}
    >
      {labels[status]}
    </span>
  );
}
