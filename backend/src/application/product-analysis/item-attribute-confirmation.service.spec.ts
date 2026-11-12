import { DataSource } from 'typeorm';
import { ItemEntity } from '../../infrastructure/database/entities';
import { ItemAttributeConfirmationService } from './item-attribute-confirmation.service';

describe('ItemAttributeConfirmationService', () => {
  it('writes a corrected title onto the item', async () => {
    const existing = {
      itemId: 'item-1',
      attributeKey: 'title',
      attributeValue: 'Bohrer',
      truthState: 'INFERRED',
      source: 'gemini-flash-latest',
    };
    const update = jest.fn().mockResolvedValue(undefined);
    const dataSource = {
      manager: {
        findOneBy: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation(async (_entity: unknown, row: unknown) => row),
        update,
      },
    } as unknown as DataSource;

    const saved = await new ItemAttributeConfirmationService(dataSource).confirm(
      'item-1',
      'title',
      'Bosch GBH 2-28 F',
      { type: 'USER' },
    );

    expect(saved.attributeValue).toBe('Bosch GBH 2-28 F');
    expect(saved.truthState).toBe('USER_CONFIRMED');
    expect(update).toHaveBeenCalledWith(ItemEntity, { id: 'item-1' }, { title: 'Bosch GBH 2-28 F' });
  });

  it('creates a model the seller typed when the photos had none', async () => {
    const insert = jest.fn();
    const dataSource = {
      manager: {
        findOneBy: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockImplementation(async (_entity: unknown, row: unknown) => row),
        update: jest.fn(),
        find: jest.fn(),
        insert,
      },
    } as unknown as DataSource;

    const saved = await new ItemAttributeConfirmationService(dataSource).confirm(
      'item-1',
      'model',
      'GBH 2-28 F',
      { type: 'USER' },
    );

    expect(saved).toMatchObject({
      attributeKey: 'model',
      attributeValue: 'GBH 2-28 F',
      truthState: 'USER_CONFIRMED',
      source: 'USER_INPUT',
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
