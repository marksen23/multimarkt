import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface border border-line rounded-card shadow-card ${className ?? ''}`}
      {...rest}
    />
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h2 className="text-micro uppercase text-ink-faint">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-display text-ink">{title}</h1>
        {subtitle && <p aria-live="polite" className="text-body text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-8 text-center flex flex-col items-center gap-3">
      <span className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="text-title text-ink">{title}</p>
        {text && <p className="text-body text-ink-muted mt-1">{text}</p>}
      </div>
      {action}
    </Card>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'info';
  children: ReactNode;
}) {
  const cls =
    tone === 'danger'
      ? 'bg-danger-soft text-danger border-danger/20'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning border-warning/20'
        : 'bg-phase-capture-soft text-phase-capture border-phase-capture/20';
  const icon: IconName = tone === 'info' ? 'sparkle' : 'alert';
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-2 items-start border rounded-control px-3 py-2.5 text-label ${cls}`}>
      <Icon name={icon} size={15} className="mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
