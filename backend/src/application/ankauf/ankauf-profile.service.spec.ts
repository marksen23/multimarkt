import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ANKAUF_SEARCH_HISTORY_LIMIT } from '../../domain/ankauf/search-place';
import type { AnkaufResearchResult } from '../../domain/ankauf/ankauf.types';
import {
  AnkaufSearchEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { AnkaufProfileService } from './ankauf-profile.service';
import { AnkaufResearchService } from './ankauf-research.service';

function resultFor(keywords: string): AnkaufResearchResult {
  return {
    keywords,
    location: 'PLZ 50667 (20 km Umkreis)',
    marketMedianEur: 65,
    listings: [
      {
        title: `${keywords} wie neu im Titel`,
        price: 40,
        platform: 'EBAY',
        url: null,
        condition: null,
        conditionKey: null,
        conditionUncertain: true,
        dealScore: 'SEHR_GUT',
        priceVsMarketPct: -38.5,
      },
    ],
    conditionPriceImpact: {},
    searchedAt: '2026-10-15T12:00:00.000Z',
  };
}

describe('AnkaufProfileService', () => {
  function setup(options?: { postalCode?: string | null; radiusKm?: number }) {
    const user = {
      id: 'user-1',
      postalCode: options?.postalCode === undefined ? '50667' : options.postalCode,
      searchRadiusKm: options?.radiusKm ?? 20,
    } as UserEntity;
    const searches: AnkaufSearchEntity[] = [];
    let sequence = 0;

    const manager = {
      findOneBy: jest.fn(async (entity: unknown, where: { id?: string }) => {
        if (entity === UserEntity && where.id === user.id) return user;
        return null;
      }),
      findOne: jest.fn(
        async (entity: unknown, opts: { where: { id: string; userId: string } }) => {
          if (entity !== AnkaufSearchEntity) return null;
          return (
            searches.find(
              (row) => row.id === opts.where.id && row.userId === opts.where.userId,
            ) ?? null
          );
        },
      ),
      find: jest.fn(async (entity: unknown) => {
        if (entity !== AnkaufSearchEntity) return [];
        return [...searches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
      save: jest.fn(async (entity: unknown, value: object) => {
        if (entity === UserEntity) {
          Object.assign(user, value);
          return user;
        }
        sequence += 1;
        const row = {
          id: `search-${sequence}`,
          createdAt: new Date(Date.UTC(2026, 9, 15, 12, sequence)),
          ...(value as object),
        } as AnkaufSearchEntity;
        searches.push(row);
        return row;
      }),
      delete: jest.fn(async (_entity: unknown, criteria: { id: string }) => {
        const index = searches.findIndex((row) => row.id === criteria.id);
        if (index >= 0) searches.splice(index, 1);
      }),
    };

    const research = {
      search: jest.fn(async (keywords: string) => resultFor(keywords)),
    } as unknown as AnkaufResearchService;

    const service = new AnkaufProfileService(
      { manager } as unknown as DataSource,
      research,
    );

    return { service, user, searches, research, manager };
  }

  it('rejects a search until a postal code is saved', async () => {
    const { service, research } = setup({ postalCode: null });
    await expect(service.search('user-1', 'Jacke')).rejects.toBeInstanceOf(BadRequestException);
    expect(research.search).not.toHaveBeenCalled();
  });

  it('searches with the saved postal code and radius', async () => {
    const { service, research } = setup({ postalCode: '50667', radiusKm: 30 });
    await service.search('user-1', '  Jacke  ');
    expect(research.search).toHaveBeenCalledWith('Jacke', {
      postalCode: '50667',
      radiusKm: 30,
    });
  });

  it('keeps the search so it can be opened again', async () => {
    const { service } = setup();
    await service.search('user-1', 'Nike Air Max');
    const list = await service.list('user-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      keywords: 'Nike Air Max',
      postalCode: '50667',
      radiusKm: 20,
      location: 'PLZ 50667 (20 km Umkreis)',
      listingCount: 1,
    });
    const opened = await service.open('user-1', list[0].id);
    expect(opened.keywords).toBe('Nike Air Max');
    expect(opened.listings[0].conditionUncertain).toBe(true);
  });

  it('drops the oldest search past the short history', async () => {
    const { service, searches } = setup();
    for (let i = 0; i < ANKAUF_SEARCH_HISTORY_LIMIT + 1; i += 1) {
      await service.search('user-1', `Suche ${i}`);
    }
    expect(searches).toHaveLength(ANKAUF_SEARCH_HISTORY_LIMIT);
    const list = await service.list('user-1');
    expect(list.map((row) => row.keywords)).not.toContain('Suche 0');
    expect(list[0].keywords).toBe(`Suche ${ANKAUF_SEARCH_HISTORY_LIMIT}`);
  });

  it('does not open another user\'s search', async () => {
    const { service } = setup();
    await service.search('user-1', 'Jacke');
    const [saved] = await service.list('user-1');
    await expect(service.open('user-2', saved.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores a five-digit postal code and a known radius', async () => {
    const { service, user, manager } = setup({ postalCode: null });
    const profile = await service.updateProfile('user-1', {
      postalCode: ' 80331 ',
      radiusKm: 50,
    });
    expect(profile).toEqual({ postalCode: '80331', radiusKm: 50 });
    expect(user.postalCode).toBe('80331');
    expect(manager.save).toHaveBeenCalled();
  });

  it('rejects a postal code that is not five digits', async () => {
    const { service, manager } = setup();
    await expect(
      service.updateProfile('user-1', { postalCode: 'Berlin', radiusKm: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a radius outside the steps', async () => {
    const { service } = setup();
    await expect(
      service.updateProfile('user-1', { postalCode: '50667', radiusKm: 15 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
