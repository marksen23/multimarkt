import { useId, type ReactElement, cloneElement } from 'react';

export const inputClass =
  'w-full px-3 py-2.5 bg-surface border border-line rounded-control text-body text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  count,
  action,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  count?: { value: number; max: number };
  action?: React.ReactNode;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const over = count ? count.value > count.max : false;
  const describedBy = hint || error ? `${id}-help` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-label text-ink-muted">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {count && (
            <span className={`text-label tabular-nums ${over ? 'text-danger' : 'text-ink-faint'}`}>
              {count.value}/{count.max}
            </span>
          )}
          {action}
        </div>
      </div>
      {cloneElement(children, { id, 'aria-invalid': !!error || over, 'aria-describedby': describedBy })}
      {(error || hint) && (
        <p id={describedBy} className={`text-label ${error ? 'text-danger' : 'text-ink-faint'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
