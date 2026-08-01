import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** Right-click context menu, positioned at the cursor, dismiss on click-away/Escape. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 190),
    top: Math.min(y, window.innerHeight - items.length * 34 - 12),
  };

  return (
    <div
      ref={ref}
      role="menu"
      style={style}
      className="fixed z-[70] min-w-44 rounded-lg border border-border bg-bg-secondary py-1 shadow-2xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-elevated",
            item.danger ? "text-danger" : "text-text-primary"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
