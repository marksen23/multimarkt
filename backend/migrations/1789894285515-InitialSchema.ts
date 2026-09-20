import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 001_initial_schema — wörtliche Übernahme des eingefrorenen Architekturvertrags
 * (Doc 01, finale Fassung `docs/initiale_datenbankmigration.sql`).
 *
 * Diese Migration ist die einzige Quelle der Wahrheit für das DB-Schema.
 * TypeORM `synchronize` ist global deaktiviert (siehe database.module.ts) —
 * jede Schema-Änderung läuft ausschließlich über eine neue, handgeschriebene
 * SQL-Migration wie diese.
 */
export class InitialSchema1789894285515 implements MigrationInterface {
  name = 'InitialSchema1789894285515';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE item_lifecycle_state AS ENUM (
          'NEW',
          'ANALYZING',
          'REVIEW_REQUIRED',
          'READY',
          'BUNDLED',
          'LISTED',
          'SOLD',
          'ARCHIVED',
          'SALE_CONFLICT',
          'CANCELLED'
      );
    `);

    // Eigenes Enum für Bundles gemäß Doc 02 §6 (schmalerer Lifecycle als Items).
    await queryRunner.query(`
      CREATE TYPE bundle_lifecycle_state AS ENUM (
          'NEW',
          'READY',
          'LISTED',
          'SOLD',
          'CANCELLED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE truth_state AS ENUM (
          'UNKNOWN',
          'INFERRED',
          'USER_CONFIRMED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE projection_lifecycle_state AS ENUM (
          'DRAFT',
          'READY',
          'PUBLISHING',
          'ONLINE',
          'CANCEL_PENDING',
          'CANCELLED',
          'SOLD'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status item_lifecycle_state NOT NULL DEFAULT 'NEW',
          title TEXT,
          condition TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE item_attributes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          attribute_key TEXT NOT NULL,
          attribute_value TEXT,
          truth_state truth_state NOT NULL DEFAULT 'UNKNOWN',
          source TEXT NOT NULL,
          -- INVARIANTE: Epistemischer DB-Schutz (T01-2) — "Never silently invent"
          CONSTRAINT check_unknown_value CHECK (
              (truth_state = 'UNKNOWN' AND attribute_value IS NULL) OR
              (truth_state != 'UNKNOWN' AND attribute_value IS NOT NULL)
          ),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (item_id, attribute_key)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE bundles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          status bundle_lifecycle_state NOT NULL DEFAULT 'NEW',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE bundle_items (
          bundle_id UUID NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
          item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
          PRIMARY KEY (bundle_id, item_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE canonical_listings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_id UUID REFERENCES items(id) ON DELETE CASCADE,
          bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
          selling_price NUMERIC(10, 2) NOT NULL,
          description_text TEXT NOT NULL,
          -- INVARIANTE: Bundle XOR Constraint (T01-1)
          CONSTRAINT check_item_or_bundle_listing CHECK (
              (item_id IS NOT NULL AND bundle_id IS NULL) OR
              (item_id IS NULL AND bundle_id IS NOT NULL)
          ),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE marketplace_projections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          canonical_listing_id UUID NOT NULL REFERENCES canonical_listings(id) ON DELETE CASCADE,
          marketplace_id TEXT NOT NULL,
          status projection_lifecycle_state NOT NULL DEFAULT 'DRAFT',
          external_platform_id TEXT,
          fallback_data JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (canonical_listing_id, marketplace_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE sale_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          projection_id UUID NOT NULL REFERENCES marketplace_projections(id) ON DELETE CASCADE,
          external_event_id TEXT NOT NULL,
          reported_price NUMERIC(10, 2) NOT NULL,
          is_winner BOOLEAN,
          cancellation_confirmed BOOLEAN NOT NULL DEFAULT false,
          reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          -- INVARIANTE: Idempotenz für Webhook-Replays (Doc 03 §12/§13)
          UNIQUE (projection_id, external_event_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE deletion_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          anonymized_user_hash TEXT NOT NULL,
          media_hard_deleted BOOLEAN NOT NULL DEFAULT false,
          db_records_deleted BOOLEAN NOT NULL DEFAULT false,
          deletion_completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX idx_item_attributes_item ON item_attributes(item_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_marketplace_projections_canonical ON marketplace_projections(canonical_listing_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS deletion_audit_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sale_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_projections;`);
    await queryRunner.query(`DROP TABLE IF EXISTS canonical_listings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS bundle_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS bundles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS item_attributes;`);
    await queryRunner.query(`DROP TABLE IF EXISTS items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
    await queryRunner.query(`DROP TYPE IF EXISTS projection_lifecycle_state;`);
    await queryRunner.query(`DROP TYPE IF EXISTS truth_state;`);
    await queryRunner.query(`DROP TYPE IF EXISTS bundle_lifecycle_state;`);
    await queryRunner.query(`DROP TYPE IF EXISTS item_lifecycle_state;`);
  }
}
