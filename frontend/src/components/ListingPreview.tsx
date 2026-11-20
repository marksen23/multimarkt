import { formatEuro } from '../lib/format';

/**
 * Vorschau, wie Titel, Preis, Kategorie und Text in der Anzeige stehen.
 * Kein Abbild der Portalseite.
 */
export function ListingPreview({
  portal,
  title,
  price,
  category,
  condition,
  description,
  photoUrl,
}: {
  portal: string;
  title: string;
  price: string;
  category: string | null;
  condition: string | null;
  description: string;
  photoUrl: string | null;
}) {
  const amount = Number(price.replace(',', '.'));
  const priceLabel = Number.isFinite(amount) && amount > 0 ? formatEuro(amount) : 'Preis offen';

  return (
    <div className="rounded-control border border-line bg-surface-hover overflow-hidden">
      <p className="px-3 pt-3 text-micro uppercase text-ink-faint">So sieht die Anzeige auf {portal} aus</p>
      <div className="p-3 flex gap-3">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="w-20 h-20 rounded-control object-cover shrink-0 bg-line" />
        ) : (
          <div className="w-20 h-20 rounded-control bg-line shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink line-clamp-2">{title || 'Titel fehlt'}</p>
          <p className="text-title tabular-nums text-ink mt-1">{priceLabel}</p>
          {category && <p className="text-label font-normal text-ink-muted mt-1">{category}</p>}
          {condition && <p className="text-label font-normal text-ink-faint">{condition}</p>}
        </div>
      </div>
      {description && (
        <p className="px-3 pb-3 text-label font-normal text-ink-muted line-clamp-4 whitespace-pre-line">{description}</p>
      )}
    </div>
  );
}
