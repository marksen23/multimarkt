import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { StateGuardService } from '../../src/application/state-guard/state-guard.service';
import { HumanGateBypassException, InvalidStateTransitionException, UnconfirmedConditionException } from '../../src/domain/errors/state-transition.errors';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
  UserEntity,
} from '../../src/infrastructure/database/entities';
import { InitialSchema1789894285515 } from '../../migrations/1789894285515-InitialSchema';

/**
 * T03 State Machine Integrity (Adversarial Verification — Doc 02 / Doc 05 §4).
 *
 * Beweist, dass der StateGuardService der EINZIGE Weg ist, den `status`
 * eines Items/einer Projection/eines Bundles zu ändern — jeder Versuch,
 * Zustände zu überspringen oder ein Human-Gate ohne USER-Actor zu passieren,
 * muss hart abgelehnt werden UND darf den persistierten Status nicht ändern.
 */
describe('T03 State Guard Integrity', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let guard: StateGuardService;
  let userId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [
        UserEntity,
        ItemEntity,
        ItemAttributeEntity,
        BundleEntity,
        CanonicalListingEntity,
        MarketplaceProjectionEntity,
        SaleEventEntity,
      ],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const queryRunner = dataSource.createQueryRunner();
    await new InitialSchema1789894285515().up(queryRunner);
    await queryRunner.release();

    guard = new StateGuardService(dataSource);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    const user = await dataSource.manager.save(UserEntity, { email: `t03-${Date.now()}-${Math.random()}@test.com` });
    userId = user.id;
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  async function createItem(status: ItemEntity['status'] = 'NEW') {
    return dataSource.manager.save(ItemEntity, { userId, status });
  }

  describe('T03-1 (State Jumping Bypass)', () => {
    it('rejects READY -> SOLD directly (must pass through LISTED)', async () => {
      const item = await createItem('READY');

      await expect(
        guard.transitionItem(item.id, { type: 'SALE_CONFIRMED_SINGLE', actor: { type: 'SYSTEM' } }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('READY');
    });

    it('rejects REVIEW_REQUIRED -> BUNDLED directly (must pass through READY)', async () => {
      const item = await createItem('REVIEW_REQUIRED');

      await expect(
        guard.transitionItem(item.id, { type: 'ASSIGN_TO_BUNDLE', actor: { type: 'USER' } }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('REVIEW_REQUIRED');
    });

    it('accepts the legal path NEW -> ANALYZING -> REVIEW_REQUIRED -> READY', async () => {
      const item = await createItem('NEW');

      await guard.transitionItem(item.id, { type: 'UPLOAD_PHOTO', actor: { type: 'SYSTEM' } });
      await guard.transitionItem(item.id, { type: 'AI_ANALYSIS_COMPLETE', actor: { type: 'SYSTEM' } });
      const ready = await guard.transitionItem(item.id, {
        type: 'CONFIRM_TRUTH',
        actor: { type: 'USER' },
        condition: 'good',
      });

      expect(ready.status).toBe('READY');
      expect(ready.condition).toBe('good');
    });
  });

  describe('Human-Gate Bypass (Doc 02 §10 / Doc 05 T04-1 equivalent)', () => {
    it('rejects CONFIRM_TRUTH from a WEBHOOK actor', async () => {
      const item = await createItem('REVIEW_REQUIRED');

      await expect(
        guard.transitionItem(item.id, {
          type: 'CONFIRM_TRUTH',
          actor: { type: 'WEBHOOK' },
          condition: 'good',
        }),
      ).rejects.toThrow(HumanGateBypassException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('REVIEW_REQUIRED');
    });

    it('rejects CONFIRM_TRUTH from a SYSTEM actor (AI service cannot self-confirm truth)', async () => {
      const item = await createItem('REVIEW_REQUIRED');

      await expect(
        guard.transitionItem(item.id, {
          type: 'CONFIRM_TRUTH',
          actor: { type: 'SYSTEM' },
          condition: 'good',
        }),
      ).rejects.toThrow(HumanGateBypassException);
    });

    it('rejects START_LISTING (Publish Intent) from a non-USER actor', async () => {
      const item = await createItem('READY');

      await expect(
        guard.transitionItem(item.id, { type: 'START_LISTING', actor: { type: 'SYSTEM' } }),
      ).rejects.toThrow(HumanGateBypassException);
    });

    it('never allows SALE_CONFLICT -> SOLD via WEBHOOK or SYSTEM (Invariante I2)', async () => {
      const item = await createItem('SALE_CONFLICT');

      await expect(
        guard.transitionItem(item.id, { type: 'RESOLVE_CONFLICT_SOLD', actor: { type: 'WEBHOOK' } }),
      ).rejects.toThrow(HumanGateBypassException);
      await expect(
        guard.transitionItem(item.id, { type: 'RESOLVE_CONFLICT_SOLD', actor: { type: 'SYSTEM' } }),
      ).rejects.toThrow(HumanGateBypassException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('SALE_CONFLICT');

      // Happy path control: a genuine USER actor CAN resolve the conflict.
      const resolved = await guard.transitionItem(item.id, {
        type: 'RESOLVE_CONFLICT_SOLD',
        actor: { type: 'USER' },
      });
      expect(resolved.status).toBe('SOLD');
    });

    it('rejects PUBLISH on a listing projection from a non-USER actor', async () => {
      const item = await createItem('LISTED');
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId: item.id,
        sellingPrice: 10,
        descriptionText: 'Test listing',
      });
      const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
        canonicalListingId: listing.id,
        marketplaceId: 'EBAY',
        status: 'READY',
      });

      await expect(
        guard.transitionProjection(projection.id, { type: 'PUBLISH', actor: { type: 'WEBHOOK' } }),
      ).rejects.toThrow(HumanGateBypassException);

      const reloaded = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
        id: projection.id,
      });
      expect(reloaded.status).toBe('READY');
    });
  });

  describe('CANCEL_PENDING strict resolution (Doc 05 T03-2 equivalent)', () => {
    it('rejects CONFIRM_CANCELLATION on a listing that is not in CANCEL_PENDING', async () => {
      const item = await createItem('LISTED');
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId: item.id,
        sellingPrice: 10,
        descriptionText: 'Test listing',
      });
      const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
        canonicalListingId: listing.id,
        marketplaceId: 'EBAY',
        status: 'ONLINE', // NOT CANCEL_PENDING
      });

      await expect(
        guard.transitionProjection(projection.id, {
          type: 'CONFIRM_CANCELLATION',
          actor: { type: 'USER' },
        }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const reloaded = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
        id: projection.id,
      });
      expect(reloaded.status).toBe('ONLINE');
    });

    it('allows CONFIRM_CANCELLATION from CANCEL_PENDING via USER or SYSTEM, never leaves it unresolved silently', async () => {
      const item = await createItem('LISTED');
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId: item.id,
        sellingPrice: 10,
        descriptionText: 'Test listing',
      });
      const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
        canonicalListingId: listing.id,
        marketplaceId: 'KLEINANZEIGEN',
        status: 'CANCEL_PENDING',
      });

      const result = await guard.transitionProjection(projection.id, {
        type: 'CONFIRM_CANCELLATION',
        actor: { type: 'USER' },
      });
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('ProductTruth Precondition (Doc 02 §11 / Doc 03 §4)', () => {
    it('blocks REVIEW_REQUIRED -> READY with HTTP 422 if condition is missing from the payload', async () => {
      const item = await createItem('REVIEW_REQUIRED');

      await expect(
        guard.transitionItem(item.id, { type: 'CONFIRM_TRUTH', actor: { type: 'USER' } }),
      ).rejects.toThrow(UnconfirmedConditionException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('REVIEW_REQUIRED');
      expect(reloaded.condition).toBeNull();
    });
  });

  describe('Bundle-Lock Precondition (Doc 02 §11 / Doc 05 T06-1 equivalent)', () => {
    it('blocks ASSIGN_TO_BUNDLE while the item has an active (ONLINE/PUBLISHING) listing', async () => {
      const item = await createItem('READY');
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId: item.id,
        sellingPrice: 10,
        descriptionText: 'Active listing',
      });
      await dataSource.manager.save(MarketplaceProjectionEntity, {
        canonicalListingId: listing.id,
        marketplaceId: 'EBAY',
        status: 'ONLINE',
      });

      await expect(
        guard.transitionItem(item.id, { type: 'ASSIGN_TO_BUNDLE', actor: { type: 'USER' } }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('READY');
    });

    it('allows ASSIGN_TO_BUNDLE when there are no active listings', async () => {
      const item = await createItem('READY');

      const result = await guard.transitionItem(item.id, {
        type: 'ASSIGN_TO_BUNDLE',
        actor: { type: 'USER' },
      });
      expect(result.status).toBe('BUNDLED');
    });
  });
});
