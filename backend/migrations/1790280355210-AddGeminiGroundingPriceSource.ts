import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 004_add_gemini_grounding_price_source — erweitert das
 * `price_research_source`-Enum (docs/README.md §9e) um eine dritte Quelle:
 * Gemini + Google Search Grounding, zusätzlich zu eBay-Angeboten und
 * Ankaufportal-Anker (nie als Ersatz, siehe §9e-Diskussion).
 *
 * Postgres-Hinweis: `ALTER TYPE ... ADD VALUE` kann nicht innerhalb
 * derselben Transaktion rückgängig gemacht werden — TypeORM führt
 * Migrationen standardmäßig in einer Transaktion aus, das ist hier
 * bewusst unkritisch, weil nichts anderes in dieser Migration passiert.
 */
export class AddGeminiGroundingPriceSource1790280355210 implements MigrationInterface {
  name = 'AddGeminiGroundingPriceSource1790280355210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE price_research_source ADD VALUE 'GEMINI_GROUNDING';`);
  }

  public async down(): Promise<void> {
    // Postgres unterstützt kein DROP VALUE für Enums — ein Downgrade
    // müsste den Typ komplett neu anlegen. Für diese additive, rein
    // erweiternde Änderung bewusst nicht automatisiert (kein Datenverlust-
    // Risiko, da der Wert einfach ungenutzt bliebe).
  }
}
