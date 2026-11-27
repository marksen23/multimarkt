import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verkaufstag, Käufer und Notiz am Artikel.
 * Der Tag ist das Buchungsdatum. `sold_at` bleibt der Zeitpunkt.
 * Bestehende Zeilen behalten NULL und fallen in der Auswertung
 * auf den Berlin-Tag von `sold_at` zurück.
 */
export class AddSaleBookkeeping1797000000000 implements MigrationInterface {
  name = 'AddSaleBookkeeping1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        ADD COLUMN sale_date date,
        ADD COLUMN sale_buyer text,
        ADD COLUMN sale_notes text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE items
        DROP COLUMN IF EXISTS sale_notes,
        DROP COLUMN IF EXISTS sale_buyer,
        DROP COLUMN IF EXISTS sale_date;
    `);
  }
}
