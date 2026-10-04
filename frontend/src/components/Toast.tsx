import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++nextId;
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 3500));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-20 sm:bottom-6 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg border transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              toast.kind === 'error'
                ? 'bg-danger-soft border-danger/30 text-danger'
                : toast.kind === 'info'
                ? 'bg-surface border-line text-ink'
                : 'bg-accent-soft border-accent/30 text-accent'
            }`}
          >
            <span>{toast.kind === 'error' ? '✗' : toast.kind === 'info' ? 'ℹ' : '✓'}</span>
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-xs"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.show;
}
