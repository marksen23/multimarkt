import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 003_seed_single_user — schließt eine reale Deployment-Lücke: es gab
 * bisher KEINEN Weg, die eine `users`-Zeile anzulegen, auf die
 * `APP_USER_ID` (siehe `.env.example`) zeigen muss — `ActorContextGuard`
 * setzt `actor.userId` auf diesen Wert, ohne ihn gegen die DB zu
 * validieren, und jeder `items.user_id`-Insert hätte ohne diese Zeile an
 * der FK-Constraint scheitern müssen.
 *
 * Single-User-App (Doc 01 §1: kein Multi-Tenant) — eine fest verdrahtete
 * Zeile mit einer festen, bekannten ID ist hier kein "Never silently
 * invent"-Verstoß (das Prinzip gilt für ProductTruth-Daten, nicht für
 * diese reine Infrastruktur-Bootstrap-Zeile). Die ID ist bewusst dieselbe
 * wie der Platzhalter in `.env.example` (`APP_USER_ID`), damit
 * Migration und Konfiguration ohne manuellen Zwischenschritt zusammenpassen.
 */
const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000000';
const SINGLE_USER_EMAIL = 'marksen23@gmail.com';

export class SeedSingleUser1789937024784 implements MigrationInterface {
  name = 'SeedSingleUser1789937024784';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;`,
      [SINGLE_USER_ID, SINGLE_USER_EMAIL],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM users WHERE id = $1;`, [SINGLE_USER_ID]);
  }
}
