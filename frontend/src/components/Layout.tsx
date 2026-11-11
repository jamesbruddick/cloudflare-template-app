import { Link, Outlet, ScrollRestoration } from 'react-router';
import { useRouteHead } from '@/lib/use-head';

const { commit, dirty } = __BUILD_VERSION__;

export function Layout() {
  // Keeps the head correct across in-app navigation; pages never set their own metadata.
  useRouteHead();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      {/* The bypass mechanism (WCAG 2.4.1): first in the tab order, visible only on focus (index.css). */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* A new page starts at the top; Back and Forward return to where you were. */}
      <ScrollRestoration />
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-6 sm:px-6 sm:py-16">
        <header className="mb-8 flex items-center justify-between sm:mb-14">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">CA</div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Cloudflare App</span>
          </Link>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
            Development
          </span>
        </header>

        {/* The skip link's target; -1 so it can take focus without joining the tab order. */}
        <main id="main" tabIndex={-1} className="flex-1">
          <Outlet />
        </main>

        <footer className="mt-16 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>Hono</span>
          <span aria-hidden="true">·</span>
          <span>React 19</span>
          <span aria-hidden="true">·</span>
          <span>Vite</span>
          <span aria-hidden="true">·</span>
          <span>Tailwind CSS</span>
          {commit && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono" title="The commit this build came from">
                {commit}
                {dirty && '-dirty'}
              </span>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
