import type { ListingSummary } from '../api/types';
import { statusInfo } from '../ui/phase';

export type ChannelFilter = 'all' | 'KLEINANZEIGEN' | 'EBAY' | 'VINTED' | 'none';

export const CHANNEL_FILTERS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'KLEINANZEIGEN', label: 'Kleinanzeigen' },
  { key: 'EBAY', label: 'eBay' },
  { key: 'VINTED', label: 'Vinted' },
  { key: 'none', label: 'Noch nirgends' },
];

const CHANNEL_LABEL: Record<string, string> = {
  KLEINANZEIGEN: 'Kleinanzeigen',
  EBAY: 'eBay',
  VINTED: 'Vinted',
  FACEBOOK: 'Facebook',
};

const CHANNEL_ORDER = ['KLEINANZEIGEN', 'EBAY', 'VINTED', 'FACEBOOK'];

/** Sichtbar im Bestand. Stornierte Karten zählen nicht als „online irgendwo“. */
const ACTIVE_STATUSES = new Set([
  'DRAFT',
  'READY',
  'COPIED',
  'PUBLISHING',
  'ONLINE',
  'CANCEL_PENDING',
  'SOLD',
]);

const STRENGTH: Record<string, number> = {
  SOLD: 80,
  ONLINE: 70,
  PUBLISHING: 60,
  CANCEL_PENDING: 50,
  COPIED: 40,
  READY: 30,
  DRAFT: 20,
  CANCELLED: 10,
};

export interface ChannelChip {
  marketplaceId: string;
  label: string;
  status: string;
  statusLabel: string;
}

export function channelChips(listings: ListingSummary[]): ChannelChip[] {
  const best = new Map<string, { status: string; rank: number }>();
  for (const listing of listings) {
    for (const projection of listing.projections) {
      const rank = STRENGTH[projection.status] ?? 0;
      const current = best.get(projection.marketplaceId);
      if (!current || rank > current.rank) {
        best.set(projection.marketplaceId, { status: projection.status, rank });
      }
    }
  }

  return [...best.keys()]
    .sort((a, b) => {
      const left = CHANNEL_ORDER.indexOf(a);
      const right = CHANNEL_ORDER.indexOf(b);
      return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
    })
    .map((marketplaceId) => {
      const status = best.get(marketplaceId)!.status;
      return {
        marketplaceId,
        label: CHANNEL_LABEL[marketplaceId] ?? marketplaceId,
        status,
        statusLabel: statusInfo(status).label,
      };
    });
}

export function matchesChannelFilter(listings: ListingSummary[], filter: ChannelFilter): boolean {
  if (filter === 'all') return true;
  const active = new Set<string>();
  for (const listing of listings) {
    for (const projection of listing.projections) {
      if (ACTIVE_STATUSES.has(projection.status)) active.add(projection.marketplaceId);
    }
  }
  if (filter === 'none') {
    return !['KLEINANZEIGEN', 'EBAY', 'VINTED'].some((id) => active.has(id));
  }
  return active.has(filter);
}

export function channelSearchText(listings: ListingSummary[]): string {
  return channelChips(listings)
    .map((chip) => `${chip.label} ${chip.statusLabel}`)
    .join(' ');
}
