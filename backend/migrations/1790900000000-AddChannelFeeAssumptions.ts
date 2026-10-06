import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 013_channel_fee_assumptions — Prozente und Fixkosten je Kanal
 * (Feature-Plan 3.10). Annahmen, keine Tarife. Die bestehende
 * Versandpauschale (`shipping_eur`) und die eine Gebühr der Marge
 * (`fee_percent`) bleiben.
 */
export class AddChannelFeeAssumptions1790900000000 implements MigrationInterface {
  name = 'AddChannelFeeAssumptions1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN kleinanzeigen_fee_percent numeric(5,2) NOT NULL DEFAULT 0,
        ADD COLUMN kleinanzeigen_fee_fixed_eur numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN ebay_fee_percent numeric(5,2) NOT NULL DEFAULT 11,
        ADD COLUMN ebay_fee_fixed_eur numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN vinted_fee_percent numeric(5,2) NOT NULL DEFAULT 5,
        ADD COLUMN vinted_fee_fixed_eur numeric(10,2) NOT NULL DEFAULT 0.70;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS vinted_fee_fixed_eur,
        DROP COLUMN IF EXISTS vinted_fee_percent,
        DROP COLUMN IF EXISTS ebay_fee_fixed_eur,
        DROP COLUMN IF EXISTS ebay_fee_percent,
        DROP COLUMN IF EXISTS kleinanzeigen_fee_fixed_eur,
        DROP COLUMN IF EXISTS kleinanzeigen_fee_percent;
    `);
  }
}
