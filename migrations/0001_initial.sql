-- Migration number: 0001 	 2026-11-10T00:00:00.000Z
--
-- The starting schema. Replace this table with your own; add later changes as new numbered files
-- (`pnpm db:migrate:new <name>`), never by editing one that has been applied anywhere.

-- App-wide key/value settings. GET /api/health reads it, which is what proves migrations ran.
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_meta (key, value) VALUES ('schema_version', '1');
