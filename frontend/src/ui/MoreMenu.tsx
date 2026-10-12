import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface MoreMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** „⋯“-Menü für Sekundäraktionen, damit jeder Screen nur eine Primäraktion zeigt. */
export function MoreMenu({ items, label = 'Weitere Aktionen' }: { items: MoreMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="w-10 h-10 rounded-full flex items-center justify-center text-ink-muted hover:bg-surface-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="more" size={20} strokeWidth={2.4} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-30 min-w-52 bg-surface border border-line rounded-card shadow-float p-1.5 animate-fade-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-control text-body text-left disabled:opacity-50 ${
                item.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-hover'
              }`}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
