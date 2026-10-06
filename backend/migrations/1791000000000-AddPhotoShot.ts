import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 014_photo_shot — welche Aufnahme ein Foto ist (Gesamtes Stück, Etikett,
 * Sohle, Defekt, Zubehör). Leer heißt: noch nicht zugeordnet. Die Spalte
 * ist ein Hinweis fürs Foto-Briefing und kein Pflichtfeld.
 */
export class AddPhotoShot1791000000000 implements MigrationInterface {
  name = 'AddPhotoShot1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE item_photos ADD COLUMN shot TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE item_photos DROP COLUMN IF EXISTS shot;`);
  }
}
