import { useState } from 'react';
import { listingsApi } from '../api/listings';
import type { ListingSummary } from '../api/types';
import { Button, Card, PhaseBadge, inputClass } from '../ui';
import { formatEuro } from '../lib/format';

const MARKETPLACE = 'KLEINANZEIGEN';

const MP_LABELS: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
  FACEBOOK: 'Facebook',
};

/**
 * Verwaltet Marketplace Projections eines Canonical Listings — geteilt
 * zwischen Item- und Bundle-Detailseiten (beide hängen an derselben
 * `canonical_listings`/`marketplace_projections`-Struktur, Doc 01 §3).
 * `reportSold=false`, wenn die Seite selbst eine Verkauft-Aktion anbietet.
 */
export function ListingsManager({
  listings,
  busy,
  run,
  emptyLabel,
  reportSold = true,
}: {
  listings: ListingSummary[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  emptyLabel: string;
  reportSold?: boolean;
}) {
  return (
    <div className="space-y-3">
      {listings.length === 0 && <p className="text-body text-ink-muted">{emptyLabel}</p>}
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} busy={busy} run={run} reportSold={reportSold} />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  busy,
  run,
  reportSold,
}: {
  listing: ListingSummary;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  reportSold: boolean;
}) {
  // Kleinanzeigen hat keine API und kann daher nie selbst melden, dass
  // etwas verkauft wurde (§4d/§4e-Ergänzung) — diese manuelle Meldung ist
  // für den einzigen aktiven Verkaufskanal der einzige Weg überhaupt.
  const [reportingSoldFor, setReportingSoldFor] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState('');
  const [confirmingCancelFor, setConfirmingCancelFor] = useState<string | null>(null);

  const confirmSold = async (projectionId: string) => {
    const price = Number(soldPrice);
    if (!price || price <= 0) return;
    await run(() => listingsApi.markSold(projectionId, price));
    setReportingSoldFor(null);
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-title tabular-nums text-ink">{formatEuro(listing.sellingPrice)}</p>
        {listing.descriptionText && <p className="text-label font-normal text-ink-muted line-clamp-2 mt-0.5">{listing.descriptionText}</p>}
      </div>
      <div className="space-y-2">
        {listing.projections.map((p) => (
          <div key={p.id} className="bg-surface-hover rounded-control p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-body font-semibold text-ink">{MP_LABELS[p.marketplaceId] ?? p.marketplaceId}</span>
                <PhaseBadge status={p.status} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(p.status === 'DRAFT' || p.status === 'READY') && (
                  <Button size="sm" disabled={busy} onClick={() => void run(() => listingsApi.publish(p.id))}>
                    Veröffentlichen
                  </Button>
                )}
                {p.status === 'PUBLISHING' && (
                  <Button size="sm" disabled={busy} onClick={() => void run(() => listingsApi.confirmPublished(p.id))}>
                    Ich habe es eingestellt
                  </Button>
                )}
                {p.status === 'ONLINE' && reportingSoldFor !== p.id && confirmingCancelFor !== p.id && (
                  <>
                    {reportSold && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setReportingSoldFor(p.id);
                          setSoldPrice(listing.sellingPrice.toString());
                        }}
                      >
                        Verkauft
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingCancelFor(p.id)}>
                      Zurückziehen
                    </Button>
                  </>
                )}
                {confirmingCancelFor === p.id && (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        setConfirmingCancelFor(null);
                        void run(() => listingsApi.cancel(p.id));
                      }}
                    >
                      Wirklich zurückziehen
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmingCancelFor(null)}>
                      Abbrechen
                    </Button>
                  </>
                )}
                {p.status === 'CANCEL_PENDING' && (
                  <Button size="sm" disabled={busy} onClick={() => void run(() => listingsApi.confirmCancellation(p.id))}>
                    Storno bestätigen
                  </Button>
                )}
              </div>
            </div>
            {reportingSoldFor === p.id && (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={soldPrice}
                  onChange={(e) => setSoldPrice(e.target.value)}
                  className={`${inputClass} flex-1 min-w-0`}
                  placeholder="Tatsächlicher Verkaufspreis in €"
                  aria-label="Tatsächlicher Verkaufspreis in Euro"
                  autoFocus
                />
                <Button size="sm" disabled={busy || !soldPrice} onClick={() => void confirmSold(p.id)}>
                  Bestätigen
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReportingSoldFor(null)}>
                  Abbrechen
                </Button>
              </div>
            )}
          </div>
        ))}
        {!listing.projections.some((p) => p.marketplaceId === MARKETPLACE) && (
          <Button size="sm" variant="secondary" icon="plus" disabled={busy} onClick={() => void run(() => listingsApi.create(listing.id, MARKETPLACE))}>
            Kleinanzeigen verfolgen
          </Button>
        )}
      </div>
    </Card>
  );
}
