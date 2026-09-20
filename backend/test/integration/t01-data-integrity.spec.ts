import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  UserEntity,
} from '../../src/infrastructure/database/entities';
import { InitialSchema1789894285515 } from '../../migrations/1789894285515-InitialSchema';

/**
 * T01 Data Integrity (Adversarial Verification — Doc 01 / Doc 05 §2).
 *
 * Beweist, dass die Postgres-Constraints selbst — nicht Anwendungscode — die
 * unterste Verteidigungslinie für die Kern-Invarianten sind. Läuft gegen
 * einen echten Postgres-Container (Testcontainers), nicht gegen eine Mock-DB,
 * weil genau das Verhalten von CHECK/UNIQUE/CASCADE geprüft werden soll, das
 * `synchronize: true` oder eine In-Memory-DB nicht ehrlich abbilden würden.
 */
describe('T01 Data Integrity', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [UserEntity, ItemEntity, ItemAttributeEntity, BundleEntity, CanonicalListingEntity],
      // STRIKTE REGEL: kein synchronize. Wir testen gegen das echte,
      // handgeschriebene SQL-Schema aus der Migration.
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    // Migration direkt über die Klasse ausführen (nicht über TypeORMs
    // Datei-Glob-Runner), damit der Test unabhängig davon bleibt, wie Jest
    // .ts-Dateien zur Laufzeit auflöst.
    const queryRunner = dataSource.createQueryRunner();
    await new InitialSchema1789894285515().up(queryRunner);
    await queryRunner.release();
  }, 120_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (container) {
      await container.stop();
    }
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE users CASCADE');
  });

  describe('T01-1 (Bundle XOR Constraint)', () => {
    it('blockiert, wenn Item UND Bundle demselben Listing zugewiesen werden', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test1@xor.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'READY' });
      const bundle = await dataSource.manager.save(BundleEntity, {
        userId: user.id,
        title: 'My Bundle',
        status: 'READY',
      });

      const listing = new CanonicalListingEntity();
      listing.userId = user.id;
      listing.itemId = item.id;
      listing.bundleId = bundle.id; // ILLEGAL!
      listing.sellingPrice = 10.0;
      listing.descriptionText = 'Test';

      await expect(dataSource.manager.save(listing)).rejects.toThrow(QueryFailedError);
      await expect(dataSource.manager.save(listing)).rejects.toThrow(/check_item_or_bundle_listing/);
    });

    it('speichert ein Listing, wenn NUR ein Item zugewiesen ist (Happy Path)', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test1b@xor.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'READY' });

      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId: user.id,
        itemId: item.id,
        bundleId: null,
        sellingPrice: 15.0,
        descriptionText: 'Legal Item Listing',
      });

      expect(listing.id).toBeDefined();
    });

    it('speichert ein Listing, wenn NUR ein Bundle zugewiesen ist (Happy Path)', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test1c@xor.com' });
      const bundle = await dataSource.manager.save(BundleEntity, {
        userId: user.id,
        title: 'Bundle only',
        status: 'READY',
      });

      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId: user.id,
        itemId: null,
        bundleId: bundle.id,
        sellingPrice: 25.0,
        descriptionText: 'Legal Bundle Listing',
      });

      expect(listing.id).toBeDefined();
    });

    it('blockiert, wenn WEDER Item NOCH Bundle zugewiesen ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test1d@xor.com' });

      const listing = new CanonicalListingEntity();
      listing.userId = user.id;
      listing.itemId = null;
      listing.bundleId = null;
      listing.sellingPrice = 5.0;
      listing.descriptionText = 'Illegal: neither';

      await expect(dataSource.manager.save(listing)).rejects.toThrow(/check_item_or_bundle_listing/);
    });
  });

  describe('T01-2 (Epistemischer DB-Schutz)', () => {
    it('verbietet das Speichern eines Werts, wenn truth_state UNKNOWN ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ANALYZING' });

      const attribute = new ItemAttributeEntity();
      attribute.itemId = item.id;
      attribute.attributeKey = 'brand';
      attribute.attributeValue = 'Nike'; // ILLEGAL bei truth_state = 'UNKNOWN'
      attribute.truthState = 'UNKNOWN';
      attribute.source = 'AI_PIPELINE';

      await expect(dataSource.manager.save(attribute)).rejects.toThrow(QueryFailedError);
      await expect(dataSource.manager.save(attribute)).rejects.toThrow(/check_unknown_value/);
    });

    it('erlaubt einen leeren Wert, wenn truth_state UNKNOWN ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2b@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ANALYZING' });

      const attribute = await dataSource.manager.save(ItemAttributeEntity, {
        itemId: item.id,
        attributeKey: 'size',
        attributeValue: null,
        truthState: 'UNKNOWN',
        source: 'AI_PIPELINE',
      });

      expect(attribute.id).toBeDefined();
    });

    it('verbietet einen NULL-Wert, wenn truth_state != UNKNOWN ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2c@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ANALYZING' });

      const attribute = new ItemAttributeEntity();
      attribute.itemId = item.id;
      attribute.attributeKey = 'color';
      attribute.attributeValue = null; // ILLEGAL bei truth_state = 'INFERRED'
      attribute.truthState = 'INFERRED';
      attribute.source = 'GEMINI_VISION';

      await expect(dataSource.manager.save(attribute)).rejects.toThrow(/check_unknown_value/);
    });

    it('erlaubt USER_CONFIRMED mit gefülltem Wert (Happy Path)', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2d@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'REVIEW_REQUIRED' });

      const attribute = await dataSource.manager.save(ItemAttributeEntity, {
        itemId: item.id,
        attributeKey: 'condition',
        attributeValue: 'good',
        truthState: 'USER_CONFIRMED',
        source: 'USER_INPUT',
      });

      expect(attribute.id).toBeDefined();
    });
  });

  describe('T01-3 (Hard-Delete Kaskade)', () => {
    it('löscht alle Kind-Daten physisch, wenn der User gelöscht wird', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'delete@me.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ARCHIVED' });
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId: user.id,
        itemId: item.id,
        sellingPrice: 5.0,
        descriptionText: 'To be deleted',
      });

      expect(await dataSource.manager.count(ItemEntity, { where: { id: item.id } })).toBe(1);
      expect(await dataSource.manager.count(CanonicalListingEntity, { where: { id: listing.id } })).toBe(1);

      await dataSource.manager.remove(user);

      expect(await dataSource.manager.count(ItemEntity, { where: { id: item.id } })).toBe(0);
      expect(await dataSource.manager.count(CanonicalListingEntity, { where: { id: listing.id } })).toBe(0);
    });

    it('verhindert das Löschen eines Items, solange es einem Bundle zugeordnet ist (ON DELETE RESTRICT)', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'restrict@me.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'BUNDLED' });
      const bundle = await dataSource.manager.save(BundleEntity, {
        userId: user.id,
        title: 'Restrict-Test',
        status: 'READY',
      });
      await dataSource.query(
        'INSERT INTO bundle_items (bundle_id, item_id) VALUES ($1, $2)',
        [bundle.id, item.id],
      );

      await expect(dataSource.query('DELETE FROM items WHERE id = $1', [item.id])).rejects.toThrow();
    });
  });
});
