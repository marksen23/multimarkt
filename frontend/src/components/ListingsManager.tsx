import { useState } from 'react';
import { listingsApi } from '../api/listings';
import type { ListingSummary } from '../api/types';
import { StatusBadge } from './StatusBadge';

const MARKETPLACES = ['EBAY', 'KLEINANZEIGEN'];

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
  const [marketplace, setMarketplace] = useState(MARKETPLACES[0]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="font-bold text-gray-900">{listing.sellingPrice.toFixed(2)} €</p>
        <p className="text-xs text-gray-500">{listing.descriptionText}</p>
      </div>
      <div className="space-y-2">
        {listing.projections.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border border-gray-100"
          >
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
              {p.status === 'ONLINE' && (
                <ActionButton
                  label="Zurückziehen"
                  onClick={() => run(() => listingsApi.cancel(p.id))}
                  disabled={busy}
                />
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
        ))}
        {!listing.projections.some((p) => p.marketplaceId === marketplace) && (
          <div className="flex gap-2 items-center pt-1">
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              className="flex-1 p-2 border border-gray-200 rounded-lg text-xs"
            >
              {MARKETPLACES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ActionButton
              label="+ Listing"
              onClick={() => run(() => listingsApi.create(listing.id, marketplace))}
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
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-[11px] font-bold px-2 py-1 rounded-lg bg-black text-white disabled:bg-gray-300"
    >
      {label}
    </button>
  );
}
