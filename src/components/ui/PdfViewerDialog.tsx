import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Loader2, X, Maximize, Maximize2, Minimize2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { cn } from "../../lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerDialogProps {
  open: boolean;
  path: string;
  title: string;
  onClose: () => void;
}

const ZOOM_STEP = 0.25;

export function PdfViewerDialog({ open, path, title, onClose }: PdfViewerDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load the document from the asset protocol URL - pdf.js issues range
  // requests, so only the requested pages are transferred, not the whole file.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPageNum(1);
      setNumPages(0);
      try {
        const url = convertFileSrc(path);
        const task = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = task;
        const doc = await task.promise;
        if (cancelled) {
          task.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        // fit first page to container width
        const page = await doc.getPage(1);
        const containerWidth = containerRef.current?.clientWidth ?? 800;
        const vp = page.getViewport({ scale: 1 });
        const scale = Math.max(0.25, (containerWidth - 48) / vp.width);
        setFitScale(scale);
        setZoom(scale);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
      docRef.current = null;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
    };
  }, [open, path]);

  // Render the current page
  useEffect(() => {
    if (!open || !docRef.current || pageNum < 1 || pageNum > numPages) return;
    let cancelled = false;
    const render = async () => {
      const doc = docRef.current;
      if (!doc) return;
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zoom });
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTaskRef.current?.cancel();
        const task = page.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        // cancelled renders are expected on page/zoom changes
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) {
          setError(String(e));
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [open, pageNum, zoom, numPages]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      dialogRef.current
        ?.requestFullscreen()
        .catch((e) => setError(String(e)));
    }
  }, []);

  // Track fullscreen state and re-fit the page when entering fullscreen
  useEffect(() => {
    const onFsChange = () => {
      const active = document.fullscreenElement === dialogRef.current;
      setIsFullscreen(active);
      if (active) {
        // container width changed - recompute fit from the rendered page
        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          const container = containerRef.current;
          if (!canvas || !container) return;
          const baseWidth = canvas.getBoundingClientRect().width / zoom;
          if (baseWidth > 0) {
            setZoom(Math.max(0.25, (container.clientWidth - 48) / baseWidth));
          }
        });
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [zoom]);

  // leave fullscreen when the viewer closes
  useEffect(() => {
    if (!open && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [open]);

  const goPage = useCallback(
    (delta: number) => {
      setPageNum((p) => Math.min(numPages, Math.max(1, p + delta)));
    },
    [numPages]
  );

  // --- Mouse zoom + pan ---
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const panMovedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  // Ctrl+wheel (and trackpad pinch, which Chromium delivers as ctrl+wheel)
  // zooms toward the cursor, keeping the point under the pointer stable.
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const onZoomWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.min(3, Math.max(0.25, zoomRef.current * factor));
      const ratio = next / zoomRef.current;
      zoomRef.current = next;
      setZoom(next);
      // after the canvas resizes, adjust scroll so the cursor point stays put
      requestAnimationFrame(() => {
        el.scrollLeft = (px + el.scrollLeft) * ratio - px;
        el.scrollTop = (py + el.scrollTop) * ratio - py;
      });
    };
    el.addEventListener("wheel", onZoomWheel, { passive: false });
    return () => el.removeEventListener("wheel", onZoomWheel);
  }, [open]);

  // Wheel-to-flip: native scrolling within a tall page; flipping only once the
  // user reaches the bottom/top of the scroll area (reader-app convention).
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // reserved for zoom
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      const atTop = el.scrollTop <= 2;
      if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        goPage(1);
      } else if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        goPage(-1);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, goPage]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el || e.button !== 0) return;
    panState.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = panState.current;
    const el = containerRef.current;
    if (!s || !el) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.moved && Math.abs(dx) + Math.abs(dy) > 4) s.moved = true;
    if (!s.moved) return;
    el.scrollLeft = s.scrollLeft - dx;
    el.scrollTop = s.scrollTop - dy;
    setDragging(true);
  };

  const handlePointerUp = () => {
    panMovedRef.current = panState.current?.moved ?? false;
    panState.current = null;
    setDragging(false);
  };

  // Click halves of the page to flip (PDF-reader convention) - skipped after a drag.
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (panMovedRef.current) {
        panMovedRef.current = false;
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX - rect.left > rect.width / 2) goPage(1);
      else goPage(-1);
    },
    [goPage]
  );

  // Reader keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("button, input, select")) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          goPage(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goPage(-1);
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(3, z + ZOOM_STEP));
          break;
        case "-":
          setZoom((z) => Math.max(0.25, z - ZOOM_STEP));
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "Escape":
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPage, onClose, toggleFullscreen]);

  return (
    <Dialog open={open} onClose={onClose} className="flex h-[88vh] w-[88vw] max-w-7xl flex-col p-0">
      <div ref={dialogRef} className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary" title={title}>
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.25, z - ZOOM_STEP))} title="Zoom out (-)" aria-label="Zoom out">
            <ZoomOut size={16} />
          </Button>
          <span className="w-14 text-center text-xs text-text-muted">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(3, z + ZOOM_STEP))} title="Zoom in (+)" aria-label="Zoom in">
            <ZoomIn size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(fitScale)} title="Fit to width" aria-label="Fit to width">
            <Maximize size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen} title="Fullscreen (F)" aria-label="Toggle fullscreen">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goPage(-1)} disabled={pageNum <= 1} title="Previous page" aria-label="Previous page">
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-16 text-center text-xs text-text-muted">
            {numPages > 0 ? `${pageNum} / ${numPages}` : "—"}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goPage(1)} disabled={pageNum >= numPages} title="Next page" aria-label="Next page">
            <ChevronRight size={16} />
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close (Esc)" aria-label="Close viewer">
            <X size={16} />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "flex min-h-0 flex-1 items-start justify-center overflow-auto bg-bg-overlay p-6",
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        title="Scroll to move, drag to pan, Ctrl+wheel to zoom"
      >
        {loading ? (
          <div className="flex items-center gap-2 py-20 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading PDF…</span>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-sm text-danger">{error}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} onClick={handleCanvasClick} className="rounded-sm bg-white shadow-2xl" title="Click left/right half to turn pages" />
        )}
      </div>
      </div>
    </Dialog>
  );
}
