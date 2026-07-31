import { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, X, Trash2, ChevronUp, ChevronDown, Copy, GripHorizontal } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

const STORAGE_HEIGHT = "folio.ui.consoleHeight";
const DEFAULT_HEIGHT = 288;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 520;

export interface LogLine {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  details?: string;
}

interface DebugConsoleProps {
  logs: LogLine[];
  onClear: () => void;
}

export function useDebugConsole() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const addLog = useCallback((level: LogLine["level"], message: string, details?: string) => {
    const line: LogLine = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      details,
    };
    setLogs((prev) => [...prev, line].slice(-500));
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);
  return { logs, addLog, clearLogs };
}

export function DebugConsole({ logs, onClear }: DebugConsoleProps) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HEIGHT);
      return raw !== null ? (JSON.parse(raw) as number) : DEFAULT_HEIGHT;
    } catch {
      return DEFAULT_HEIGHT;
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const setHeightPersisted = useCallback((h: number) => {
    setHeight(h);
    try {
      localStorage.setItem(STORAGE_HEIGHT, JSON.stringify(h));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragState.current = { startY: e.clientY, startHeight: height };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: MouseEvent) => {
        const s = dragState.current;
        if (!s) return;
        const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, s.startHeight - (ev.clientY - s.startY)));
        setHeightPersisted(next);
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
    },
    [height, setHeightPersisted]
  );

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, expanded]);

  const selected = logs.find((l) => l.id === selectedId);

  const copyAll = async () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.details ? "\n" + l.details : ""}`).join("\n");
    await navigator.clipboard.writeText(text);
  };

  return (
    <div
      className={cn(
        "relative flex w-full shrink-0 flex-col border-t border-border bg-bg-secondary transition-colors",
        expanded ? "" : "h-10"
      )}
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize debug console"
          onMouseDown={startResize}
          className="absolute inset-x-0 -top-1 z-10 flex h-2 cursor-row-resize items-center justify-center text-text-muted hover:text-accent"
        >
          <GripHorizontal size={12} />
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <Terminal size={14} />
          Debug Console
          {logs.length > 0 && (
            <span className="ml-1 rounded-full bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">{logs.length}</span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyAll} title="Copy all">
            <Copy size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} title="Clear">
            <Trash2 size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(false)} title="Close">
            <X size={12} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="flex min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-text-muted">No logs yet.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedId(log.id)}
                  className={cn(
                    "cursor-pointer rounded px-1.5 py-1",
                    selectedId === log.id && "bg-bg-elevated",
                    log.level === "error" && "text-danger",
                    log.level === "warn" && "text-warning",
                    log.level === "info" && "text-text-secondary",
                    log.level === "debug" && "text-text-muted"
                  )}
                >
                  <span className="opacity-60">[{log.timestamp}]</span>{" "}
                  <span className="font-semibold uppercase">{log.level}</span>{" "}
                  {log.message}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          {selected && (
            <div className="w-1/3 overflow-y-auto border-l border-border bg-bg-elevated p-3 text-xs">
              <p className="mb-2 font-semibold text-text-primary">Details</p>
              <pre className="whitespace-pre-wrap break-all text-text-secondary">{selected.details || "No additional details"}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
