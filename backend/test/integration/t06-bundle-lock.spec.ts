import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { InvalidStateTransitionException } from '../../src/domain/errors/state-transition.errors';
import { StateGuardService } from '../../src/application/state-guard/state-guard.service';
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
 * T06 Bundle & Locking (Doc 01 §11, Doc 02 §12 Postcondition — Doc 05 §7).
 */
describe('T06 Bundle Lock Integrity', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let stateGuard: StateGuardService;
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

    stateGuard = new StateGuardService(dataSource);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    const user = await dataSource.manager.save(UserEntity, {
      email: `t06-${Date.now()}-${Math.random()}@test.com`,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  describe('T06-1 (Bundle Lock Integrity)', () => {
    it('rejects prepare-listing (START_LISTING) on an item that is already BUNDLED', async () => {
      const item = await dataSource.manager.save(ItemEntity, { userId, status: 'READY' });
      const bundle = await dataSource.manager.save(BundleEntity, {
        userId,
        title: 'Konvolut',
        status: 'NEW',
      });
      await dataSource.query('INSERT INTO bundle_items (bundle_id, item_id) VALUES ($1, $2)', [
        bundle.id,
        item.id,
      ]);
      await stateGuard.transitionItem(item.id, {
        type: 'ASSIGN_TO_BUNDLE',
        actor: { type: 'USER' },
      });

      const locked = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(locked.status).toBe('BUNDLED');

      await expect(
        stateGuard.transitionItem(item.id, { type: 'START_LISTING', actor: { type: 'USER' } }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const stillLocked = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(stillLocked.status).toBe('BUNDLED');
    });

    it('rejects assigning an item to a bundle while it has an active listing', async () => {
      const item = await dataSource.manager.save(ItemEntity, { userId, status: 'READY' });
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId,
        itemId: item.id,
        sellingPrice: 12,
        descriptionText: 'Already online',
      });
      await dataSource.manager.save(MarketplaceProjectionEntity, {
        canonicalListingId: listing.id,
        marketplaceId: 'EBAY',
        status: 'ONLINE',
      });

      await expect(
        stateGuard.transitionItem(item.id, { type: 'ASSIGN_TO_BUNDLE', actor: { type: 'USER' } }),
      ).rejects.toThrow(InvalidStateTransitionException);
    });

    it('bundle itself follows its own lifecycle (NEW -> READY -> LISTED -> SOLD)', async () => {
      const bundle = await dataSource.manager.save(BundleEntity, {
        userId,
        title: 'Kinderkleidung Konvolut',
        status: 'NEW',
      });

      const ready = await stateGuard.transitionBundle(bundle.id, {
        type: 'ITEMS_ASSIGNED',
        actor: { type: 'USER' },
      });
      expect(ready.status).toBe('READY');

      const listed = await stateGuard.transitionBundle(bundle.id, {
        type: 'START_LISTING',
        actor: { type: 'USER' },
      });
      expect(listed.status).toBe('LISTED');

      await expect(
        stateGuard.transitionBundle(bundle.id, { type: 'ITEMS_ASSIGNED', actor: { type: 'USER' } }),
      ).rejects.toThrow(InvalidStateTransitionException);

      const sold = await stateGuard.transitionBundle(bundle.id, {
        type: 'SALE_CONFIRMED',
        actor: { type: 'SYSTEM' },
      });
      expect(sold.status).toBe('SOLD');
    });
  });
});
