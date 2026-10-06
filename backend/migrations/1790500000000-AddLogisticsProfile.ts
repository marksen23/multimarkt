import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 009_logistics_profile — Gewicht, Maße, Sperrig, Abholung, Versand, PLZ
 * am Artikel (Feature-Plan 3.5). `logistics_captured` unterscheidet
 * „noch nicht gefragt“ von einem gespeicherten Profil.
 */
export class AddLogisticsProfile1790500000000 implements MigrationInterface {
  name = 'AddLogisticsProfile1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        ADD COLUMN weight_grams integer,
        ADD COLUMN length_cm numeric(6,1),
        ADD COLUMN width_cm numeric(6,1),
        ADD COLUMN height_cm numeric(6,1),
        ADD COLUMN logistics_bulky boolean NOT NULL DEFAULT false,
        ADD COLUMN pickup_only boolean NOT NULL DEFAULT false,
        ADD COLUMN shipping_possible boolean NOT NULL DEFAULT false,
        ADD COLUMN postal_code text,
        ADD COLUMN logistics_captured boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        DROP COLUMN IF EXISTS logistics_captured,
        DROP COLUMN IF EXISTS postal_code,
        DROP COLUMN IF EXISTS shipping_possible,
        DROP COLUMN IF EXISTS pickup_only,
        DROP COLUMN IF EXISTS logistics_bulky,
        DROP COLUMN IF EXISTS height_cm,
        DROP COLUMN IF EXISTS width_cm,
        DROP COLUMN IF EXISTS length_cm,
        DROP COLUMN IF EXISTS weight_grams;
    `);
  }
}
