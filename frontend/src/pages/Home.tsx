import { useEffect, useState } from 'react';
import { AuthDemo } from '@/components/AuthDemo';
import { Card } from '@/components/ui';
import { client, failureText, unwrap } from '@/lib/api';

interface HealthState {
  status: string;
  timestamp: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [healthData, helloData] = await Promise.all([
          client.api.health.$get().then(res => unwrap<HealthState>(res)),
          client.api.hello.$get().then(res => unwrap<{ message: string }>(res)),
        ]);
        setHealth(healthData);
        setMessage(helloData.message);
      } catch (err) {
        setError(failureText(err));
      }
    }

    load();
  }, []);

  const loading = !error && !health;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Hono + React, running at the edge</h1>
      <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-400">
        A unified full-stack starter on Cloudflare Workers, with a type-safe RPC bridge between this page and the API below.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-8 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <svg
            className="mt-0.5 h-5 w-5 flex-none text-red-500 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <div>
            <p className="font-semibold">Request to the API failed</p>
            <p className="mt-0.5 text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div aria-live="polite" className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1].map(i => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mt-4 h-6 w-32 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mt-3 h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      {(health || message) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {health && (
            <Card>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">API Health</h2>
              </div>
              <p className="mt-3 text-2xl font-semibold capitalize">{health.status}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Checked{' '}
                {new Date(health.timestamp).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
            </Card>
          )}

          {message && (
            <Card>
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">GET /api/hello</h2>
              <p className="mt-3 text-lg font-medium text-balance">{message}</p>
            </Card>
          )}
        </div>
      )}

      <div className="mt-8">
        <AuthDemo />
      </div>
    </>
  );
}
