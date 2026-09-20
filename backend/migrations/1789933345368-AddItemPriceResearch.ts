import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 002_add_item_price_research — dokumentierte Vertragserweiterung
 * (docs/README.md §9e, "Erweiterte Preis-Triangulation & Nachfrage-Signale").
 *
 * Rein beratender Preisvorschlags-Cache, KEIN ProductTruth-Attribut: hat
 * bewusst keinen `truth_state` und keine FK-Rolle für den StateGuardService.
 * Ein Item darf beliebig viele Zeilen ansammeln (eine je Quelle je Abruf) —
 * es gibt keinen UNIQUE-Constraint, damit die Preishistorie über Zeit
 * nachvollziehbar bleibt statt überschrieben zu werden.
 */
export class AddItemPriceResearch1789933345368 implements MigrationInterface {
  name = 'AddItemPriceResearch1789933345368';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE price_research_source AS ENUM (
          'EBAY_ACTIVE_LISTINGS',
          'ANKAUF_PORTAL'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE item_price_research (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          source price_research_source NOT NULL,
          median NUMERIC(10, 2),
          p25 NUMERIC(10, 2),
          p75 NUMERIC(10, 2),
          sample_size INT NOT NULL,
          currency TEXT NOT NULL DEFAULT 'EUR',
          provider_label TEXT NOT NULL,
          raw_response JSONB,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX idx_item_price_research_item ON item_price_research(item_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS item_price_research;`);
    await queryRunner.query(`DROP TYPE IF EXISTS price_research_source;`);
  }
}
