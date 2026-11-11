import { crawlLinksFor, ENTRY_POINTS, resolveRouteMeta, SITE_NAME, SITE_ORIGIN } from '@shared/seo';
import { describe, expect, it } from 'vitest';
import { request } from './helpers';

// SEO is invisible when it breaks - nothing in the UI changes if a canonical goes missing. Locked down at
// both levels: the resolver's output, and what the Worker actually serves.
//
// The document tests read the built shell (dist/client/index.html) through ASSETS, so they need
// `pnpm build` first; without one every document is a 503.

describe('route metadata', () => {
  it('reports a real status instead of a soft 404', () => {
    expect(resolveRouteMeta('/').status).toBe(200);
    expect(resolveRouteMeta('/no-such-page').status).toBe(404);
  });

  it('normalizes a trailing slash rather than treating it as a separate URL', () => {
    expect(resolveRouteMeta('/no-such-page/')).toEqual(resolveRouteMeta('/no-such-page'));
  });

  it('declares a self-referential canonical for every indexable entry point', () => {
    for (const entry of ENTRY_POINTS) {
      const meta = resolveRouteMeta(entry.href);
      expect(meta.robots).toBe('index');
      expect(meta.canonical).toBe(entry.href);
    }
  });

  it('always offers the entry points as crawl links, so no page is a dead end', () => {
    expect(crawlLinksFor('/no-such-page')).toEqual(expect.arrayContaining(ENTRY_POINTS));
  });
});

describe('server-rendered documents', () => {
  const doc = async (path: string) => {
    const res = await request(path);
    return { res, html: await res.text() };
  };

  it('serves the SPA shell with the route title already in it', async () => {
    const { res, html } = await doc('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain(`<title>${resolveRouteMeta('/').title} - ${SITE_NAME}</title>`);
  });

  it('stamps the canonical, robots policy and structured data', async () => {
    const { html } = await doc('/');
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/">`);
    expect(html).toContain('content="index, follow, max-image-preview:large');
    expect(html).toContain('application/ld+json');
  });

  it('renders the h1 and crawl links into the shell for crawlers that run no JavaScript', async () => {
    const { html } = await doc('/');
    expect(html).toContain(`<h1>${SITE_NAME}</h1>`);
    expect(html).toContain('href="/"');
  });

  it('answers an unknown URL with 404, not a soft 404', async () => {
    const { res, html } = await doc('/no-such-page');
    expect(res.status).toBe(404);
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toContain('rel="canonical"');
  });

  it('ships no HTML comments - they are notes for editors, stripped at build', async () => {
    expect((await doc('/')).html).not.toContain('<!--');
  });

  it('gives each route its own ETag and honours it', async () => {
    const home = (await request('/')).headers.get('ETag');
    expect(home).toBeTruthy();
    expect((await request('/', { headers: { 'If-None-Match': home ?? '' } })).status).toBe(304);
  });

  it('caches documents briefly at the edge and never in the browser', async () => {
    expect((await request('/')).headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, must-revalidate');
  });

  it('answers a missing file with a 404, not the HTML shell', async () => {
    const res = await request('/no-such-file.js');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type') ?? '').not.toContain('text/html');
  });
});
