import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 011_bundle_suggestion_dismissals — verworfene Paketvorschläge
 * (Feature-Plan 3.8). Das Paket selbst bleibt die bestehende
 * bundles/bundle_items-Struktur.
 */
export class AddBundleSuggestionDismissals1790700000000 implements MigrationInterface {
  name = 'AddBundleSuggestionDismissals1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bundle_suggestion_dismissals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          fingerprint TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_bundle_suggestion_dismissal UNIQUE (user_id, fingerprint)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_bundle_suggestion_dismissals_user
        ON bundle_suggestion_dismissals (user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS bundle_suggestion_dismissals;`,
    );
  }
}
