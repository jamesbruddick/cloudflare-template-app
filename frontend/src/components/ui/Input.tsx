import type { ComponentProps } from 'react';

// No `focus:outline-none`: the global :focus-visible ring (index.css) is the indicator - a border tint alone
// fails WCAG 1.4.11.
const base =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${base} ${className}`} {...props} />;
}
