# CLAUDE.md

## Overview

Full-stack Cloudflare Workers template: Hono API + React 19 + Tailwind CSS 4,
deployed as a single Worker via Wrangler. Fork it, keep the plumbing (build
pipeline, RPC typing, per-route document rendering, security headers, D1
migrations, test harness), replace the demo routes/UI/auth with real ones.

## Commands

```sh
pnpm install
cp .dev.vars.example .dev.vars   # required for pnpm dev
pnpm db:migrate:local            # apply migrations/ to the local D1 pnpm dev uses
pnpm dev                         # Vite dev server — frontend + worker, one origin
pnpm build                       # wrangler types + frontend tsc + vite build -> dist/
pnpm deploy                      # build, then deploy:worker
pnpm run deploy:worker           # wrangler deploy against generated config (no build)
pnpm typecheck                   # wrangler types + tsc (worker) + tsc (frontend)
pnpm lint                        # biome check .
pnpm format                      # biome format --write .
pnpm test                        # vitest run — full suite against real workerd
pnpm types                       # regenerate worker-configuration.d.ts from wrangler.jsonc
pnpm db:migrate:new <name>       # new numbered migration file
pnpm db:migrate:remote           # apply migrations to production D1
```

Run a single test:

```sh
pnpm exec vitest run tests/api.test.ts
pnpm exec vitest run -t "answers an unknown URL with 404"
```

Document tests read the built shell, so run `pnpm build` before `pnpm test`
after touching `frontend/index.html` (a missing build makes every document 503).

---

## Architecture

### Build pipeline

One Vite pipeline builds two outputs. `vite.config.ts` at the repo root sets
`root: "frontend"`; the `cloudflare()` plugin reads `wrangler.jsonc` and adds a
Worker environment alongside the client environment. A single `vite build`
produces `dist/client/` (static assets) and a Worker bundle. Don't add a
`vite build` step inside `frontend/package.json` — `frontend/`'s `build` script
is `tsc` (type-check only). Vite plugins (`@vitejs/plugin-react`,
`@tailwindcss/vite`, `@cloudflare/vite-plugin`) live in the **root**
`package.json`, not `frontend/`.

### Workspace layout

Two-package pnpm workspace (`.` and `frontend/`), one deployable unit. Split
only for separate `tsconfig.json`/`package.json` concerns (different `lib`,
JSX settings, React deps). Both extend `tsconfig.base.json` — add shared
compiler options there, not in both children.

```
src/index.ts               Hono app (worker entry): one method chain + document catch-all
src/document.ts            Renders each route's <head> into the built shell (HTMLRewriter)
src/shared/seo.ts          Route metadata - isomorphic, read by worker AND SPA
src/types/env.ts           AppEnv / AppContext (Bindings = generated `Env`)
src/http/helpers.ts        apiError (error envelope), notFound, escapeHtml
src/middleware/
  headers.ts               Security headers + per-response CSP/nonce/HSTS/cache policy
  requests.ts              sameOriginGuard (CSRF incl. JSON) + requestBodyLimit
migrations/                D1 schema, one numbered SQL file per change
vite-plugins.ts            generateSitemap, stripHtmlComments
frontend/src/
  App.tsx                  Route table (react-router v8)
  main.tsx                 React entry point
  index.css                Tailwind entry
  components/
    ui/                    Reusable primitives (Card, Button, Input)
    Layout.tsx             Shell chrome with <Outlet />; calls useRouteHead()
    ErrorBoundary.tsx      React error boundary
    AuthDemo.tsx           Self-contained auth demo widget
  pages/                   One default-exported component per route
  lib/                     Non-component code (RPC client, use-head hooks)
frontend/public/           Static files copied to dist/client/ (_headers, boot.css, icons, manifest)
tests/                     Vitest tests, run inside workerd (setup.ts, helpers.ts)
```

### Import aliases

`@/*` → `frontend/src/`, `@worker` → `src/index.ts`, `@shared/*` →
`src/shared/`. Declared in `vite.config.ts` (runtime) **and** the tsconfigs
(type-checker); `@shared` also in `vitest.config.ts`. Add to one without the
others and you get a build/typecheck mismatch. `baseUrl` is not used —
`paths` entries need a leading `./`.

