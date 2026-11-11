import type { Plugin } from 'vite';
// A `.ts` specifier: Vite's native config loader resolves nothing, so every file it reaches names itself.
import { ENTRY_POINTS, SITE_ORIGIN } from './src/shared/seo.ts';

/**
 * Drops HTML comments from the built shell. `index.html`'s comments are notes for whoever edits it, and every
 * visitor would otherwise download them with every page. Dev and build both serve the page without them, so
 * what you inspect locally is what ships. A comment on lines of its own goes with those lines.
 */
export function stripHtmlComments(): Plugin {
  return {
    name: 'strip-html-comments',
    transformIndexHtml: {
      order: 'post',
      handler: html => html.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n/gm, '').replace(/<!--[\s\S]*?-->/g, ''),
    },
  };
}

/**
 * `sitemap.xml`, generated from `ENTRY_POINTS` (the same list `crawlLinksFor` renders) into the client build,
 * so it's served off the CDN and can't drift from the route table.
 */
export function generateSitemap(): Plugin {
  return {
    name: 'generate-sitemap',
    applyToEnvironment: environment => environment.name === 'client',
    generateBundle() {
      const urls = ENTRY_POINTS.map(entry => `  <url><loc>${SITE_ORIGIN}${entry.href}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<!-- Generated from ENTRY_POINTS in src/shared/seo.ts by generateSitemap() - do not edit. -->',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          urls,
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}
