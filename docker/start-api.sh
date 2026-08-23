#!/bin/sh
set -e

cd /app

# Create/patch database tables on boot (idempotent).
# Required on platforms like Render where there is no docker-compose
# db-migrate service; harmless (no-op) when the schema already matches.
pnpm --filter @workspace/db push-force

cd artifacts/api-server
exec node --enable-source-maps ./dist/index.mjs
