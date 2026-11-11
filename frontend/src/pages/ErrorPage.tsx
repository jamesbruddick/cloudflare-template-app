import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui';
import NotFound from '@/pages/NotFound';

/**
 * A crash, in words a visitor can act on - never the error's own message, which is a developer's text and
 * can carry internals. Uses no router API, so `ErrorBoundary` (outside the router) renders it too.
 * `standalone` when nothing else is on screen: it then brings its own page surface and `<main>`.
 */
export function CrashPage({ standalone = false }: { standalone?: boolean }) {
  const content = (
    <div className="py-10">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">500</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Something went wrong</h1>
      <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-400">This page hit an unexpected error. Reloading usually clears it.</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
  if (!standalone) return content;
  return (
    <main id="main" tabIndex={-1} className="mx-auto min-h-dvh max-w-3xl px-5 py-6 sm:px-6 sm:py-16">
      {content}
    </main>
  );
}

/**
 * The routes' `errorElement`. React Router catches everything a route throws (render errors and loader
 * failures) before any React error boundary sees it, and without this renders its own developer screen.
 */
export function RouteCrashPage({ standalone = false }: { standalone?: boolean }) {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  console.error('Route error:', error);
  return <CrashPage standalone={standalone} />;
}
