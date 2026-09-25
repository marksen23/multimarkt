import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 006_add_missing_indexes — Korrektheits-Durchsicht (September 2026).
 *
 * `canonical_listings.item_id`/`bundle_id` hatten trotz FK bislang keinen
 * Index: SaleIngestionService.loadOpenReports() joint
 * sale_events -> marketplace_projections -> canonical_listings und filtert
 * auf genau diese Spalten — jeder Sale-Conflict-Auswertungslauf (läuft bei
 * JEDEM eingehenden Sale-Webhook) erzwang einen Sequential Scan.
 *
 * `deletion_audit_logs.anonymized_user_hash`: AccountDeletionService.
 * getDeletionStatus() sucht per `findOneBy({ anonymizedUserHash })` und
 * behandelt den Hash implizit als eindeutigen Schlüssel — die Spalte hatte
 * dafür bislang weder Index noch UNIQUE-Constraint.
 */
export class AddMissingIndexes1790290000000 implements MigrationInterface {
  name = 'AddMissingIndexes1790290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX idx_canonical_listings_item ON canonical_listings(item_id) WHERE item_id IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_canonical_listings_bundle ON canonical_listings(bundle_id) WHERE bundle_id IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_deletion_audit_logs_hash ON deletion_audit_logs(anonymized_user_hash);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_deletion_audit_logs_hash;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_canonical_listings_bundle;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_canonical_listings_item;`);
  }
}