**`src/shared/**` uses neither DOM nor Workers APIs** — the worker and the
browser both import it (and Vite's config loader does too, in Node). Keep it
pure functions over strings and data; rendering belongs in React or
`document.ts`.

**Config imports name their files.** Vite's native config loader resolves
nothing, so the chain it loads (`vite-plugins.ts` → `src/shared/seo.ts` and
anything that imports) uses `.ts` specifiers (`allowImportingTsExtensions` in
`tsconfig.base.json`, safe because nothing emits JS). Everything else is
extensionless.

### Type-safe RPC

`frontend/src/lib/api.ts` does `hc<AppType>("/")`, importing `AppType` from
`@worker`. Hono's method-chained route builder makes this work — **breaking the
chain** (separate `app.get(...)` statements instead of `.get(...).post(...)`)
loses accumulated route types and breaks the client's type inference.

Errors go through `apiError(c, status, code, message)` →
`{ success: false, error: { code, message } }`. Its return type is inferred
(a `TypedResponse`), which is what lets `hc` clients narrow on `'error' in
body` — don't annotate it as `Response`. `onError` never returns
`err.message` (D1 errors can carry internals).

### Routing and documents

`wrangler.jsonc` sets `run_worker_first: ["/*", "!/assets/*", "!/boot.css", …]`
— the worker sees **every document**, the hashed bundles and fixed-name static
files stay on the CDN. **Adding a file to `frontend/public/` means adding its
`!/` exclusion**, or each request for it costs an invocation (it still works:
the catch-all passes file-shaped paths to `ASSETS`).

Route order in `src/index.ts`: `/api/*` routes, then `.get('*')` last, which
404s unknown `/api/*` paths as JSON, passes file-shaped paths (and Vite's `/@`
paths in dev) to `ASSETS`, and renders everything else via `renderDocument`.

`renderDocument` fetches the built `index.html` from `ASSETS` and streams in the
route's title, description, OG/Twitter tags, robots, canonical, JSON-LD and an
`sr-only` crawler body (h1 + links) — all from `resolveRouteMeta(pathname)` in
`src/shared/seo.ts`. The SPA's `useRouteHead()` (called once, in `Layout`)
applies the same metadata on client-side navigation. **Pages never set their
own head**; they can read `useRouteMeta()`.

- **A new route needs an entry in `seo.ts` as well as `App.tsx`.** Otherwise
  it is served with a 404 status and `noindex` — fine in a browser, dropped by
  crawlers. `tests/routes.test.ts` parses `App.tsx` and fails on the mismatch.
- **HTMLRewriter only rewrites tags that exist** — removing a meta tag from
  `index.html` removes it everywhere.
- `index.html` comments are stripped at build (`stripHtmlComments`), so
  comment it freely.
- `sitemap.xml` is generated from `ENTRY_POINTS` at build — don't hand-write
  one. `SITE_ORIGIN` in `seo.ts` (placeholder `https://example.com`) feeds
  canonicals, `og:url` and the sitemap; `robots.txt` restates it.
- `boot.css` holds the first-paint colours and `.sr-only`, so the crawler body
  never flashes before the app CSS loads (under `pnpm dev`, index.css arrives
  via JS). Keep it tiny and in step with `Layout`'s surface colours.

### Generated types

`worker-configuration.d.ts` is generated and gitignored — defines the global
`Env` type. Regenerate with `pnpm types` after editing `wrangler.jsonc`
(bindings, secrets) or after a fresh clone. `pnpm build` and `pnpm typecheck`
already do this. There is no `@cloudflare/workers-types` package — don't add one.

---

## Code Standards

### Component architecture

UI is organized as reusable building blocks. Shared primitives live in
`components/ui/` and are re-exported from `components/ui/index.ts`:

- **`Card`** — neutral container with border, shadow, dark mode
- **`Button`** — primary action button with disabled state
- **`ButtonLink`** — same styling as Button but renders a react-router `Link`
- **`Input`** — styled text input with focus ring and dark mode

Use these instead of duplicating Tailwind class strings. When adding new
primitives, follow the same pattern: accept `ComponentProps<element>`, spread
props, compose `className` with a `base` constant.

### File organization

- **Group by kind**: `components/`, `pages/`, `lib/` — not by feature
- **One default export per page**, matching the route it serves
- **Self-contained feature widgets** (like `AuthDemo`) go in `components/`
  with their own state, not in `pages/`
- **Don't create empty folders** — add a directory when something goes in it

### Dependency placement

Does it ship in the deployed artifact? Then `dependencies`. Everything else
(`wrangler`, `vite`, `typescript`, `vitest`, `biome`, `tailwindcss`, plugins)
is `devDependencies`. Apply the same test when adding packages.

### Style rules

- Tailwind classes only — no inline `style={{...}}` props (blocked by CSP)
- Biome is the sole lint/format tool — don't add ESLint or Prettier. It reports
  unused code as a _warning_ and `biome check` exits 0 on warnings, so
  `noUnusedLocals`/`noUnusedParameters` in `tsconfig.base.json` are what
  actually fail CI on dead code
- Don't swap the RPC client (`hc`) for manual `fetch` typing

---

## Security

### Headers — dual maintenance

| Scope         | Source                                           | Policy                                                   |
| ------------- | ------------------------------------------------ | -------------------------------------------------------- |
| API `/api/*`  | `API_CSP` (`middleware/headers.ts`)              | `default-src 'none'` + `X-Robots-Tag: noindex, nofollow` |
| Documents     | `documentCsp(nonce)`                             | the app policy, with a fresh `script-src` nonce          |
| Static assets | `frontend/public/_headers` (**don't delete it**) | the app policy, no nonce                                 |

The document policy and `_headers`' `/*` rule must match byte for byte minus
the nonce — `api.test.ts` asserts it (vitest passes `_headers` in as
`TEST_ASSET_HEADERS`). `_headers` never applies to a worker response.
**Documents never get `default-src 'none'`** — it blanks the app.

### Content Security Policy

```
default-src 'self'; script-src 'self' 'nonce-…' https://static.cloudflareinsights.com;
style-src 'self'; img-src 'self' data:; font-src 'self';
connect-src 'self' https://cloudflareinsights.com; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

No `'unsafe-inline'` in any directive, so React `style={{...}}` props are
blocked — use Tailwind classes. The nonce exists **only for Cloudflare's
injected inline scripts** (Bot Fight Mode's bootstrap changes per request, so
no hash can pin it); nothing of ours reads it. It must be a real header, and is
shared for an edge-cache entry's life — acceptable only because documents are a
pure function of the pathname. The `cloudflareinsights` hosts allow Cloudflare
Web Analytics; drop them from both files if you never enable it.

Carve-outs in `responsePolicy`:

- **Dev server** — Vite injects an inline preamble script and opens an HMR
  socket, so documents go out without a CSP under `pnpm dev`. Gated on
  `import.meta.env.MODE === 'development'`, **not** `DEV` — vitest also sets
  `DEV === true`, which would make the suite assert the dev path.
- **HSTS** — only sent when the request arrived over https, so plain-http LAN
  dev isn't pinned for a year.

`responsePolicy` is registered **before** `securityHeaders`. Middleware unwinds
in reverse, so `securityHeaders`' post-processing runs first and
`responsePolicy` has the last word on anything conditional.

### Request guards

`sameOriginGuard` (all paths) refuses mutating requests whose
`Sec-Fetch-Site` isn't `same-origin`/`none`, or whose `Origin` isn't the
request's own. It replaces `hono/csrf`, which ignores JSON. A request with
neither header passes (curl, server-to-server) — a browser can't suppress
`Origin` cross-origin. `requestBodyLimit` caps `/api/*` bodies at 64 KB; a
route that takes uploads should stream them and be exempted explicitly.

### Permissions-Policy

Both `_headers` and `securityHeaders` in `src/middleware/headers.ts` restrict
sensitive browser APIs: `camera`, `microphone`, `geolocation`, `payment`, `usb`
— all set to `()` (deny). Extend both files when adding features that need
browser permissions.

### CORS

Intentionally absent. Frontend and API share an origin. Don't add `hono/cors`
without a concrete cross-origin requirement — any allowlist is added attack
surface.

### Auth

Demo implementation only: `POST /api/login` exchanges a static `API_KEY` for a
short-lived JWT (15 min); `GET /api/protected` validates it. Both secrets are
declared in `wrangler.jsonc` under `secrets.required`. Replace this flow with
real auth — it exists to demonstrate the wiring.

---

## SEO

See **Routing and documents** above — metadata is server-rendered per route
from `src/shared/seo.ts`, so crawlers that run no JavaScript and link unfurlers
see the right title/description/canonical, and unknown URLs get a real 404.

- `robots`: `index` (entry points, self-referential canonical),
  `noindex-follow` (crawlable interior), `noindex` (errors, private pages).
  **Keep private pages out with `noindex`, not `robots.txt`** — a Disallow
  stops the crawler ever reading the noindex.
- `crawlLinksFor(pathname)` is what a `noindex, follow` page has to follow;
  add contextual links (next page, parent) there as routes grow.
- No `og:image` yet. Add a 1200×630 PNG (crawlers refuse SVG), the
  `og:image*`/`twitter:image` tags to `index.html`, and rewrite them in
  `document.ts` and `use-head.ts`; switch `twitter:card` to
  `summary_large_image`.
- Home-screen install: `site.webmanifest`, `apple-touch-icon.png` (square,
  opaque — iOS masks it), `icon-192/512.png`. Regenerate them from your own
  icon when you rebrand.

## Performance

### Caching strategy

`_headers` defines the cache policy for static assets:

- **`/assets/*`** — `public, max-age=31536000, immutable`. Vite content-hashes
  these filenames, making them safe to cache indefinitely.
- **Fixed-name files** (`boot.css`, icons, manifest, `sitemap.xml`) — one day.

Worker responses are separate: documents get `public, max-age=0,
s-maxage=300, must-revalidate` and an ETag folded from the shell's ETag and the
pathname (**never pass the shell's own ETag through** — it's identical for
every route, so one page would 304 against another's copy). API responses
default to `no-store` unless the handler set its own `Cache-Control`.

### Build optimization

- Single Vite build produces both client and worker bundles — no duplicate work
- Tree-shaking via ESM (`"type": "module"` everywhere)
- Tailwind CSS 4 with Vite plugin — only ships used utility classes
- Source maps uploaded to Cloudflare (`upload_source_maps: true`) for production
  debugging without serving them to clients

### Runtime

- Workers execute at the edge — no cold-start latency from centralized servers
- `nodejs_compat` flag enabled for Node.js API compatibility in Workers
- Static assets served by Cloudflare's asset handler (CDN), not the Worker

---

## Testing

### Framework

Vitest 5 via `@cloudflare/vitest-plugin` — tests run inside real `workerd`,
not mocks or jsdom. `vitest.config.ts` sets test bindings independent of
`.dev.vars` (`API_KEY`/`JWT_SECRET`), and reads three things in Node to pass in
as bindings (typed in `tests/env.d.ts`): the D1 migrations, `_headers`, and
`App.tsx`'s source. Every outbound `fetch` returns a 502, so the suite never
touches the network — stub `fetch` in a test that needs upstream behaviour.

`tests/setup.ts` applies `migrations/` to a fresh D1 per test file. If a file
truncates tables in `beforeEach`, never truncate `d1_migrations`.

### Coverage

- `api.test.ts` — routes, the error envelope, the same-origin guard and body
  limit, security headers (API CSP, nonce, HSTS over https only, the
  `_headers` ↔ `documentCsp` match)
- `seo.test.ts` — the resolver, and the documents the worker actually serves
  (title, canonical, robots, JSON-LD, 404 status, ETag/304, stripped comments)
- `routes.test.ts` — every `App.tsx` route resolves to a 200 document

### What tests cannot cover

`SELF` binds directly to the worker, so `run_worker_first` and `_headers`
aren't exercised. Document tests do reach `ASSETS`, which serves
`dist/client` — **they need a build**. Verify asset routing via `pnpm dev` or
`wrangler dev -c dist/<name>/wrangler.json`.

### Adding tests

- Test files go in `tests/`, named `*.test.ts`
- Use `request(path)` / `postJson` / `errorCode` from `tests/helpers.ts`
  (`SELF.fetch` with an `http://` URL to exercise the non-https branch)
- Don't import handlers directly — test the whole request/response cycle
- Don't add a jsdom runner or mock the Workers runtime

---

## Constraints

These are load-bearing architectural decisions, not incidental choices:

- **Don't introduce ESLint/Prettier** — Biome is the only lint/format tool
- **Don't swap the RPC client** for manual `fetch` typing
- **Don't move tests to jsdom** — they must run in real `workerd`
- **Don't add `@cloudflare/workers-types`** — types come from the generated file
- **Don't add a `vite build` inside `frontend/`** — bundling happens at the root
- **Don't remove `run_worker_first`** — documents would lose their per-route
  head and real status
- **Don't add a route to `App.tsx` without one in `src/shared/seo.ts`**
- **Don't edit an applied migration** — add a new numbered file
- **Don't delete `_headers`** — it's the only CSP covering static assets
- **Don't use `style={{...}}` props** — blocked by the strict CSP
- **Don't break the Hono method chain** — route type inference depends on it
- **Keep `hono` in `dependencies`**, not `devDependencies` — it ships in the Worker

---

## Deployment

### Deploy command

`pnpm deploy` builds then runs `deploy:worker`, which passes
`-c dist/cloudflare_template_app/wrangler.json` explicitly. That directory name
derives from the worker `name` in `wrangler.jsonc` (dashes → underscores) —
rename the worker and update the script.

### Why the explicit `-c` flag

The Vite plugin writes its deploy config to `frontend/.wrangler/deploy/config.json`.
A bare `wrangler deploy` from the root misses it, silently falls back to
`wrangler.jsonc`, and re-bundles with esbuild instead of shipping the Vite-built
worker. Explicit `-c` fails loudly when the build output is missing.

### No environments

The generated `dist/<name>/wrangler.json` has `"definedEnvironments": []`. If you
add `env.preview`/`env.production` to `wrangler.jsonc`, `--env preview` is
silently ignored. Use per-environment builds via the plugin's `config` customizer
(mutating-function form — the object form appends to arrays and produces
duplicates).

### D1

Create the database once (`wrangler d1 create cloudflare-template-app`) and
replace the placeholder `database_id` in `wrangler.jsonc` — only a real
deploy reads it (`--dry-run`, dev and tests don't). Run `pnpm db:migrate:remote`
**before** deploying code that depends on a new migration. Local dev state
lives in `frontend/.wrangler/state` (the Vite root is `frontend/`), which is
why the local scripts pass `--persist-to`.

### Secrets

`API_KEY` and `JWT_SECRET` are declared in `wrangler.jsonc` under
`secrets.required`. Set locally in `.dev.vars`, in production via
`wrangler secret put`.

`vite.config.ts` reads that same `secrets.required` list and **hard-fails
`pnpm dev`** when one is missing or empty, because Wrangler only warns — the
server would otherwise start and then fail at request time, with the warning
scrolled off the top of the banner. Adding a secret to `wrangler.jsonc` is all
that's needed; the check can't drift. A value exported in the shell counts.
Builds skip the check (`command === 'serve'` only) — CI has no `.dev.vars`.

### CI

`.github/workflows/ci.yml` runs two jobs on every push/PR:

- **`check`** — `types` → `lint` → `typecheck` → `build` → `test` →
  `deploy:worker --dry-run`
- **`audit`** — `pnpm audit --audit-level moderate`, deliberately a separate job
  so a new advisory and a broken test can't hide behind each other

`audit` is the whole advisory gate. `dependency-review-action` would scope the
same check to what a PR _adds_, but its API needs GitHub Advanced Security on a
private repo — add it only if the repo is public.

Actions are **pinned to commit SHAs**, not tags — a tag is mutable and whoever
controls the action's repo could repoint it at code that runs against our
checkout. The trailing `# vX.Y.Z` comment is the human-readable version; update
both together.

Node comes from `.node-version` via `node-version-file`, so the engine floor
lives in one place.

### Dependabot

`.github/dependabot.yml` covers npm (one entry — pnpm resolves the whole
workspace into a single lockfile, so a second `/frontend` entry would only
duplicate PRs) and GitHub Actions, weekly.

The `cooldown` block is the supply-chain guard that actually binds. pnpm's
`minimumReleaseAge` does **not** apply to Dependabot: it resolves and writes the
lockfile itself, and CI then installs exactly that under `--frozen-lockfile`.
Without the cooldown, a compromised release could be merged the day it ships.
Security updates ignore cooldown, so real advisories are still fixed at once.
