import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  planFreeTextAttributeMigration,
  StoredAttribute,
} from '../src/domain/category/attribute-migration';

/**
 * 012_map_category_attributes — Freitext-Attribute auf die kleine
 * Taxonomie (Feature-Plan 3.9). Kein Schemawechsel: Schlüssel und
 * Kategorie-Werte werden umgeschrieben, der alte Wortlaut bleibt in
 * categoryDetail. down() stellt den Freitext nicht wieder her.
 */
export class MapCategoryAttributes1790800000000 implements MigrationInterface {
  name = 'MapCategoryAttributes1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT
        id,
        item_id AS "itemId",
        attribute_key AS "attributeKey",
        attribute_value AS "attributeValue",
        truth_state AS "truthState",
        source
      FROM item_attributes
    `)) as StoredAttribute[];

    const ops = planFreeTextAttributeMigration(rows);

    for (const op of ops) {
      if (op.op !== 'delete') continue;
      await queryRunner.query(`DELETE FROM item_attributes WHERE id = $1`, [op.id]);
    }
    for (const op of ops) {
      if (op.op !== 'update') continue;
      await queryRunner.query(
        `UPDATE item_attributes
            SET attribute_key = $2, attribute_value = $3, truth_state = $4
          WHERE id = $1`,
        [op.id, op.attributeKey, op.attributeValue, op.truthState],
      );
    }
    for (const op of ops) {
      if (op.op !== 'insert') continue;
      await queryRunner.query(
        `INSERT INTO item_attributes (item_id, attribute_key, attribute_value, truth_state, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [op.itemId, op.attributeKey, op.attributeValue, op.truthState, op.source],
      );
    }
  }

  public async down(): Promise<void> {
    // Der alte Freitext liegt in categoryDetail. Ihn zurück in category
    // zu schieben würde bestätigte Taxonomie-Werte überschreiben.
  }
}
