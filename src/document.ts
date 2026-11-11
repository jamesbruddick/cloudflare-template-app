// The real <head> for every document, so a crawler that runs no JavaScript (and every link unfurler) sees
// the right title, description and canonical. The same `resolveRouteMeta` the SPA uses, streamed through
// HTMLRewriter into the built index.html.

import { escapeHtml } from './http/helpers';
import { crawlLinksFor, resolveRouteMeta, robotsContent, SITE_NAME, SITE_ORIGIN } from './shared/seo';

/** `<` is escaped, so a `</script>` in a string can't end the tag. */
function jsonLdScript(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}

/** `sr-only` (boot.css defines it before the app CSS loads): React replaces #root on mount, so anything visible would flash. */
function seoBody(meta: ReturnType<typeof resolveRouteMeta>, pathname: string): string {
  const links = crawlLinksFor(pathname)
    .map(l => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
    .join('');
  return `<div class="sr-only"><h1>${escapeHtml(meta.h1)}</h1><p>${escapeHtml(meta.description)}</p><nav aria-label="Site"><ul>${links}</ul></nav></div>`;
}

/** FNV-1a, only to fold the pathname into the ETag. */
function hashPath(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * The document is a pure function of (shell, pathname), so fold both in. Never pass the shell's own ETag
 * through - it's identical for every route, so `/about` would 304 against `/`'s copy.
 */
function documentEtag(shell: Response, pathname: string): string | undefined {
  const shellTag = shell.headers.get('ETag');
  if (!shellTag) return undefined;
  return `W/"${shellTag.replace(/^W\//, '').replaceAll('"', '')}-${hashPath(pathname)}"`;
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header.split(',').some(candidate => candidate.trim() === etag);
}

/** Browsers revalidate every time (a deploy shows up at once); the edge may serve a copy for five minutes. */
const DOCUMENT_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, must-revalidate';

/** The shell with this route's head and real status (a 200 for an unknown URL would be a soft 404). */
export async function renderDocument(assets: Fetcher, request: Request, url: URL): Promise<Response> {
  const meta = resolveRouteMeta(url.pathname);

  // The shell itself, independent of `not_found_handling`. Visitor headers aren't forwarded: a conditional
  // request would 304, which isn't a shell to rewrite.
  const shell = await assets.fetch(new URL('/index.html', url));
  if (!shell.ok) {
    // Almost always a missing build (dist/client/index.html).
    console.error('Document shell unavailable:', shell.status, url.pathname);
    return new Response('Service Unavailable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const etag = meta.status === 200 ? documentEtag(shell, url.pathname) : undefined;
  if (etag && matchesEtag(request.headers.get('If-None-Match'), etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': DOCUMENT_CACHE_CONTROL } });
  }

  const title = `${meta.title} - ${SITE_NAME}`;
  const canonical = meta.canonical ? `${SITE_ORIGIN}${meta.canonical}` : undefined;
  const setContent = (value: string) => ({
    element(el: { setAttribute(name: string, value: string): void }) {
      el.setAttribute('content', value);
    },
  });

  // HTMLRewriter can only rewrite tags that exist, so every tag named here must stay in index.html.
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', setContent(meta.description))
    .on('meta[property="og:description"]', setContent(meta.description))
    .on('meta[name="twitter:description"]', setContent(meta.description))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="robots"]', setContent(robotsContent(meta.robots)))
    .on('meta[property="og:url"]', setContent(canonical ?? `${SITE_ORIGIN}/`))
    .on('head', {
      element(el) {
        if (canonical) el.append(`<link rel="canonical" href="${escapeHtml(canonical)}">`, { html: true });
        for (const obj of meta.jsonLd) el.append(jsonLdScript(obj), { html: true });
      },
    })
    .on('#root', {
      element(el) {
        el.setInnerContent(seoBody(meta, url.pathname), { html: true });
      },
    })
    .transform(shell);

  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', DOCUMENT_CACHE_CONTROL);
  // This route's validator, never the shell file's.
  headers.delete('Last-Modified');
  headers.delete('CF-Cache-Status');
  if (etag) headers.set('ETag', etag);
  else headers.delete('ETag');
  return new Response(rewritten.body, { status: meta.status, headers });
}
