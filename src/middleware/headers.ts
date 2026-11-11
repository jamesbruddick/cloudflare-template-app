import type { Next } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppContext } from '../types/env';

/**
 * Only what is identical for every response; the CSP varies (API vs document) and is set in
 * `responsePolicy`. Static assets get the document policy from frontend/public/_headers - keep the two
 * identical, minus the nonce (a test asserts this).
 */
export const securityHeaders = secureHeaders({
  // Set in responsePolicy instead, because each varies per response.
  contentSecurityPolicy: undefined,
  strictTransportSecurity: false,
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  // Not `no-referrer`: outbound links keep the origin (never the path), which is what most sites expect.
  referrerPolicy: 'strict-origin-when-cross-origin',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
  },
});

/** JSON responses load nothing and execute nothing. */
const API_CSP = "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/**
 * No `'unsafe-inline'` anywhere, which is what makes React `style={{...}}` props unusable. Beyond `'self'`:
 * Cloudflare Web Analytics (injected at the edge after this header, from one host reporting to another) -
 * drop both hosts if you never turn it on. _headers restates this and must match byte for byte, minus the
 * nonce.
 */
const documentCsp = (nonce: string): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

/**
 * For Cloudflare's injected inline scripts (Bot Fight Mode's bootstrap changes per request, so no hash can
 * pin it) - nothing of ours reads it. It must be a real header, which Cloudflare parses; a nonce also makes
 * browsers ignore `'unsafe-inline'`. Shared for an edge-cache entry's life, which is safe only because
 * documents are a pure function of the pathname.
 */
function scriptNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Vite's dev server injects an inline preamble script and opens an HMR socket, which no production-shaped
 * CSP can allow, so documents go out without one under `pnpm dev`. Deliberately `MODE`, not `DEV`: vitest
 * also reports `DEV === true`, which would make the suite assert the dev path.
 */
export const isDevServer = import.meta.env?.MODE === 'development';

/**
 * HSTS is sent only over https, so plain-http LAN dev isn't pinned for a year. Cache-Control is only
 * defaulted when the handler didn't set one.
 */
export async function responsePolicy(c: AppContext, next: Next): Promise<void> {
  await next();

  if (c.req.path.startsWith('/api/')) {
    c.res.headers.set('Content-Security-Policy', API_CSP);
    // JSON has no <head> to carry a robots meta, and robots.txt only stops the fetch - an off-site link
    // could still get the URL listed.
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else if (isDevServer) {
    c.res.headers.delete('Content-Security-Policy');
  } else {
    c.res.headers.set('Content-Security-Policy', documentCsp(scriptNonce()));
  }

  if (new URL(c.req.url).protocol === 'https:') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
}
