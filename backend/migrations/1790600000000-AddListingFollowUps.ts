import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 010_listing_follow_ups — Frist ab dem Online-Gehen und das Ereignis
 * „Preis geändert“ (Feature-Plan 3.6). Der Anzeigentext bleibt unberührt.
 * Der bisherige Preis steht am Ereignis, zusammen mit dem Vermerk
 * „Preis am … gesenkt“.
 */
export class AddListingFollowUps1790600000000 implements MigrationInterface {
  name = 'AddListingFollowUps1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        ADD COLUMN online_since timestamptz;
    `);
    await queryRunner.query(`
      UPDATE marketplace_projections
      SET online_since = updated_at
      WHERE status = 'ONLINE' AND online_since IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX idx_marketplace_projections_online_since
        ON marketplace_projections (online_since)
        WHERE status = 'ONLINE';
    `);
    await queryRunner.query(`
      CREATE TABLE listing_price_changes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          canonical_listing_id UUID NOT NULL REFERENCES canonical_listings(id) ON DELETE CASCADE,
          previous_price NUMERIC(10, 2) NOT NULL,
          new_price NUMERIC(10, 2) NOT NULL,
          note TEXT NOT NULL,
          follow_up_days INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT check_price_dropped CHECK (new_price < previous_price),
          CONSTRAINT check_follow_up_days CHECK (follow_up_days IN (7, 14))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_listing_price_changes_listing
        ON listing_price_changes (canonical_listing_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS listing_price_changes;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_marketplace_projections_online_since;`,
    );
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        DROP COLUMN IF EXISTS online_since;
    `);
  }
}
