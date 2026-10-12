import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 007_purchase_and_margin_assumptions — Einstand am Artikel und die
 * Annahmen für die erwartete Marge (Gebühr in Prozent, Versand, Schwelle
 * für den Einzelverkauf). Feature-Plan 3.3. Kein Verkaufsabschluss.
 */
export class AddPurchaseAndMarginAssumptions1790300000000 implements MigrationInterface {
  name = 'AddPurchaseAndMarginAssumptions1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        ADD COLUMN purchase_price_eur numeric(10,2),
        ADD COLUMN purchase_portal text,
        ADD COLUMN purchase_date date,
        ADD COLUMN purchase_condition text,
        ADD COLUMN purchase_url text;
    `);
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN fee_percent numeric(5,2) NOT NULL DEFAULT 0,
        ADD COLUMN shipping_eur numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN single_sale_threshold_eur numeric(10,2);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS single_sale_threshold_eur,
        DROP COLUMN IF EXISTS shipping_eur,
        DROP COLUMN IF EXISTS fee_percent;
    `);
    await queryRunner.query(`
      ALTER TABLE items
        DROP COLUMN IF EXISTS purchase_url,
        DROP COLUMN IF EXISTS purchase_condition,
        DROP COLUMN IF EXISTS purchase_date,
        DROP COLUMN IF EXISTS purchase_portal,
        DROP COLUMN IF EXISTS purchase_price_eur;
    `);
  }
}
