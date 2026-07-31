import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-danger/30 bg-danger/10 text-danger",
  info: "border-accent/30 bg-accent-subtle text-accent",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const Icon = icons[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      className={cn("pointer-events-auto mb-3 flex w-80 items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur", colors[toast.type])}
    >
      <Icon size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs opacity-90">{toast.message}</p>}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: ToastType, title: string, message?: string, duration?: number) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
    return id;
  };

  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, addToast, dismissToast };
}
