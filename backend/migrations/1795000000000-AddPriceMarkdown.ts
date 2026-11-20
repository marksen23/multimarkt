import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Automatische Preissenkung: Vorgabe am Konto, Plan je Artikel,
 * Aufgaben für Portale ohne Schnittstelle, Preisverlauf.
 * Bestehende Nutzer bleiben aus (markdown_enabled default false).
 */
export class AddPriceMarkdown1795000000000 implements MigrationInterface {
  name = 'AddPriceMarkdown1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN markdown_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN markdown_percent NUMERIC(5, 2) NOT NULL DEFAULT 10,
        ADD COLUMN markdown_interval_days INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN attention_after_days INTEGER NOT NULL DEFAULT 21;
    `);
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT check_markdown_percent CHECK (markdown_percent >= 1 AND markdown_percent <= 90),
        ADD CONSTRAINT check_markdown_interval_days CHECK (markdown_interval_days >= 1 AND markdown_interval_days <= 90),
        ADD CONSTRAINT check_attention_after_days CHECK (attention_after_days >= 7 AND attention_after_days <= 180);
    `);
    await queryRunner.query(`
      CREATE TABLE item_markdown_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'INHERIT',
        percent NUMERIC(5, 2),
        interval_days INTEGER,
        floor_price NUMERIC(10, 2),
        last_applied_at TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT check_markdown_plan_status CHECK (status IN ('INHERIT', 'ACTIVE', 'PAUSED', 'STOPPED')),
        CONSTRAINT check_markdown_plan_percent CHECK (percent IS NULL OR (percent >= 1 AND percent <= 90)),
        CONSTRAINT check_markdown_plan_interval CHECK (interval_days IS NULL OR (interval_days >= 1 AND interval_days <= 90)),
        CONSTRAINT check_markdown_plan_floor CHECK (floor_price IS NULL OR floor_price > 0)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE item_price_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        canonical_listing_id UUID REFERENCES canonical_listings(id) ON DELETE SET NULL,
        previous_price NUMERIC(10, 2) NOT NULL,
        new_price NUMERIC(10, 2) NOT NULL,
        source TEXT NOT NULL,
        marketplace_id TEXT,
        note TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT check_price_history_drop CHECK (new_price < previous_price),
        CONSTRAINT check_price_history_positive CHECK (new_price > 0),
        CONSTRAINT check_price_history_source CHECK (source IN ('AUTOMATIC', 'MANUAL_CONFIRM'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_item_price_history_item
        ON item_price_history (item_id, created_at);
    `);
    await queryRunner.query(`
      CREATE TABLE markdown_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        projection_id UUID REFERENCES marketplace_projections(id) ON DELETE SET NULL,
        marketplace_id TEXT NOT NULL,
        target_price NUMERIC(10, 2) NOT NULL,
        previous_price NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        detail TEXT,
        copy_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        CONSTRAINT check_markdown_task_status CHECK (status IN ('OPEN', 'DONE', 'DISMISSED', 'SUPERSEDED')),
        CONSTRAINT check_markdown_task_kind CHECK (kind IN ('MANUAL_PRICE', 'EBAY_ERROR')),
        CONSTRAINT check_markdown_task_target CHECK (target_price > 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_markdown_tasks_user_status ON markdown_tasks (user_id, status);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_markdown_tasks_item_status ON markdown_tasks (item_id, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS markdown_tasks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS item_price_history;`);
    await queryRunner.query(`DROP TABLE IF EXISTS item_markdown_plans;`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS check_attention_after_days,
        DROP CONSTRAINT IF EXISTS check_markdown_interval_days,
        DROP CONSTRAINT IF EXISTS check_markdown_percent;
    `);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS attention_after_days,
        DROP COLUMN IF EXISTS markdown_interval_days,
        DROP COLUMN IF EXISTS markdown_percent,
        DROP COLUMN IF EXISTS markdown_enabled;
    `);
  }
}
