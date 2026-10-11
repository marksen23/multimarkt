import { Link } from 'react-router-dom';
import type { ItemListEntry } from '../api/types';
import { Icon, PhaseBadge, PHASE_BORDER, statusInfo } from '../ui';
import { formatEuro, relativeDate } from '../lib/format';

export function ItemRow({
  entry: { item, listings, thumbnailUrl },
  action,
  meta,
}: {
  entry: ItemListEntry;
  /** Nächster Schritt als Aufforderung rechts (z. B. „Prüfen“). */
  action?: string;
  meta?: string;
}) {
  const { phase } = statusInfo(item.status);
  const price = listings[0]?.sellingPrice;
  return (
    <Link
      to={`/items/${item.id}`}
      className={`group flex items-center gap-3 bg-surface border rounded-card shadow-card p-3 transition-colors hover:border-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-accent ${PHASE_BORDER[phase]}`}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className="w-14 h-14 rounded-control object-cover border border-line shrink-0" />
      ) : (
        <span className="w-14 h-14 rounded-control bg-surface-hover border border-line shrink-0 flex items-center justify-center text-ink-faint">
          <Icon name="camera" size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink truncate">{item.title ?? 'Unbenannter Artikel'}</p>
        <p className="text-label font-normal text-ink-faint truncate">
          {meta ?? item.condition ?? 'Zustand offen'} · {relativeDate(item.updatedAt)}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <PhaseBadge status={item.status} />
          {price != null && <span className="text-label tabular-nums text-ink-muted">{formatEuro(price)}</span>}
        </div>
      </div>
      {action ? (
        <span className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-accent text-accent-ink text-label">
          {action}
          <Icon name="chevronRight" size={14} strokeWidth={2.4} />
        </span>
      ) : (
        <Icon name="chevronRight" className="text-ink-faint group-hover:text-accent" />
      )}
    </Link>
  );
}
