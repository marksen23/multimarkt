import { DataSource, DataSourceOptions } from 'typeorm';
import 'dotenv/config';
import * as entities from './entities';

// TypeORM CLI data source (migration:generate / migration:run / migration:revert).
// STRICT RULE: no `synchronize`, no `migrationsRun` here — migrations are applied
// explicitly via `npm run migration:run`, never implicitly at app boot in production.
//
// Bewusst eine FUNKTION statt eines Modul-Top-Level-Konstanten: liest
// `process.env` erst beim Aufruf, nicht beim ersten Import. Ein Konstanten-
// Objekt würde `process.env.DATABASE_URL` beim ersten `require()` dieses
// Moduls einfrieren — u.a. in Tests, die die DB-URL erst nach dem Start
// eines Testcontainers dynamisch setzen, wäre das ein stiller Bug.
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
    port: process.env.DATABASE_URL ? undefined : Number(process.env.DB_PORT ?? 5432),
    username: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
    password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
    database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    entities: Object.values(entities),
    migrations: ['migrations/*.ts'],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: process.env.NODE_ENV !== 'production',
  };
}

// Für den TypeORM CLI (`npm run migration:*`), der ein Default-Export-Objekt
// erwartet — zum Zeitpunkt des CLI-Aufrufs ist process.env bereits final.
const dataSource = new DataSource(buildDataSourceOptions());
export default dataSource;
