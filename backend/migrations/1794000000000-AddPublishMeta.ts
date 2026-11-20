import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Meta eines echten eBay-Publishs (SKU, Angebots-ID, Anzeigen-ID).
 * Bestehende Karten bleiben beim leeren Objekt — der Kopierweg ändert sich nicht.
 */
export class AddPublishMeta1794000000000 implements MigrationInterface {
  name = 'AddPublishMeta1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        ADD COLUMN IF NOT EXISTS publish_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        DROP COLUMN IF EXISTS publish_meta;
    `);
  }
}
