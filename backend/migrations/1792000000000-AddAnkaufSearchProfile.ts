import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 015_ankauf_search_profile — PLZ und Umkreis am Nutzer, plus eine kurze
 * Historie jeder Ankauf-Suche (Feature-Plan 2.6). Der Standort ist nicht
 * mehr fest verdrahtet.
 */
export class AddAnkaufSearchProfile1792000000000 implements MigrationInterface {
  name = 'AddAnkaufSearchProfile1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN postal_code varchar(5),
        ADD COLUMN search_radius_km integer NOT NULL DEFAULT 20,
        ADD CONSTRAINT users_postal_code_check
          CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}$'),
        ADD CONSTRAINT users_search_radius_km_check
          CHECK (search_radius_km IN (5, 10, 20, 30, 50, 100, 150, 200));
    `);
    await queryRunner.query(`
      CREATE TABLE ankauf_searches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          keywords TEXT NOT NULL,
          postal_code varchar(5) NOT NULL,
          radius_km integer NOT NULL,
          location TEXT NOT NULL,
          market_median_eur numeric(10,2),
          listing_count integer NOT NULL,
          result jsonb NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ankauf_searches_postal_code_check
            CHECK (postal_code ~ '^[0-9]{5}$'),
          CONSTRAINT ankauf_searches_radius_km_check
            CHECK (radius_km IN (5, 10, 20, 30, 50, 100, 150, 200))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ankauf_searches_user_created
        ON ankauf_searches (user_id, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ankauf_searches;`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT IF EXISTS users_search_radius_km_check,
        DROP CONSTRAINT IF EXISTS users_postal_code_check,
        DROP COLUMN IF EXISTS search_radius_km,
        DROP COLUMN IF EXISTS postal_code;
    `);
  }
}
