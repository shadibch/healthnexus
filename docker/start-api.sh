#!/bin/sh
set -e

cd /app

# Push the Drizzle schema (idempotent). Creates/updates ALL tables and
# constraints from the canonical schema definitions (users, medical_centers,
# doctors, medications, haad_activity_catalogue, conversations, messages, ...).
# This is the source of truth for the schema on fresh and existing databases.
# (The committed ./drizzle migrations are older delta snapshots; they assume the
# base tables already exist and would re-add constraints on a fresh datastore,
# so the schema push is used instead.)
pnpm --filter @workspace/db push

cd artifacts/api-server
exec node --enable-source-maps ./dist/index.mjs