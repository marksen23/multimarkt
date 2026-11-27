import { EntityManager } from 'typeorm';
import { StateGuardService } from '../state-guard/state-guard.service';
import { flagOpenChannelCards, flagSiblingChannelCards } from './flag-sibling-channel-cards';

describe('flagSiblingChannelCards', () => {
  it('asks every other open card to be withdrawn and leaves the sold card alone', async () => {
    const siblings = [
      { id: 'sold', status: 'SOLD', canonicalListingId: 'listing-1' },
      { id: 'online', status: 'ONLINE', canonicalListingId: 'listing-1' },
      { id: 'copied', status: 'COPIED', canonicalListingId: 'listing-1' },
      { id: 'draft', status: 'DRAFT', canonicalListingId: 'listing-1' },
      { id: 'pending', status: 'CANCEL_PENDING', canonicalListingId: 'listing-1' },
    ];
    const manager = {
      findOne: jest.fn().mockResolvedValue(siblings[0]),
      find: jest.fn().mockResolvedValue(siblings),
    } as unknown as EntityManager;
    const stateGuard = {
      transitionProjectionWithManager: jest.fn().mockResolvedValue(undefined),
    } as unknown as StateGuardService;

    await flagSiblingChannelCards(manager, stateGuard, 'sold');

    const ids = (stateGuard.transitionProjectionWithManager as jest.Mock).mock.calls.map(
      (call) => call[1],
    );
    expect(ids).toEqual(['online', 'copied', 'draft']);
    expect(stateGuard.transitionProjectionWithManager).toHaveBeenCalledWith(
      manager,
      'online',
      expect.objectContaining({ type: 'CANCEL_PENDING_TRIGGERED', actor: { type: 'SYSTEM' } }),
    );
  });
});

describe('flagOpenChannelCards', () => {
  it('asks every still-open card of the item to be withdrawn', async () => {
    const cards = [
      { id: 'online', status: 'ONLINE' },
      { id: 'copied', status: 'COPIED' },
      { id: 'pending', status: 'CANCEL_PENDING' },
      { id: 'sold', status: 'SOLD' },
    ];
    const getMany = jest.fn().mockResolvedValue(cards);
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany,
      }),
    } as unknown as EntityManager;
    const stateGuard = {
      transitionProjectionWithManager: jest.fn().mockResolvedValue(undefined),
    } as unknown as StateGuardService;

    await flagOpenChannelCards(manager, stateGuard, 'item-1');

    const ids = (stateGuard.transitionProjectionWithManager as jest.Mock).mock.calls.map(
      (call) => call[1],
    );
    expect(ids).toEqual(['online', 'copied']);
  });
});
