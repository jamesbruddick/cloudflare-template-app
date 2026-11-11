// Applies the same migrations production runs, to a fresh D1 per test file. Read in Node by vitest.config.ts
// (as TEST_MIGRATIONS), since this runs inside workerd with no filesystem.
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// Records what it applied in `d1_migrations`, so a file that truncates tables must leave that one alone -
// clearing it would re-run every migration.
beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
