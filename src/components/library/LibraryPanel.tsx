import { BookOpen } from "lucide-react";

export function LibraryPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-text-muted">
      <div className="mb-3 rounded-full bg-bg-elevated p-4">
        <BookOpen size={24} />
      </div>
      <p className="text-sm font-medium">Library is coming soon</p>
      <p className="mt-1 max-w-xs text-xs">Downloaded books will appear here. A reader view is planned for a future update.</p>
    </div>
  );
}
