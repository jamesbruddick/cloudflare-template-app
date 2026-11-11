import { ButtonLink } from '@/components/ui';
import { useRouteMeta } from '@/lib/use-head';

export default function NotFound() {
  const { h1 } = useRouteMeta();
  return (
    <div className="py-10">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{h1}</h1>
      <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-400">
        The Worker answered this URL with a real 404 status, then the client-side router matched it here.
      </p>
      <ButtonLink to="/" className="mt-6">
        Back home
      </ButtonLink>
    </div>
  );
}
