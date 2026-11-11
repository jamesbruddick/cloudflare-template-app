# cloudflare-template-app

A full-stack starter running entirely on Cloudflare Workers: [Hono](https://hono.dev)
for the API, [React 19](https://react.dev) + [Tailwind CSS 4](https://tailwindcss.com)
for the UI, and [Vite](https://vite.dev) via `@cloudflare/vite-plugin` for a single
`vite dev` / `vite build` pipeline that serves both.

## Stack

- **API**: Hono, with `secureHeaders()` (including a `Content-Security-Policy`)
  applied globally. No CORS middleware — the frontend and API share an origin,
  so cross-origin requests aren't needed and aren't allowed.
- **Frontend**: React 19, built with a type-safe RPC client (`hono/client`) against
  the worker's route types — no manual fetch typing needed
- **Auth demo**: a working `API_KEY` → JWT (`JWT_SECRET`) → protected-route flow,
  meant as a reference for wiring up real auth in a derived project
- **Database**: D1, with numbered SQL migrations in `migrations/` that local dev,
  the test suite and production all apply the same way
- **SEO without SSR**: the worker streams each route's `<head>` (title,
  description, canonical, robots, JSON-LD) into the static shell, so crawlers
  and link unfurlers see real metadata and unknown URLs get a real 404
- **Testing**: Vitest via `@cloudflare/vitest-plugin`, running tests inside
  an actual `workerd` instance
- **Linting/formatting**: Biome
- **Deploy**: Wrangler, deploying static assets + the worker together

## Requirements

- Node 26+
- [Corepack](https://nodejs.org/api/corepack.html) enabled (`corepack enable`) —
  pins pnpm to the version in `package.json`

## Getting started

```sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in local values
pnpm db:migrate:local            # create the local D1 schema
pnpm dev
```

`pnpm dev` starts Vite (via `@cloudflare/vite-plugin`), serving the React app and
the Hono API from the same origin.

## Secrets

This worker declares two required secrets in [wrangler.jsonc](wrangler.jsonc)
(`secrets.required`): `API_KEY` and `JWT_SECRET`.

- **Local dev**: put them in `.dev.vars` (gitignored — see `.dev.vars.example`).
- **Production**: set them with `wrangler secret put API_KEY` and
  `wrangler secret put JWT_SECRET` before deploying.

They power a demo auth flow in [src/index.ts](src/index.ts):

- `POST /api/login` — send `x-api-key: <API_KEY>`, get back a short-lived JWT
  signed with `JWT_SECRET`.
- `GET /api/protected` — send `Authorization: Bearer <token>`, get back the
  decoded JWT payload.

The frontend's "Protected API demo" card exercises this end to end. Treat this
as a template to replace with your own auth logic, not as production-grade auth.

> **Note:** `@cloudflare/vite-plugin` copies `.dev.vars` into `dist/` during
> `pnpm build` so the built worker can run locally with `wrangler dev` against
> the build output. `dist/` is gitignored — don't publish or ship that directory
> anywhere secrets shouldn't go.

## Routing

[wrangler.jsonc](wrangler.jsonc) sets `assets.run_worker_first` to every path
**except** the hashed bundles (`/assets/*`) and the fixed-name files in
`frontend/public/`. Those stay on the CDN; every document reaches the worker,
which:

1. answers `/api/*` from the Hono routes (unknown API paths get a JSON 404);
2. renders every other path through [src/document.ts](src/document.ts): the
   built `index.html` with that route's `<head>` and a hidden crawler body
   (heading + links) streamed in by `HTMLRewriter`, and the route's real status.

Route metadata lives in one place, [src/shared/seo.ts](src/shared/seo.ts). The
worker renders it and the SPA's `useRouteHead()` reapplies it on client-side
navigation. **A new page needs an entry there as well as in `App.tsx`**. Without
one it is served as a 404/noindex, and `tests/routes.test.ts` fails. Adding a
file to `frontend/public/` means adding a `!/<file>` exclusion to
`run_worker_first`, or each request for it costs a worker invocation.

## Database

The `DB` binding is a D1 database. Before the first deploy, create it with
`wrangler d1 create cloudflare-template-app` and paste the printed id over the
placeholder `database_id` in `wrangler.jsonc`. Local dev and the tests never
read the id.

- `pnpm db:migrate:new <name>`: a new numbered file in `migrations/`
- `pnpm db:migrate:local`: apply to the local database `pnpm dev` uses
- `pnpm db:migrate:remote`: apply to production (run before deploying code
  that needs the change)
- `pnpm db:pull`: replace the local database with a copy of production

Never edit a migration that has been applied anywhere; add a new one. The test
suite applies the same files to a fresh database per test file.

## Security headers

Two sources, one policy:

- **Worker responses**: [src/middleware/headers.ts](src/middleware/headers.ts).
  API responses get `default-src 'none'` and `X-Robots-Tag: noindex`.
  Documents get the app CSP plus a per-request `script-src` nonce (for
  Cloudflare's injected Bot Fight Mode script). No CSP under `pnpm dev`, where
  Vite's inline preamble needs one.
- **Static assets**: [frontend/public/_headers](frontend/public/_headers), the
  same CSP minus the nonce. A test fails if the two drift.

Mutating requests from another origin are refused (`sameOriginGuard`, which
covers JSON where `hono/csrf` doesn't), and `/api/*` bodies are capped at 64 KB.
Every API error uses one envelope: `{ success: false, error: { code, message } }`.

`_headers` also sets the cache policy: Vite's content-hashed bundles are
`immutable` for a year, and fixed-name files revalidate daily. Documents are
cached at the edge for five minutes (`s-maxage=300`) and revalidated by
browsers every time, with a per-route ETag.

## Scripts

| Command                                                | Description                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                                             | Start the Vite dev server (frontend + worker)                  |
| `pnpm build`                                           | Build the frontend and worker into `dist/`                     |
| `pnpm deploy`                                          | Build, then `wrangler deploy` against the generated config     |
| `pnpm run deploy:worker`                               | Deploy the already-built worker (used by `pnpm deploy` and CI) |
| `pnpm types`                                           | Regenerate `worker-configuration.d.ts` from config             |
| `pnpm typecheck`                                       | Type-check the worker and frontend with `tsc`                  |
| `pnpm test`                                            | Run the Vitest suite against a real `workerd`                  |
| `pnpm lint`                                            | Check formatting and lint rules with Biome                     |
| `pnpm format`                                          | Auto-format with Biome                                         |
| `pnpm db:migrate:new` / `:local` / `:remote` / `:list` | Create, apply or list D1 migrations                            |
| `pnpm db:pull`                                         | Replace the local D1 database with a copy of production        |

`worker-configuration.d.ts` is generated (gitignored) — run `pnpm types` after
changing `wrangler.jsonc` (bindings, secrets, etc.), and again after
`pnpm install` in a fresh clone or CI checkout.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `types`, `lint`,
`typecheck`, `build`, `test` and `deploy:worker --dry-run` on every push and
pull request, plus `pnpm audit` as a separate job. The build comes before the
tests because the document tests read the built `index.html`. Dependabot
([`.github/dependabot.yml`](.github/dependabot.yml)) keeps npm and GitHub
Actions dependencies up to date on a weekly schedule.

## Project layout

```
src/index.ts               Hono app: one method chain, then the document catch-all
src/document.ts            Per-route <head> rendering via HTMLRewriter
src/shared/seo.ts          Route metadata, shared by the worker and the SPA
src/middleware/            Security headers, same-origin guard, body limit
src/http/helpers.ts        apiError / notFound / escapeHtml
migrations/                D1 schema, one numbered file per change
vite-plugins.ts            sitemap.xml generation, HTML comment stripping
frontend/src/
  App.tsx                  Route table (react-router)
  main.tsx                 React entry point
  index.css                Tailwind entry
  components/              Shared UI (Layout, ErrorBoundary, ui/ primitives)
  pages/                   One component per route
  lib/                     Non-component code (RPC client, route head hook)
frontend/public/           Static files copied as-is into dist/client/
tests/                     Vitest tests, run inside workerd
wrangler.jsonc             Worker, assets and D1 configuration
.github/                   CI workflow + Dependabot config
```

Imports use three path aliases instead of relative traversal: `@/*` for
anything under `frontend/src/`, `@worker` for the Hono app's exported
`AppType`, and `@shared/*` for the DOM-free code in `src/shared/` that both
sides import. They are declared in [vite.config.ts](vite.config.ts) and the
tsconfigs (`@shared` also in [vitest.config.ts](vitest.config.ts)) and must be
kept in step. Vite resolves the runtime import, TypeScript resolves the type.

The footer shows the commit the bundle was built from (`__BUILD_VERSION__`,
injected by `vite.config.ts`), marked `-dirty` for an uncommitted build.
