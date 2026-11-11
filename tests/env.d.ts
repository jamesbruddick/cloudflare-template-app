// Test-only additions to the Worker's env. `Cloudflare.Env` is an interface, so this merges into it; the
// `import(...)` stays inline, since a top-level import would make this a module and stop the merge.

declare namespace Cloudflare {
  interface Env {
    /** Migrations read in Node by vitest.config.ts and applied by tests/setup.ts inside workerd. */
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];

    /** Raw frontend/public/_headers, so the asset CSP can be diffed against the document one. */
    TEST_ASSET_HEADERS: string;

    /** Raw frontend/src/App.tsx, so every route the SPA answers can be checked against the resolver. */
    TEST_APP_ROUTES: string;
  }
}
