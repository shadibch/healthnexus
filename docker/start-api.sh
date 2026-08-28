#!/bin/sh
set -e

cd /app

# Apply committed, idempotent drizzle migrations on boot (journal-tracked).
# Required on platforms like Render where there is no docker-compose
# db-migrate service; harmless (no-op) when migrations are already applied.
pnpm --filter @workspace/db db:migrate

cd artifacts/api-server
exec node --enable-source-maps ./dist/index.mjs