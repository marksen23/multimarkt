import { DataSource, QueryFailedError } from 'typeorm';
import { 
  UserEntity, 
  ItemEntity, 
  ItemAttributeEntity, 
  BundleEntity, 
  CanonicalListingEntity 
} from '../../src/infrastructure/database/entities';
// Hinweis: Testcontainers Setup wird typischerweise in einer globalen Jest-Setup-Datei initialisiert
// und stellt die DB-Verbindungsumgebungsvariablen bereit.

describe('T01 Data Integrity (Adversarial Verification - Doc 01)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      // Diese Parameter kommen später dynamisch vom Testcontainer
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'resale_test',
      entities: [UserEntity, ItemEntity, ItemAttributeEntity, BundleEntity, CanonicalListingEntity],
      // STRIKTE REGEL: Kein synchronize. Wir testen gegen das echte SQL-Schema aus der Migration.
      synchronize: false, 
      logging: false,
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  afterEach(async () => {
    // Clean up nach jedem Test, um Isolation zu garantieren
    await dataSource.query(`TRUNCATE TABLE users CASCADE`);
  });

  describe('T01-1 (Bundle XOR Constraint)', () => {
    it('sollte blockieren, wenn Item UND Bundle einem Listing zugewiesen werden', async () => {
      // 1. Setup: User, Item, Bundle anlegen
      const user = await dataSource.manager.save(UserEntity, { email: 'test1@xor.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'READY' });
      const bundle = await dataSource.manager.save(BundleEntity, { userId: user.id, title: 'My Bundle', status: 'READY' });

      // 2. Test: Versuch, ein Listing mit BEIDEN IDs zu speichern
      const listing = new CanonicalListingEntity();
      listing.userId = user.id;
      listing.itemId = item.id;
      listing.bundleId = bundle.id; // ILLEGAL!
      listing.sellingPrice = 10.00;
      listing.descriptionText = 'Test';

      // 3. Assert: Muss hart auf DB-Ebene durch 'check_item_or_bundle_listing' knallen
      await expect(dataSource.manager.save(listing)).rejects.toThrow(QueryFailedError);
      await expect(dataSource.manager.save(listing)).rejects.toThrow(/check_item_or_bundle_listing/);
    });

    it('sollte ein Listing speichern, wenn NUR ein Item zugewiesen ist (Happy Path)', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test1b@xor.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'READY' });
      
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId: user.id,
        itemId: item.id,
        bundleId: null, // LEGAL
        sellingPrice: 15.00,
        descriptionText: 'Legal Item Listing'
      });

      expect(listing.id).toBeDefined();
    });
  });

  describe('T01-2 (Epistemischer DB-Schutz)', () => {
    it('sollte das Speichern eines Wertes verbieten, wenn der Status UNKNOWN ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ANALYZING' });

      // Test: Versuch, Marke 'Nike' zu speichern, aber Status auf UNKNOWN zu lassen
      const attribute = new ItemAttributeEntity();
      attribute.itemId = item.id;
      attribute.attributeKey = 'brand';
      attribute.attributeValue = 'Nike'; // ILLEGAL wenn truth_state = 'UNKNOWN'
      attribute.truthState = 'UNKNOWN';
      attribute.source = 'AI_PIPELINE';

      // Assert: DB wirft Constraint Violation 'check_unknown_value'
      await expect(dataSource.manager.save(attribute)).rejects.toThrow(QueryFailedError);
      await expect(dataSource.manager.save(attribute)).rejects.toThrow(/check_unknown_value/);
    });

    it('sollte einen leeren Wert erlauben, wenn der Status UNKNOWN ist', async () => {
      const user = await dataSource.manager.save(UserEntity, { email: 'test2b@epistemic.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ANALYZING' });

      const attribute = await dataSource.manager.save(ItemAttributeEntity, {
        itemId: item.id,
        attributeKey: 'size',
        attributeValue: null, // LEGAL
        truthState: 'UNKNOWN',
        source: 'AI_PIPELINE'
      });

      expect(attribute.id).toBeDefined();
    });
  });

  describe('T01-3 (Verified Deletion Lifecycle - DB Cascade)', () => {
    it('sollte alle Kind-Daten (Items, Listings) physisch löschen, wenn der Nutzer gelöscht wird', async () => {
      // Setup
      const user = await dataSource.manager.save(UserEntity, { email: 'delete@me.com' });
      const item = await dataSource.manager.save(ItemEntity, { userId: user.id, status: 'ARCHIVED' });
      const listing = await dataSource.manager.save(CanonicalListingEntity, {
        userId: user.id,
        itemId: item.id,
        sellingPrice: 5.0,
        descriptionText: 'To be deleted'
      });

      // Verification: Daten existieren
      expect(await dataSource.manager.count(ItemEntity, { where: { id: item.id } })).toBe(1);
      expect(await dataSource.manager.count(CanonicalListingEntity, { where: { id: listing.id } })).toBe(1);

      // Aktion: Nutzer wird gelöscht (getriggert durch den ACCOUNT_DELETED Job)
      await dataSource.manager.remove(user);

      // Assert: PostgreSQL ON DELETE CASCADE hat aufgeräumt
      expect(await dataSource.manager.count(ItemEntity, { where: { id: item.id } })).toBe(0);
      expect(await dataSource.manager.count(CanonicalListingEntity, { where: { id: listing.id } })).toBe(0);
    });
  });
});