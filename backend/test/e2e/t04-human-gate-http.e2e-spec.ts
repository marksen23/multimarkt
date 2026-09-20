import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InitialSchema1789894285515 } from '../../migrations/1789894285515-InitialSchema';
import { DomainExceptionFilter } from '../../src/api/filters/domain-exception.filter';

// Statischer Import ist hier sicher: `data-source.ts` liest `process.env`
// erst innerhalb von `buildDataSourceOptions()`, aufgerufen zur
// DI-Resolution-Zeit (`Test.createTestingModule(...).compile()`), NICHT
// beim Modul-Import — siehe Kommentar dort.
import { AppModule } from '../../src/app.module';

/**
 * T04 Human-Gate & Authority Tests — HTTP-Ebene (Doc 03/Doc 04 — Doc 05 §5).
 *
 * Andere Testdateien (T02/T03/T05/T06) beweisen die Invarianten direkt am
 * Service. Diese Datei beweist zusätzlich, dass die HTTP-Schicht
 * (ActorContextGuard + Controller + DomainExceptionFilter) dieselben
 * Ergebnisse korrekt als HTTP-Statuscodes nach außen trägt — insbesondere,
 * dass ein WEBHOOK- oder SYSTEM-Actor an einem Human-Gate-Endpoint mit
 * echtem HTTP 403 abgewiesen wird (T04-1), nicht nur intern als Exception.
 */
describe('T04 Human-Gate Authority (HTTP)', () => {
  const APP_USER_ID = randomUUID();
  const APP_ACCESS_TOKEN = 'test-access-token';
  const INTERNAL_SERVICE_TOKEN = 'test-internal-token';

  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let itemId: string;

  // Jest führt Testdateien unter `--runInBand` sequentiell im SELBEN
  // Node-Prozess aus — `process.env`-Mutationen sind NICHT automatisch pro
  // Datei isoliert (anders als Jests Modul-Registry). Ohne Restore würde
  // z.B. app.e2e-spec.ts, falls nach dieser Datei ausgeführt, versuchen,
  // sich mit dem hier bereits gestoppten Testcontainer zu verbinden.
  const envSnapshot: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    'DATABASE_URL',
    'DB_SSL',
    'REDIS_URL',
    'APP_USER_ID',
    'APP_ACCESS_TOKEN',
    'INTERNAL_SERVICE_TOKEN',
    'NODE_ENV',
  ] as const;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];

    // WICHTIG: vor jedem Import/Compile von AppModule setzen —
    // `buildDataSourceOptions()` liest `process.env` erst zur
    // DI-Resolution-Zeit (siehe data-source.ts), nicht beim Modul-Import.
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.DB_SSL = 'false';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.APP_USER_ID = APP_USER_ID;
    process.env.APP_ACCESS_TOKEN = APP_ACCESS_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = INTERNAL_SERVICE_TOKEN;
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const queryRunner = dataSource.createQueryRunner();
    await new InitialSchema1789894285515().up(queryRunner);
    await queryRunner.release();

    await dataSource.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      APP_USER_ID,
      'e2e-user@test.com',
    ]);
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
    for (const key of ENV_KEYS) {
      if (envSnapshot[key] === undefined) delete process.env[key];
      else process.env[key] = envSnapshot[key];
    }
  });

  beforeEach(async () => {
    const result = await dataSource.query(
      "INSERT INTO items (user_id, status) VALUES ($1, 'REVIEW_REQUIRED') RETURNING id",
      [APP_USER_ID],
    );
    itemId = result[0].id;
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM items');
  });

  function userAuthHeader() {
    return { Authorization: `Bearer ${APP_ACCESS_TOKEN}` };
  }

  function systemAuthHeader() {
    return { Authorization: `Bearer internal:${INTERNAL_SERVICE_TOKEN}` };
  }

  function webhookAuthHeader() {
    return { 'X-Webhook-Signature': 'sha256=deadbeef' };
  }

  it('rejects requests with no credentials at all (401)', async () => {
    const res = await request(app.getHttpServer()).post(`/items/${itemId}/confirm-truth`).send({
      condition: 'good',
    });
    expect(res.status).toBe(401);
  });

  it('T04-1: rejects a WEBHOOK actor calling the human-gated confirm-truth endpoint (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/confirm-truth`)
      .set(webhookAuthHeader())
      .send({ condition: 'good' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('ERR_HUMAN_GATE_BYPASS');
  });

  it('T04-1 (variant): rejects a SYSTEM actor (internal service token) calling confirm-truth (403)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/confirm-truth`)
      .set(systemAuthHeader())
      .send({ condition: 'good' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('ERR_HUMAN_GATE_BYPASS');
  });

  it('T04-1 (resolve-conflict): rejects a WEBHOOK actor calling resolve-conflict (403)', async () => {
    await dataSource.query("UPDATE items SET status = 'SALE_CONFLICT' WHERE id = $1", [itemId]);

    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/resolve-conflict`)
      .set(webhookAuthHeader())
      .send({ winningSaleEventId: randomUUID() });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('ERR_HUMAN_GATE_BYPASS');
  });

  it('allows a genuine USER actor to confirm truth and returns the envelope shape { data, meta }', async () => {
    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/confirm-truth`)
      .set(userAuthHeader())
      .send({ condition: 'good' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('READY');
    expect(res.body.data.condition).toBe('good');
    expect(res.body.meta.version).toBe('v2');
  });

  it('rejects an invalid bearer token (401)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/confirm-truth`)
      .set({ Authorization: 'Bearer totally-wrong-token' })
      .send({ condition: 'good' });
    expect(res.status).toBe(401);
  });

  it('rejects confirm-truth when the item is not in REVIEW_REQUIRED (409, T03-1 equivalent)', async () => {
    await dataSource.query("UPDATE items SET status = 'NEW' WHERE id = $1", [itemId]);

    const res = await request(app.getHttpServer())
      .post(`/items/${itemId}/confirm-truth`)
      .set(userAuthHeader())
      .send({ condition: 'good' });

    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('ERR_STATE_TRANSITION_INVALID');
  });
});
