// Per-route document metadata from the pathname alone. Isomorphic: the Worker renders each document's
// <head> from it (src/document.ts) and the SPA calls it on navigation (frontend/src/lib/use-head.ts), so the
// two can't drift. Neither DOM nor Workers APIs belong here - both sides import it.
//
// Imported by vite-plugins.ts through Vite's config loader, which resolves nothing - so any import added
// here must name its file (`./x.ts`).

export const SITE_NAME = 'Cloudflare Template App';
/** The canonical origin, for absolute URLs (canonical links, og:url, sitemap). Set it to your domain. */
export const SITE_ORIGIN = 'https://example.com';

const DEFAULT_DESCRIPTION = 'Full-stack starter on Cloudflare Workers with Hono and React.';

type RobotsPolicy = 'index' | 'noindex-follow' | 'noindex';

export type RouteMeta = {
  /** Without the site-name suffix. */
  title: string;
  description: string;
  /** Site-relative. Omitted on error pages. */
  canonical?: string;
  robots: RobotsPolicy;
  /** The crawler body's heading; pages can read it via `useRouteMeta()` rather than restating it. */
  h1: string;
  jsonLd: unknown[];
  /** The real status, so an unknown URL isn't a soft 404. */
  status: 200 | 404;
};

/** Indexable pages only: Discover surfaces only pages that opt into the large image. */
const PREVIEW_DIRECTIVES = 'max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export function robotsContent(policy: RobotsPolicy): string {
  if (policy === 'noindex') return 'noindex, nofollow';
  if (policy === 'noindex-follow') return 'noindex, follow';
  return `index, follow, ${PREVIEW_DIRECTIVES}`;
}

export const NOT_FOUND_TITLE = 'Page Not Found';

/**
 * Every route the SPA answers, by exact path. A route with parameters becomes a branch in
 * `resolveRouteMeta` instead. `tests/routes.test.ts` fails when App.tsx gains a route this doesn't resolve.
 */
const ROUTES: Record<string, Omit<RouteMeta, 'status' | 'canonical'>> = {
  '/': {
    title: 'Hono + React, running at the edge',
    description: DEFAULT_DESCRIPTION,
    robots: 'index',
    h1: SITE_NAME,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
      },
    ],
  },
};

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname || '/';
}

export function resolveRouteMeta(pathname: string): RouteMeta {
  const path = normalize(pathname);
  const route = ROUTES[path];
  if (route) {
    // Self-referential for indexable pages only: a canonical on a noindex page sends mixed signals.
    return { ...route, canonical: route.robots === 'index' ? path : undefined, status: 200 };
  }
  return {
    title: NOT_FOUND_TITLE,
    description: 'Nothing lives at this address.',
    robots: 'noindex',
    h1: NOT_FOUND_TITLE,
    jsonLd: [],
    status: 404,
  };
}

/** The indexable entry points: what `sitemap.xml` lists (generated at build by vite-plugins.ts). */
export const ENTRY_POINTS: { href: string; label: string }[] = [{ href: '/', label: 'Home' }];

/**
 * The links rendered into each document for crawlers that run no JavaScript - without them a
 * `noindex, follow` page has nothing to follow. Add contextual links (next page, parent) per route here.
 */
export function crawlLinksFor(_pathname: string): { href: string; label: string }[] {
  return [...ENTRY_POINTS];
}
