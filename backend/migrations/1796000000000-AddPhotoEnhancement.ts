import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Zweite Datei je Foto: Original bleibt, die verbesserte Fassung ist
 * optional. Bestehende Zeilen bleiben `skipped`, damit niemand auf eine
 * Verbesserung wartet, die nie eingeplant wurde.
 */
export class AddPhotoEnhancement1796000000000 implements MigrationInterface {
  name = 'AddPhotoEnhancement1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_photos
        ADD COLUMN enhanced_url TEXT,
        ADD COLUMN enhanced_storage_key TEXT,
        ADD COLUMN enhancement_status TEXT NOT NULL DEFAULT 'skipped',
        ADD COLUMN enhancement_error TEXT,
        ADD COLUMN prefer_enhanced BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN tips JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN cover_score DOUBLE PRECISION,
        ADD COLUMN suggested_cover BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE item_photos
        DROP COLUMN IF EXISTS sort_order,
        DROP COLUMN IF EXISTS suggested_cover,
        DROP COLUMN IF EXISTS cover_score,
        DROP COLUMN IF EXISTS tips,
        DROP COLUMN IF EXISTS prefer_enhanced,
        DROP COLUMN IF EXISTS enhancement_error,
        DROP COLUMN IF EXISTS enhancement_status,
        DROP COLUMN IF EXISTS enhanced_storage_key,
        DROP COLUMN IF EXISTS enhanced_url;
    `);
  }
}
