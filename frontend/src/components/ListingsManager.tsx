import { useState } from 'react';
import { listingsApi } from '../api/listings';
import type { ListingSummary } from '../api/types';
import { StatusBadge } from './StatusBadge';

// Vertriebskanal-Entscheidung (docs/README.md §4e-Ergänzung, September
// 2026): Kleinanzeigen ist der einzige Verkaufskanal — eBay dient nur noch
// als Recherche-Quelle (Preis-/Beschreibungsvergleich), nicht als Publish-Ziel.
const MARKETPLACE = 'KLEINANZEIGEN';

/**
 * Verwaltet Marketplace Projections eines Canonical Listings — geteilt
 * zwischen Item- und Bundle-Detailseiten (beide hängen an derselben
 * `canonical_listings`/`marketplace_projections`-Struktur, Doc 01 §3).
 */
export function ListingsManager({
  listings,
  busy,
  run,
  emptyLabel,
}: {
  listings: ListingSummary[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      {listings.length === 0 && <p className="text-sm text-gray-500">{emptyLabel}</p>}
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} busy={busy} run={run} />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  busy,
  run,
}: {
  listing: ListingSummary;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  // Kleinanzeigen hat keine API und kann daher nie selbst melden, dass
  // etwas verkauft wurde (§4d/§4e-Ergänzung) — diese manuelle Meldung ist
  // für den einzigen aktiven Verkaufskanal der einzige Weg überhaupt.
  const [reportingSoldFor, setReportingSoldFor] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState('');

  const startReportingSold = (projectionId: string) => {
    setReportingSoldFor(projectionId);
    setSoldPrice(listing.sellingPrice.toString());
  };

  const confirmSold = async (projectionId: string) => {
    const price = Number(soldPrice);
    if (!price || price <= 0) return;
    await run(() => listingsApi.markSold(projectionId, price));
    setReportingSoldFor(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="font-bold text-gray-900">{listing.sellingPrice.toFixed(2)} €</p>
        <p className="text-xs text-gray-500">{listing.descriptionText}</p>
      </div>
      <div className="space-y-2">
        {listing.projections.map((p) => (
          <div key={p.id} className="bg-gray-50 rounded-lg p-2 border border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">{p.marketplaceId}</span>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex gap-1">
                {(p.status === 'DRAFT' || p.status === 'READY') && (
                  <ActionButton
                    label="Publish"
                    onClick={() => run(() => listingsApi.publish(p.id))}
                    disabled={busy}
                  />
                )}
                {p.status === 'PUBLISHING' && (
                  <ActionButton
                    label="Ich habe es eingestellt"
                    onClick={() => run(() => listingsApi.confirmPublished(p.id))}
                    disabled={busy}
                  />
                )}
                {p.status === 'ONLINE' && reportingSoldFor !== p.id && (
                  <>
                    <ActionButton
                      label="Als verkauft markieren"
                      onClick={() => startReportingSold(p.id)}
                      disabled={busy}
                    />
                    <ActionButton
                      label="Zurückziehen"
                      onClick={() => run(() => listingsApi.cancel(p.id))}
                      disabled={busy}
                    />
                  </>
                )}
                {p.status === 'CANCEL_PENDING' && (
                  <ActionButton
                    label="Storno bestätigen"
                    onClick={() => run(() => listingsApi.confirmCancellation(p.id))}
                    disabled={busy}
                  />
                )}
              </div>
            </div>
            {reportingSoldFor === p.id && (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={soldPrice}
                  onChange={(e) => setSoldPrice(e.target.value)}
                  className="flex-1 p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-black"
                  placeholder="Tatsächlicher Verkaufspreis in €"
                  autoFocus
                />
                <ActionButton
                  label="Bestätigen"
                  onClick={() => confirmSold(p.id)}
                  disabled={busy || !soldPrice}
                />
                <ActionButton
                  label="Abbrechen"
                  onClick={() => setReportingSoldFor(null)}
                  disabled={busy}
                  variant="secondary"
                />
              </div>
            )}
          </div>
        ))}
        {!listing.projections.some((p) => p.marketplaceId === MARKETPLACE) && (
          <div className="flex gap-2 items-center pt-1">
            <ActionButton
              label="+ Kleinanzeigen-Listing"
              onClick={() => run(() => listingsApi.create(listing.id, MARKETPLACE))}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'text-[11px] font-bold px-2 py-1 rounded-lg bg-black text-white disabled:bg-gray-300 shrink-0'
          : 'text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-200 text-gray-700 disabled:opacity-60 shrink-0'
      }
    >
      {label}
    </button>
  );
}
