import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 008_sale_closeout — erfasster Verkauf am Artikel (Feature-Plan 3.4).
 * Erlös, Portal, Gebühren, Versand, optionaler Zahlungsweg und der
 * Nettogewinn gegen den Einstand zum Zeitpunkt des Abschlusses.
 * Kein Buchhaltungskonto, nur die eine Zeile pro Artikel.
 */
export class AddSaleCloseout1790400000000 implements MigrationInterface {
  name = 'AddSaleCloseout1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        ADD COLUMN sale_proceeds_eur numeric(10,2),
        ADD COLUMN sale_portal text,
        ADD COLUMN sale_fee_eur numeric(10,2),
        ADD COLUMN sale_shipping_eur numeric(10,2),
        ADD COLUMN sale_payment_method text,
        ADD COLUMN sale_purchase_price_eur numeric(10,2),
        ADD COLUMN sale_net_profit_eur numeric(10,2),
        ADD COLUMN sold_at timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        DROP COLUMN IF EXISTS sold_at,
        DROP COLUMN IF EXISTS sale_net_profit_eur,
        DROP COLUMN IF EXISTS sale_purchase_price_eur,
        DROP COLUMN IF EXISTS sale_payment_method,
        DROP COLUMN IF EXISTS sale_shipping_eur,
        DROP COLUMN IF EXISTS sale_fee_eur,
        DROP COLUMN IF EXISTS sale_portal,
        DROP COLUMN IF EXISTS sale_proceeds_eur;
    `);
  }
}
