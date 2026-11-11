import type { ComponentProps } from 'react';
import { Link } from 'react-router';

// Colour and weight live on the variants, padding and type size on the sizes: two utilities for one property
// resolve by stylesheet order, not class order, so neither could be overridden from `className` (a `py-1`
// loses to a `py-2.5` whatever order they're written in). Size a button with `size`, never padding classes.
const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'border border-red-500/30 bg-red-500/5 text-red-600 hover:bg-red-500/15 dark:text-red-400',
} as const;

const sizes = {
  md: 'px-4 py-2.5 text-base sm:py-2 sm:text-sm',
  sm: 'px-3 py-1.5 text-sm sm:text-xs',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/** `type="button"` unless told otherwise: the HTML default is `submit`, which submits any enclosing form. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

/** Button styling on a router Link - for any action that navigates. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
