import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { SaleIngestionService } from '../../src/application/sale-conflict/sale-ingestion.service';
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
 * T05 Concurrency / Race-Condition / SALE_CONFLICT (Doc 03 §9 — Doc 05 §6).
 */
describe('T05 Concurrency & SALE_CONFLICT', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let stateGuard: StateGuardService;
  let saleIngestion: SaleIngestionService;
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
    saleIngestion = new SaleIngestionService(dataSource, stateGuard);
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    const user = await dataSource.manager.save(UserEntity, {
      email: `t05-${Date.now()}-${Math.random()}@test.com`,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  async function setupListedItemWithTwoProjections() {
    const item = await dataSource.manager.save(ItemEntity, { userId, status: 'LISTED' });
    const listing = await dataSource.manager.save(CanonicalListingEntity, {
      userId,
      itemId: item.id,
      sellingPrice: 50,
      descriptionText: 'Cross-listed item',
    });
    const ebay = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'EBAY',
      status: 'ONLINE',
    });
    const kleinanzeigen = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'KLEINANZEIGEN',
      status: 'ONLINE',
    });
    return { item, listing, ebay, kleinanzeigen };
  }

  describe('T05-1 (The Webhook Clash - Atomic Sale Conflict)', () => {
    it('never lets two near-simultaneous reports both resolve to SOLD — final state is SALE_CONFLICT', async () => {
      const { item, ebay, kleinanzeigen } = await setupListedItemWithTwoProjections();

      // Zwei "exakt gleichzeitige" Webhook-Reports (Doc 05 T05-1) — parallel
      // ausgeführt, um die reine Insert-Phase unter echter Nebenläufigkeit
      // zu testen.
      const [ebayOutcome, kaOutcome] = await Promise.all([
        saleIngestion.reportSale({
          projectionId: ebay.id,
          externalEventId: 'ebay-evt-1',
          reportedPrice: 48,
        }),
        saleIngestion.reportSale({
          projectionId: kleinanzeigen.id,
          externalEventId: 'ka-evt-1',
          reportedPrice: 50,
        }),
      ]);
      expect(ebayOutcome).toBe('RECORDED');
      expect(kaOutcome).toBe('RECORDED');

      // Item darf durch reportSale() allein NICHT bereits auf SOLD stehen —
      // die Entscheidung ist bewusst entkoppelt (siehe Service-Doku).
      const beforeEvaluation = await dataSource.manager.findOneByOrFail(ItemEntity, {
        id: item.id,
      });
      expect(beforeEvaluation.status).toBe('LISTED');

      // Debounce-Fenster simuliert: EIN Auswertungslauf, nachdem beide
      // Reports gelandet sind.
      const outcome = await saleIngestion.evaluateItemSaleOutcome(item.id);
      expect(outcome).toBe('CONFLICT');

      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('SALE_CONFLICT');

      // Doc 02 Invariante I4: SOLD (oder hier: kein Item ist SOLD) darf
      // keine aktiven Listings mit widersprüchlichem Zustand hinterlassen —
      // beide Sale-Events bleiben bewusst unentschieden (isWinner NULL) bis
      // zur menschlichen Konfliktauflösung.
      const events = await dataSource.manager.find(SaleEventEntity, {
        where: { projectionId: ebay.id },
      });
      expect(events[0].isWinner).toBeNull();
    });

    it('resolves a genuinely solitary report directly to SOLD', async () => {
      const { item, ebay } = await setupListedItemWithTwoProjections();

      await saleIngestion.reportSale({
        projectionId: ebay.id,
        externalEventId: 'ebay-solo-evt',
        reportedPrice: 48,
      });
      const outcome = await saleIngestion.evaluateItemSaleOutcome(item.id);

      expect(outcome).toBe('SOLD');
      const reloaded = await dataSource.manager.findOneByOrFail(ItemEntity, { id: item.id });
      expect(reloaded.status).toBe('SOLD');

      const projection = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
        id: ebay.id,
      });
      expect(projection.status).toBe('SOLD');
    });

    it('a second evaluation run after resolution is a safe no-op (idempotent evaluator)', async () => {
      const { item, ebay } = await setupListedItemWithTwoProjections();
      await saleIngestion.reportSale({
        projectionId: ebay.id,
        externalEventId: 'ebay-solo-evt-2',
        reportedPrice: 48,
      });
      await saleIngestion.evaluateItemSaleOutcome(item.id);

      const secondRun = await saleIngestion.evaluateItemSaleOutcome(item.id);
      expect(secondRun).toBe('ALREADY_RESOLVED');
    });
  });

  async function setupListedBundleWithTwoProjections() {
    const bundle = await dataSource.manager.save(BundleEntity, {
      userId,
      title: 'Bundle Konvolut',
      status: 'LISTED',
    });
    const listing = await dataSource.manager.save(CanonicalListingEntity, {
      userId,
      bundleId: bundle.id,
      sellingPrice: 30,
      descriptionText: 'Cross-listed bundle',
    });
    const ebay = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'EBAY',
      status: 'ONLINE',
    });
    const kleinanzeigen = await dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: listing.id,
      marketplaceId: 'KLEINANZEIGEN',
      status: 'ONLINE',
    });
    return { bundle, listing, ebay, kleinanzeigen };
  }

  describe('Bundle Sale Evaluation (fixes a real bug: webhook reports for bundle listings were silently never evaluated)', () => {
    it('resolves a solitary bundle sale report to SOLD', async () => {
      const { bundle, ebay } = await setupListedBundleWithTwoProjections();

      await saleIngestion.reportSale({
        projectionId: ebay.id,
        externalEventId: 'bundle-solo-evt',
        reportedPrice: 28,
      });
      const outcome = await saleIngestion.evaluateBundleSaleOutcome(bundle.id);

      expect(outcome).toBe('SOLD');
      const reloaded = await dataSource.manager.findOneByOrFail(BundleEntity, { id: bundle.id });
      expect(reloaded.status).toBe('SOLD');

      const projection = await dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
        id: ebay.id,
      });
      expect(projection.status).toBe('SOLD');
    });

    it('never invents a SALE_CONFLICT state for bundles (schema gap: bundle_lifecycle_state has no such value) — bundle stays LISTED, reports stay unresolved', async () => {
      const { bundle, ebay, kleinanzeigen } = await setupListedBundleWithTwoProjections();

      await saleIngestion.reportSale({
        projectionId: ebay.id,
        externalEventId: 'bundle-evt-1',
        reportedPrice: 28,
      });
      await saleIngestion.reportSale({
        projectionId: kleinanzeigen.id,
        externalEventId: 'bundle-evt-2',
        reportedPrice: 30,
      });

      const outcome = await saleIngestion.evaluateBundleSaleOutcome(bundle.id);
      expect(outcome).toBe('CONFLICT_UNSUPPORTED_FOR_BUNDLE');

      const reloaded = await dataSource.manager.findOneByOrFail(BundleEntity, { id: bundle.id });
      expect(reloaded.status).toBe('LISTED');

      const events = await dataSource.manager.find(SaleEventEntity, {
        where: { projectionId: ebay.id },
      });
      expect(events[0].isWinner).toBeNull();
    });
  });

  describe('T05-2 (Idempotency / Replay Attack)', () => {
    it('ignores a webhook replayed three times and never triggers repeated business logic', async () => {
      const { item, ebay } = await setupListedItemWithTwoProjections();
      const payload = { projectionId: ebay.id, externalEventId: 'replayed-evt', reportedPrice: 48 };

      const first = await saleIngestion.reportSale(payload);
      const second = await saleIngestion.reportSale(payload);
      const third = await saleIngestion.reportSale(payload);

      expect(first).toBe('RECORDED');
      expect(second).toBe('IGNORED_DUPLICATE');
      expect(third).toBe('IGNORED_DUPLICATE');

      const rows = await dataSource.manager.findBy(SaleEventEntity, {
        projectionId: ebay.id,
        externalEventId: 'replayed-evt',
      });
      expect(rows).toHaveLength(1);

      const outcome = await saleIngestion.evaluateItemSaleOutcome(item.id);
      expect(outcome).toBe('SOLD');
    });
  });
});
