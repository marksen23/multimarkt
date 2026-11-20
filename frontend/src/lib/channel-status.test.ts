import { describe, expect, it } from 'vitest';
import type { ListingSummary } from '../api/types';
import { channelChips, matchesChannelFilter } from './channel-status';

function listing(projections: { marketplaceId: string; status: ListingSummary['projections'][number]['status'] }[]): ListingSummary {
  return {
    id: 'listing-1',
    sellingPrice: 20,
    descriptionText: '',
    projections: projections.map((projection, index) => ({
      id: `p-${index}`,
      marketplaceId: projection.marketplaceId,
      status: projection.status,
      externalPlatformId: null,
    })),
  };
}

describe('channelChips', () => {
  it('keeps the strongest status per channel and a stable order', () => {
    const chips = channelChips([
      listing([
        { marketplaceId: 'VINTED', status: 'DRAFT' },
        { marketplaceId: 'EBAY', status: 'DRAFT' },
        { marketplaceId: 'EBAY', status: 'ONLINE' },
        { marketplaceId: 'KLEINANZEIGEN', status: 'COPIED' },
      ]),
    ]);
    expect(chips.map((chip) => `${chip.label}:${chip.statusLabel}`)).toEqual([
      'Kleinanzeigen:Kopiert',
      'eBay:Online',
      'Vinted:Entwurf',
    ]);
  });
});

describe('matchesChannelFilter', () => {
  it('filters by channel and treats a cancelled-only item as not online anywhere', () => {
    const online = [listing([{ marketplaceId: 'EBAY', status: 'ONLINE' }])];
    const cancelled = [listing([{ marketplaceId: 'KLEINANZEIGEN', status: 'CANCELLED' }])];
    const fresh: ListingSummary[] = [];

    expect(matchesChannelFilter(online, 'EBAY')).toBe(true);
    expect(matchesChannelFilter(online, 'KLEINANZEIGEN')).toBe(false);
    expect(matchesChannelFilter(online, 'none')).toBe(false);
    expect(matchesChannelFilter(cancelled, 'KLEINANZEIGEN')).toBe(false);
    expect(matchesChannelFilter(cancelled, 'none')).toBe(true);
    expect(matchesChannelFilter(fresh, 'none')).toBe(true);
    expect(matchesChannelFilter(fresh, 'all')).toBe(true);
  });
});
