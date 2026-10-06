import { DataSource } from 'typeorm';
import {
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import {
  CapabilityCheckFailedException,
  UnconfirmedConditionException,
} from '../../domain/errors/state-transition.errors';
import { CapabilityCheckService } from './capability-check.service';

const listing = { id: 'listing-1', itemId: 'item-1' };
const item = { id: 'item-1', condition: 'good' };

function attribute(
  attributeKey: string,
  attributeValue: string | null,
  truthState: 'UNKNOWN' | 'INFERRED' | 'USER_CONFIRMED' = 'USER_CONFIRMED',
): Partial<ItemAttributeEntity> {
  return { attributeKey, attributeValue, truthState };
}

function dataSource(
  attributes: Partial<ItemAttributeEntity>[],
  foundItem: { id: string; condition: string | null } = item,
): DataSource {
  return {
    manager: {
      findOneBy: jest.fn(async (entity: unknown) => {
        if (entity === CanonicalListingEntity) return listing;
        return null;
      }),
      findOneByOrFail: jest.fn(async (entity: unknown) => {
        if (entity === ItemEntity) return foundItem;
        throw new Error('not found');
      }),
      find: jest.fn(async () => attributes),
    },
  } as unknown as DataSource;
}

describe('CapabilityCheckService category requirements', () => {
  it('blocks Kleinanzeigen clothing without size and brand', async () => {
    const service = new CapabilityCheckService(
      dataSource([attribute('category', 'Kleidung')]),
    );

    await expect(service.check(listing.id, 'KLEINANZEIGEN')).rejects.toBeInstanceOf(
      CapabilityCheckFailedException,
    );
  });

  it('lets eBay fall back the brand, but still blocks a missing size', async () => {
    const service = new CapabilityCheckService(
      dataSource([attribute('category', 'Kleidung'), attribute('brand', 'Nike')]),
    );

    try {
      await service.check(listing.id, 'EBAY');
      throw new Error('expected the size gap to block publish');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityCheckFailedException);
      const body = (error as CapabilityCheckFailedException).getResponse() as {
        details: { missing: string[] };
      };
      expect(body.details.missing).toEqual(['size']);
    }
  });

  it('accepts Medien with only a category', async () => {
    const service = new CapabilityCheckService(dataSource([attribute('category', 'Medien')]));
    await expect(service.check(listing.id, 'KLEINANZEIGEN')).resolves.toEqual({
      ok: true,
      fallbackData: {},
    });
  });

  it('requires measurements for Möbel and function for Elektronik', async () => {
    const furniture = new CapabilityCheckService(dataSource([attribute('category', 'Möbel')]));
    const electronics = new CapabilityCheckService(
      dataSource([attribute('category', 'Elektronik'), attribute('brand', 'Sony')]),
    );

    await expect(furniture.check(listing.id, 'KLEINANZEIGEN')).rejects.toBeInstanceOf(
      CapabilityCheckFailedException,
    );
    await expect(electronics.check(listing.id, 'KLEINANZEIGEN')).rejects.toBeInstanceOf(
      CapabilityCheckFailedException,
    );
  });

  it('does not treat free-text category as a taxonomy value', async () => {
    const service = new CapabilityCheckService(
      dataSource([attribute('category', 'Bekleidung > Herren > Jacken')]),
    );

    try {
      await service.check(listing.id, 'KLEINANZEIGEN');
      throw new Error('expected free-text category to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityCheckFailedException);
      const body = (error as CapabilityCheckFailedException).getResponse() as {
        details: { missing: string[] };
      };
      expect(body.details.missing).toEqual(['category']);
    }
  });

  it('still blocks while the condition is unconfirmed', async () => {
    const service = new CapabilityCheckService(
      dataSource([attribute('category', 'Sonstiges')], { id: 'item-1', condition: null }),
    );
    await expect(service.check(listing.id, 'EBAY')).rejects.toBeInstanceOf(
      UnconfirmedConditionException,
    );
  });
});
