import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Read here, in Node, and passed in as bindings: tests/setup.ts runs in workerd with no filesystem.
// readD1Migrations orders and splits the files with wrangler's own SQL grammar.
const migrations = await readD1Migrations(path.resolve(import.meta.dirname, 'migrations'));

// The static assets' CSP, so a test can assert it matches the document CSP - nothing else would notice drift.
const assetHeaders = await readFile(path.resolve(import.meta.dirname, 'frontend/public/_headers'), 'utf8');

// The router's source, so every SPA route can be checked against src/shared/seo.ts (parsed, not imported -
// importing would pull in React).
const appRoutes = await readFile(path.resolve(import.meta.dirname, 'frontend/src/App.tsx'), 'utf8');

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Independent of .dev.vars, so the suite runs the same everywhere.
        bindings: {
          API_KEY: 'test-api-key',
          JWT_SECRET: 'test-jwt-secret',
          TEST_MIGRATIONS: migrations,
          TEST_ASSET_HEADERS: assetHeaders,
          TEST_APP_ROUTES: appRoutes,
        },
        // Every outbound fetch fails loudly, so the suite never touches the network.
        outboundService(request) {
          return new Response(`Unmocked outbound request in tests: ${request.method} ${request.url}`, {
            status: 502,
          });
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./tests/setup.ts'],
  },
});
