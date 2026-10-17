import { useState } from 'react';
import { listingsApi } from '../api/listings';
import type { ListingSummary } from '../api/types';
import { portalLabel } from '../margin/sale-closeout';
import { Button, Card, PhaseBadge } from '../ui';
import { formatEuro } from '../lib/format';
import { SaleCloseoutForm } from './SaleCloseoutForm';

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
  purchasePriceEur,
}: {
  listings: ListingSummary[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  emptyLabel: string;
  reportSold?: boolean;
  purchasePriceEur?: number | null;
}) {
  return (
    <div className="space-y-3">
      {listings.length === 0 && <p className="text-body text-ink-muted">{emptyLabel}</p>}
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          busy={busy}
          run={run}
          reportSold={reportSold}
          purchasePriceEur={purchasePriceEur}
        />
      ))}
    </div>
  );
}

function ListingCard({
  listing,
  busy,
  run,
  reportSold,
  purchasePriceEur,
}: {
  listing: ListingSummary;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  reportSold: boolean;
  purchasePriceEur?: number | null;
}) {
  // Kleinanzeigen hat keine API und kann daher nie selbst melden, dass
  // etwas verkauft wurde (§4d/§4e-Ergänzung) — diese manuelle Meldung ist
  // für den einzigen aktiven Verkaufskanal der einzige Weg überhaupt.
  // Beim Abschluss kommen Erlös, Portal, Gebühren, Versand und optional
  // der Zahlungsweg dazu.
  const [reportingSoldFor, setReportingSoldFor] = useState<string | null>(null);
  const [confirmingCancelFor, setConfirmingCancelFor] = useState<string | null>(null);

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
                  <Button size="sm" loading={busy} disabled={busy} onClick={() => void run(() => listingsApi.publish(p.id))}>
                    Veröffentlichen
                  </Button>
                )}
                {p.status === 'PUBLISHING' && (
                  <Button size="sm" loading={busy} disabled={busy} onClick={() => void run(() => listingsApi.confirmPublished(p.id))}>
                    Ich habe es eingestellt
                  </Button>
                )}
                {p.status === 'ONLINE' && reportingSoldFor !== p.id && confirmingCancelFor !== p.id && (
                  <>
                    {reportSold && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setReportingSoldFor(p.id)}
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
                      loading={busy}
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
                  <Button size="sm" loading={busy} disabled={busy} onClick={() => void run(() => listingsApi.confirmCancellation(p.id))}>
                    Storno bestätigen
                  </Button>
                )}
              </div>
            </div>
            {reportingSoldFor === p.id && (
              <SaleCloseoutForm
                initialProceeds={listing.sellingPrice}
                initialPortal={portalLabel(p.marketplaceId)}
                purchasePriceEur={purchasePriceEur ?? null}
                showProfit={purchasePriceEur !== undefined}
                busy={busy}
                submitLabel="Verkauf speichern"
                onSubmit={(draft) => {
                  void run(() => listingsApi.markSold(p.id, draft)).then(() => setReportingSoldFor(null));
                }}
                onCancel={() => setReportingSoldFor(null)}
              />
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
