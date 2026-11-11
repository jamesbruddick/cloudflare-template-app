import { env } from 'cloudflare:test';
import { resolveRouteMeta } from '@shared/seo';
import { describe, expect, it } from 'vitest';
import { request } from './helpers';

// The SPA's router (frontend/src/App.tsx) and the Worker's resolver (src/shared/seo.ts) describe the same
// site twice. A route added to one and not the other is served with a 404 status and noindex - the page
// renders fine in a browser, and a crawler drops it. App.tsx is read in as `TEST_APP_ROUTES` (parsed, not
// imported) and every pattern is exercised here.

/** Every `path:` in the router, plus the `index: true` route, which is `/`. */
function routePatterns(source: string): string[] {
  const patterns = [...source.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1] as string);
  if (/index:\s*true/.test(source)) patterns.push('/');
  return patterns;
}

/** Parameters get a sample value; extend this as routes gain `:params`. */
const SAMPLES: Record<string, string> = {};

function fillParams(pattern: string): string {
  const path = pattern.replace(/:(\w+)/g, (_, name: string) => SAMPLES[name] ?? '1');
  return path.startsWith('/') ? path : `/${path}`;
}

const PATTERNS = routePatterns(env.TEST_APP_ROUTES);
// The catch-all is the not-found page itself, and has no URL to resolve.
const ROUTES = PATTERNS.filter(p => p !== '*');

describe('the router and the resolver describe the same site', () => {
  it('finds the routes at all, so a parse that stops matching cannot pass silently', () => {
    expect(ROUTES).toContain('/');
    expect(PATTERNS).toContain('*');
  });

  it('resolves every route the SPA answers', () => {
    for (const pattern of ROUTES) {
      expect([pattern, resolveRouteMeta(fillParams(pattern)).status]).toEqual([pattern, 200]);
    }
  });

  it('serves every one of them as a 200 document, which is what a crawler gets', async () => {
    for (const pattern of ROUTES) {
      const res = await request(fillParams(pattern));
      expect([pattern, res.status]).toEqual([pattern, 200]);
    }
  });
});
