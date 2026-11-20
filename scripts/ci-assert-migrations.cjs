#!/usr/bin/env node
// Prüft, dass jede Datei in backend/migrations genau einmal in
// schema_migrations gelandet ist. TypeORM speichert den Klassennamen,
// nicht den Dateinamen — verglichen wird die Anzahl.

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendDir = path.join(__dirname, '..', 'backend');
const { Client } = createRequire(path.join(backendDir, 'package.json'))('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL fehlt.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(path.join(backendDir, 'migrations'))
    .filter((name) => name.endsWith('.ts'))
    .sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query('SELECT name FROM schema_migrations ORDER BY id');
    const applied = result.rows.map((row) => row.name);
    if (applied.length !== files.length) {
      console.error(
        `Erwartet ${files.length} Migrationen (Dateien), angewendet sind ${applied.length}.`,
      );
      console.error('Dateien:');
      for (const file of files) console.error(`  ${file}`);
      console.error('schema_migrations:');
      for (const name of applied) console.error(`  ${name}`);
      process.exit(1);
    }
    console.log(`${applied.length} Migrationen angewendet, passend zu ${files.length} Dateien.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
