import type { AppContext } from '../types/env';

type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 429 | 500 | 503;

/**
 * Every endpoint's error shape: a stable `code` for code to branch on, and a human `message`. The return
 * type is left to inference on purpose - it's a `TypedResponse`, so `hc` clients see the envelope.
 */
export function apiError<S extends ErrorStatus>(c: AppContext, status: S, code: string, message: string) {
  return c.json({ success: false as const, error: { code, message } }, status);
}

/** Every API 404, the unknown-path catch-alls included, so a missing route and a hidden one read the same. */
export function notFound(c: AppContext) {
  return apiError(c, 404, 'not_found', 'Not found.');
}

/** Text or attribute content in HTML the Worker writes (the document head and crawler body). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
