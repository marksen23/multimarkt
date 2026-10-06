import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kanal-Karten: eigener Titel, Text und Preisvorschlag je Projektion,
 * plus der Status `COPIED` („kopiert“) zwischen Entwurf und online.
 *
 * `ADD VALUE` wird hier nicht im selben Schritt benutzt. Ab Postgres 12
 * darf der neue Enum-Wert in derselben Transaktion angelegt werden.
 */
export class AddChannelCards1790300000000 implements MigrationInterface {
  name = 'AddChannelCards1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE projection_lifecycle_state ADD VALUE IF NOT EXISTS 'COPIED';
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        ADD COLUMN IF NOT EXISTS title TEXT,
        ADD COLUMN IF NOT EXISTS description_text TEXT,
        ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(10, 2);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_projections
        DROP COLUMN IF EXISTS suggested_price,
        DROP COLUMN IF EXISTS description_text,
        DROP COLUMN IF EXISTS title;
    `);
    // Postgres kann einen Enum-Wert nicht zuverlässig entfernen, solange
    // der Typ noch gebunden ist. Der Down-Pfad lässt 'COPIED' stehen.
  }
}
