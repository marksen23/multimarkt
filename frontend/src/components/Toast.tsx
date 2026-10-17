import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ui';

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
    timers.current.set(id, setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3500));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed bottom-above-nav mb-4 sm:mb-6 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 items-end pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto max-w-full sm:max-w-sm flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-card bg-surface border border-line text-body font-semibold text-ink shadow-float animate-fade-in"
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                toast.kind === 'error'
                  ? 'bg-danger-soft text-danger'
                  : toast.kind === 'info'
                  ? 'bg-phase-capture-soft text-phase-capture'
                  : 'bg-accent-soft text-accent'
              }`}
            >
              <Icon
                name={toast.kind === 'error' ? 'alert' : toast.kind === 'info' ? 'sparkle' : 'check'}
                size={15}
                strokeWidth={2.2}
              />
            </span>
            <span className="min-w-0">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-ink-faint hover:bg-surface-hover hover:text-ink transition-colors"
              aria-label="Schließen"
            >
              <Icon name="x" size={15} />
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
