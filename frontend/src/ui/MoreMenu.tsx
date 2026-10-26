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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const menu = ref.current?.querySelector('[role="menu"]');
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      let next = current;
      if (e.key === 'ArrowDown') next = current < items.length - 1 ? current + 1 : 0;
      else if (e.key === 'ArrowUp') next = current > 0 ? current - 1 : items.length - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      items[next]?.focus();
    };
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
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={index === 0}
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
