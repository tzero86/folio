import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { readPdfBytes } from "../../lib/tauri";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerDialogProps {
  open: boolean;
  path: string;
  title: string;
  onClose: () => void;
}

export function PdfViewerDialog({ open, path, title, onClose }: PdfViewerDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPageNum(1);
      setNumPages(0);
      setZoom(1);
      try {
        const bytes = await readPdfBytes(path);
        const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        loadingTaskRef.current = task;
        const doc = await task.promise;
        if (cancelled) {
          task.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
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

  const goPage = (delta: number) => {
    setPageNum((p) => Math.min(numPages, Math.max(1, p + delta)));
  };

  return (
    <Dialog open={open} onClose={onClose} className="flex h-[85vh] w-[85vw] max-w-6xl flex-col p-0">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary" title={title}>
          {title}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={16} />
          </Button>
          <span className="w-12 text-center text-xs text-text-muted">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={16} />
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close" aria-label="Close viewer">
            <X size={16} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-bg-overlay p-6">
        {loading ? (
          <div className="flex items-center gap-2 py-20 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading PDF…</span>
          </div>
        ) : error ? (
          <p className="py-20 text-sm text-danger">{error}</p>
        ) : (
          <canvas ref={canvasRef} className="rounded-sm bg-white shadow-2xl" />
        )}
      </div>
    </Dialog>
  );
}
