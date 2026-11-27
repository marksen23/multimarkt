import { EntityManager } from 'typeorm';
import { ProjectionLifecycleState } from '../../domain/state-vocabulary';
import {
  CanonicalListingEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';

const ALREADY_SETTLED: ReadonlySet<ProjectionLifecycleState> = new Set([
  'SOLD',
  'CANCELLED',
  'CANCEL_PENDING',
]);

/**
 * Verkauf auf einer Karte: jede andere Karte desselben Listings, die noch
 * nicht erledigt ist, geht auf „bitte zurückziehen“. Der Mensch bestätigt
 * das Zurückziehen selbst — hier wird nichts bei einem Portal gelöscht.
 */
export async function flagSiblingChannelCards(
  manager: EntityManager,
  stateGuard: StateGuardService,
  winningProjectionId: string,
): Promise<void> {
  const winner = await manager.findOne(MarketplaceProjectionEntity, {
    where: { id: winningProjectionId },
  });
  if (!winner) return;

  const siblings = await manager.find(MarketplaceProjectionEntity, {
    where: { canonicalListingId: winner.canonicalListingId },
  });

  for (const sibling of siblings) {
    if (sibling.id === winningProjectionId) continue;
    if (ALREADY_SETTLED.has(sibling.status)) continue;
    await stateGuard.transitionProjectionWithManager(manager, sibling.id, {
      type: 'CANCEL_PENDING_TRIGGERED',
      actor: { type: 'SYSTEM' },
    });
  }
}

/**
 * Verkauf ohne passende Kanal-Karte: jede noch offene Karte des Artikels
 * soll zurückgezogen werden. Die verkaufte Karte selbst gibt es hier nicht.
 */
export async function flagOpenChannelCards(
  manager: EntityManager,
  stateGuard: StateGuardService,
  itemId: string,
): Promise<void> {
  const cards = await manager
    .createQueryBuilder(MarketplaceProjectionEntity, 'projection')
    .innerJoin(
      CanonicalListingEntity,
      'listing',
      'listing.id = projection.canonical_listing_id',
    )
    .where('listing.item_id = :itemId', { itemId })
    .getMany();

  for (const card of cards) {
    if (ALREADY_SETTLED.has(card.status)) continue;
    await stateGuard.transitionProjectionWithManager(manager, card.id, {
      type: 'CANCEL_PENDING_TRIGGERED',
      actor: { type: 'SYSTEM' },
    });
  }
}
