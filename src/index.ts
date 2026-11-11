// One unbroken method chain: it accumulates the route types `AppType` exports for `hc<AppType>`.
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { jwt, sign } from 'hono/jwt';
import { renderDocument } from './document';
import { apiError, notFound } from './http/helpers';
import { responsePolicy, securityHeaders } from './middleware/headers';
import { requestBodyLimit, sameOriginGuard } from './middleware/requests';
import type { AppEnv } from './types/env';

const JWT_EXPIRY_SECONDS = 15 * 60;

const app = new Hono<AppEnv>()
  // responsePolicy first: middleware unwinds in reverse, so securityHeaders' post-processing runs last
  // and would otherwise overwrite the per-response CSP chosen below it.
  .use('*', responsePolicy)
  .use('*', securityHeaders)
  // Before the body limit, so a rejected cross-origin request reads no body.
  .use('*', sameOriginGuard)
  .use('/api/*', requestBodyLimit)
  .get('/api/health', async c => {
    // Reads a row the first migration writes, so a database that exists but was never migrated fails too.
    const schema = await c.env.DB.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").first<{ value: string }>();
    return c.json({ status: 'ok', schema: schema?.value ?? null, timestamp: new Date().toISOString() });
  })
  .get('/api/hello', c => {
    return c.json({ message: 'Hello from Cloudflare Workers edge!' });
  })
  .post('/api/login', async c => {
    const apiKey = c.req.header('x-api-key');
    if (!apiKey || apiKey !== c.env.API_KEY) {
      return apiError(c, 401, 'invalid_api_key', 'Invalid API key.');
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await sign({ sub: 'demo-client', iat: now, exp: now + JWT_EXPIRY_SECONDS }, c.env.JWT_SECRET, 'HS256');

    return c.json({ token, expiresIn: JWT_EXPIRY_SECONDS });
  })
  .get(
    '/api/protected',
    (c, next) => jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next),
    c => {
      return c.json({
        message: 'You reached a protected route',
        payload: c.get('jwtPayload'),
      });
    },
  )

  /** Every page, answered with the route's real status so an unknown URL isn't a soft 404. Registered last. */
  .get('*', async c => {
    const path = c.req.path;
    if (path.startsWith('/api/')) return notFound(c);
    // File-shaped paths (and Vite's `/@` ones) go to the asset handler, or dev serves HTML for /src/main.tsx.
    // In production these only arrive for a file missing from the `run_worker_first` exclusions.
    const isFileRequest = path.startsWith('/@') || path.slice(path.lastIndexOf('/')).includes('.');
    if (isFileRequest) {
      const asset = await c.env.ASSETS.fetch(c.req.raw);
      // A 304 has no Content-Type, so it must be passed through before the miss check below.
      if (asset.status === 304) return new Response(null, { status: 304, headers: new Headers(asset.headers) });
      // The SPA fallback answers a missing file with index.html and a 200; HTML or no type means a miss.
      const type = asset.headers.get('Content-Type') ?? '';
      if (type === '' || type.includes('text/html')) return c.text('Not Found', 404);
      // Asset responses have immutable headers, which responsePolicy would throw on.
      return new Response(asset.body, asset);
    }
    return renderDocument(c.env.ASSETS, c.req.raw, new URL(c.req.url));
  });

// Every unmatched GET is a document, so only a non-GET to an unknown path gets here.
app.notFound(c => notFound(c));

app.onError((err, c) => {
  // Thrown by Hono's own middleware (the JWT check's 401, the body limit) with its intended response.
  if (err instanceof HTTPException) return err.getResponse();
  // Never return err.message: D1 and upstream errors can carry internal detail.
  console.error('Unhandled error:', c.req.method, c.req.path, err);
  return apiError(c, 500, 'internal_error', 'Something went wrong.');
});

export type AppType = typeof app;
export default app;
