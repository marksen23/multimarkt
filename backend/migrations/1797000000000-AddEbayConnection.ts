import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Eine Zeile je Nutzer: das Refresh-Token der eBay-Verbindung (verschlüsselt)
 * und die gewählten Geschäftsrichtlinien. Die OAuth-Zustände sind Einmal-Werte
 * gegen CSRF und werden beim Callback verbraucht.
 */
export class AddEbayConnection1797000000000 implements MigrationInterface {
  name = 'AddEbayConnection1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ebay_connections (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_ciphertext text,
        refresh_token_expires_at timestamptz,
        ebay_user_id text,
        ebay_username text,
        connected_at timestamptz,
        health text NOT NULL DEFAULT 'unknown',
        health_message text,
        health_checked_at timestamptz,
        fulfillment_policy_id text,
        payment_policy_id text,
        return_policy_id text,
        pickup_fulfillment_policy_id text,
        merchant_location_key text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT check_ebay_connection_health CHECK (health IN ('unknown', 'ok', 'error'))
      );
    `);
    await queryRunner.query(`
      CREATE TABLE ebay_oauth_states (
        state_hash varchar(64) PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ebay_oauth_states;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ebay_connections;`);
  }
}
