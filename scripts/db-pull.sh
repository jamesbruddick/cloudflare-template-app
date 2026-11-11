#!/usr/bin/env bash
# Replace the local D1 database with a fresh copy of production.
#
# Destructive by design: the local state directory is deleted, not merged into, so the result is exactly
# what the remote holds - schema, data, and the d1_migrations table, which means `pnpm db:migrate:list`
# afterwards reports what is pending against production rather than against the old local database.
#
# Read-only against the remote: it only runs `d1 export`.
#
# Schema and data are exported separately because a single combined dump is not import-safe once tables
# reference each other: `d1 export` emits each table's CREATE followed by its INSERTs, so a child table's
# rows can land before its parent table exists. Local D1 enforces foreign keys, and the dump's
# `PRAGMA defer_foreign_keys` defers the row check, not the missing table. Creating the whole schema first
# removes the ordering problem.
set -euo pipefail

cd "$(dirname "$0")/.."

# The database_name in wrangler.jsonc. Local state lives under frontend/ because that is Vite's root.
DB=cloudflare-template-app
STATE=frontend/.wrangler/state
SCHEMA=$(mktemp -t d1-schema)
DATA=$(mktemp -t d1-data)
trap 'rm -f "$SCHEMA" "$DATA"' EXIT

echo "Exporting remote $DB..."
pnpm exec wrangler d1 export "$DB" --remote -y --no-data --output "$SCHEMA"
pnpm exec wrangler d1 export "$DB" --remote -y --no-schema --output "$DATA"

echo "Removing local database..."
rm -rf "$STATE/v3/d1"

echo "Importing into local $DB..."
pnpm exec wrangler d1 execute "$DB" --local --persist-to "$STATE" --file "$SCHEMA"
pnpm exec wrangler d1 execute "$DB" --local --persist-to "$STATE" --file "$DATA"

echo "Done."
