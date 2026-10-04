const COLORS: Record<string, string> = {
  NEW: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
  ANALYZING: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  REVIEW_REQUIRED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  READY: 'bg-accent-soft text-accent',
  BUNDLED: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  LISTED: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  SOLD: 'bg-accent-soft text-accent',
  ARCHIVED: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
  SALE_CONFLICT: 'bg-danger-soft text-danger',
  CANCELLED: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
  DRAFT: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
  PUBLISHING: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  ONLINE: 'bg-accent-soft text-accent',
  CANCEL_PENDING: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
};

const LABELS: Record<string, string> = {
  NEW: 'Neu',
  ANALYZING: 'Analysiert…',
  REVIEW_REQUIRED: 'Prüfung nötig',
  READY: 'Bereit',
  BUNDLED: 'Gebündelt',
  LISTED: 'Gelistet',
  SOLD: 'Verkauft',
  ARCHIVED: 'Archiviert',
  SALE_CONFLICT: 'Verkaufskonflikt',
  CANCELLED: 'Storniert',
  DRAFT: 'Entwurf',
  PUBLISHING: 'Wird veröffentlicht',
  ONLINE: 'Online',
  CANCEL_PENDING: 'Storno ausstehend',
};

export function StatusBadge({ status }: { status: string }) {
  const isAnalyzing = status === 'ANALYZING';
  const isReady = status === 'READY';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
        COLORS[status] ?? 'bg-zinc-500/10 text-zinc-500'
      }`}
    >
      {isAnalyzing && <PulseDot color="currentColor" />}
      {isReady && <SolidDot />}
      {LABELS[status] ?? status}
    </span>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function SolidDot() {
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
  );
}
