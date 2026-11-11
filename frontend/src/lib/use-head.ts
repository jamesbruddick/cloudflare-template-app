import { type RouteMeta, resolveRouteMeta, robotsContent, SITE_NAME, SITE_ORIGIN } from '@shared/seo';
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';

// Keeps the Worker-rendered <head> correct across in-app navigation; both sides use `resolveRouteMeta`, so
// a page's metadata is declared once, in src/shared/seo.ts.

function setMeta(selector: string, value: string): void {
  for (const tag of document.querySelectorAll<HTMLMetaElement>(selector)) tag.content = value;
}

/** Pages read their heading from here rather than restating it. */
export function useRouteMeta(): RouteMeta {
  const { pathname } = useLocation();
  return useMemo(() => resolveRouteMeta(pathname), [pathname]);
}

/** Called once, from the app shell - pages never set their own head. */
export function useRouteHead(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolveRouteMeta(pathname);
    const title = `${meta.title} - ${SITE_NAME}`;
    const canonical = meta.canonical ? `${SITE_ORIGIN}${meta.canonical}` : undefined;

    document.title = title;
    setMeta('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', meta.description);
    setMeta('meta[property="og:title"], meta[name="twitter:title"]', title);
    setMeta('meta[name="robots"]', robotsContent(meta.robots));
    setMeta('meta[property="og:url"]', canonical ?? `${SITE_ORIGIN}/`);

    // Replaced, not appended, so the previous route's structured data never lingers.
    for (const stale of document.querySelectorAll('link[rel="canonical"], script[type="application/ld+json"]')) {
      stale.remove();
    }
    if (canonical) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = canonical;
      document.head.appendChild(link);
    }
    for (const obj of meta.jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(obj);
      document.head.appendChild(script);
    }
  }, [pathname]);
}
