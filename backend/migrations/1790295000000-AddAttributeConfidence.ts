import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 007_add_attribute_confidence — Adaptive Human-in-the-Loop (T09).
 *
 * Speichert den Confidence-Score (0..1) aus der KI-Analyse pro Attribut,
 * damit der ProductAnalysisService hochkonfidente Attribute (≥ 0.85)
 * direkt als USER_CONFIRMED markieren kann — ohne menschliche Intervention.
 * Nur `condition` bleibt immer INFERRED, da die CONFIRM_TRUTH-Transition
 * eine menschliche Entscheidung ist (Doc 02 §10, Human-Gate).
 *
 * NULL = vor dieser Migration erzeugte Attribute (kein Score bekannt).
 */
export class AddAttributeConfidence1790295000000 implements MigrationInterface {
  name = 'AddAttributeConfidence1790295000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE item_attributes ADD COLUMN confidence FLOAT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE item_attributes DROP COLUMN IF EXISTS confidence;`,
    );
  }
}
