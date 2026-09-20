import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { CapabilityCheckService } from '../../src/application/capability-check/capability-check.service';
import { MarketplacePublishingService } from '../../src/application/listing/marketplace-publishing.service';
import { StateGuardService } from '../../src/application/state-guard/state-guard.service';
import { MarketplaceAdapterRegistry } from '../../src/domain/marketplace/marketplace-adapter.interface';
import { HumanGateBypassException } from '../../src/domain/errors/state-transition.errors';
import { MockEbayAdapter } from '../../src/marketplaces/ebay/mock-ebay.adapter';
import { FormattingHelperAdapter } from '../../src/marketplaces/kleinanzeigen/formatting-helper.adapter';
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
 * T07 Marketplace Publishing (Doc 02 §5, Doc 03 §3.5/§6, Doc 01 §9).
 *
 * Beweist den Fix einer echten Sackgasse: vorher blieb jedes Listing für
 * immer in DRAFT (nichts löste MARK_READY aus) bzw. für immer in
 * PUBLISHING (nichts löste PUBLISH_SUCCESS aus).
 */
describe('T07 Marketplace Publishing', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let stateGuard: StateGuardService;
  let capabilityCheck: CapabilityCheckService;
  let adapters: MarketplaceAdapterRegistry;
  let publishing: MarketplacePublishingService;
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
    capabilityCheck = new CapabilityCheckService(dataSource);
    adapters = new Map([
      ['EBAY', new MockEbayAdapter()],
      ['KLEINANZEIGEN', new FormattingHelperAdapter()],
    ]);
    publishing = new MarketplacePublishingService(dataSource, stateGuard, capabilityCheck, adapters);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    const user = await dataSource.manager.save(UserEntity, {
      email: `t07-${Date.now()}-${Math.random()}@test.com`,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  async function setupPublishableItem() {
    const item = await dataSource.manager.save(ItemEntity, {
      userId,
      status: 'READY',
      condition: 'good',
    });
    await dataSource.manager.save(ItemAttributeEntity, {
      itemId: item.id,
      attributeKey: 'category',
      attributeValue: 'Bekleidung',
      truthState: 'USER_CONFIRMED',
      source: 'USER_INPUT',
    });
    const listing = await dataSource.manager.save(CanonicalListingEntity, {
      userId,
      itemId: item.id,
      sellingPrice: 25,
      descriptionText: 'Test listing',
    });
    return { item, listing };
  }

  it('EBAY (Live API): DRAFT reaches ONLINE automatically with a real external id', async () => {
    const { listing } = await setupPublishableItem();
    const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'EBAY',
      status: 'DRAFT',
    });

    const result = await publishing.publish(projection.id, { type: 'USER' });

    expect(result.status).toBe('ONLINE');
    expect(result.externalPlatformId).toMatch(/^ebay-mock-/);
  });

  it('KLEINANZEIGEN (Formatierungshilfe): stays in PUBLISHING with no external id until the user confirms', async () => {
    const { listing } = await setupPublishableItem();
    const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'KLEINANZEIGEN',
      status: 'DRAFT',
    });

    const afterPublish = await publishing.publish(projection.id, { type: 'USER' });
    expect(afterPublish.status).toBe('PUBLISHING');
    expect(afterPublish.externalPlatformId).toBeNull();

    const afterConfirm = await publishing.confirmPublished(projection.id, { type: 'USER' });
    expect(afterConfirm.status).toBe('ONLINE');
  });

  it('rejects publish() from a non-USER actor (Human-Gate, Doc 04 §9)', async () => {
    const { listing } = await setupPublishableItem();
    const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'EBAY',
      status: 'DRAFT',
    });

    await expect(
      publishing.publish(projection.id, { type: 'WEBHOOK' }),
    ).rejects.toThrow(HumanGateBypassException);

    const reloaded = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
      id: projection.id,
    });
    // MARK_READY (kein Gate) darf bereits gelaufen sein, PUBLISH selbst nicht.
    expect(reloaded.status).not.toBe('PUBLISHING');
    expect(reloaded.status).not.toBe('ONLINE');
  });

  it('blocks publish() with 422 while a required field has no value and no fallback (T07-1)', async () => {
    const item = await dataSource.manager.save(ItemEntity, {
      userId,
      status: 'READY',
      condition: 'good',
    });
    // Kein 'category'-Attribut gesetzt -> KLEINANZEIGEN verlangt es ohne Fallback.
    const listing = await dataSource.manager.save(CanonicalListingEntity, {
      userId,
      itemId: item.id,
      sellingPrice: 10,
      descriptionText: 'Missing category',
    });
    const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'KLEINANZEIGEN',
      status: 'DRAFT',
    });

    await expect(publishing.publish(projection.id, { type: 'USER' })).rejects.toThrow();

    const reloaded = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
      id: projection.id,
    });
    expect(reloaded.status).toBe('DRAFT');
  });

  it('confirmCancellation calls the adapter and completes for a Live-API listing', async () => {
    const { listing } = await setupPublishableItem();
    const projection = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'EBAY',
      status: 'DRAFT',
    });
    await publishing.publish(projection.id, { type: 'USER' });
    await dataSource.manager.update(
      MarketplaceProjectionEntity,
      { id: projection.id },
      { status: 'CANCEL_PENDING' },
    );

    const result = await publishing.confirmCancellation(projection.id, { type: 'USER' });
    expect(result.status).toBe('CANCELLED');
  });
});
