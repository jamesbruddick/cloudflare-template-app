// Request-shape gates: after the header middleware (so rejections carry headers), before any handler
// reads a body or touches D1.
import type { Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { apiError } from '../http/helpers';
import type { AppContext } from '../types/env';

/** Generous for JSON. A route that takes uploads should stream them and get its own limit. */
const REQUEST_BODY_MAX_BYTES = 64 * 1024;

/**
 * Stops an anonymous caller making the Worker buffer and parse megabytes. Checks Content-Length up front,
 * else aborts mid-stream.
 */
export const requestBodyLimit = bodyLimit({
  maxSize: REQUEST_BODY_MAX_BYTES,
  onError: c => apiError(c as AppContext, 413, 'payload_too_large', `Request body may be at most ${REQUEST_BODY_MAX_BYTES} bytes.`),
});

// No OPTIONS: there's no CORS, so it should stay the JSON 404, not become a 403.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection that covers JSON, which `hono/csrf` ignores. `Sec-Fetch-Site` decides when present, else
 * `Origin`, against the request's own origin (so LAN and preview hosts work). A request with neither passes:
 * that keeps the API usable from curl, and a browser can't suppress `Origin` cross-origin.
 */
export async function sameOriginGuard(c: AppContext, next: Next): Promise<Response | void> {
  if (!MUTATING_METHODS.has(c.req.method)) return next();

  const forbidden = () => apiError(c, 403, 'cross_origin', 'Cross-origin requests are not accepted.');
  const origin = c.req.header('Origin');
  const expected = new URL(c.req.url).origin;
  const site = c.req.header('Sec-Fetch-Site');

  // `none` is a user-initiated navigation. Same-site is refused too: a sibling subdomain isn't this app.
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return forbidden();
  // Also reached when Sec-Fetch-Site was `none`.
  if (origin !== undefined && origin !== expected) return forbidden();
  return next();
}
