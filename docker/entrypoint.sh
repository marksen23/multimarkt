#!/bin/sh
# Applies schema changes with the project's existing TypeORM command, then
# starts Nest. Migrations are explicit (`npm run migration:run`), never
# TypeORM synchronize / migrationsRun at process boot.
set -eu

cd /app/backend

# ts-node must typecheck decorator metadata (TypeORM entities). incremental
# would try to write a tsbuildinfo next to tsconfig.json; disable that.
# `types` replaces the tsconfig entry that also names Jest, which is not
# installed in this image.
export TS_NODE_COMPILER_OPTIONS='{"incremental":false,"types":["node"]}'

npm run migration:run

exec node dist/main
