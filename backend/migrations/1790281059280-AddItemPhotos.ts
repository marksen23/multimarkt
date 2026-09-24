import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 005_add_item_photos — schließt eine echte Lücke: hochgeladene Fotos
 * wurden bisher nur transient für den KI-Analyse-Call verwendet und
 * danach nirgends mit dem Item verknüpft — keine Möglichkeit, sie später
 * wieder anzusehen ("Fotogalerie pro Artikel", September 2026).
 *
 * `storage_key` (nicht nur `url`) wird mitgespeichert, weil ein künftiger
 * Hard-Delete-Job (siehe AccountDeletionService-Doku: S3-Garbage-Collector
 * noch nicht gebaut) genau diesen Schlüssel für `StorageProvider.delete()`
 * braucht, nicht die öffentliche URL.
 */
export class AddItemPhotos1790281059280 implements MigrationInterface {
  name = 'AddItemPhotos1790281059280';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE item_photos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          storage_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_item_photos_item ON item_photos(item_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS item_photos;`);
  }
}
