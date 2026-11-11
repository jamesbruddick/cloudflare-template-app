import type { AppType } from '@worker';
import { hc } from 'hono/client';

/**
 * `AppType` is the Worker's accumulated route table, so request and response shapes are inferred from the
 * handlers themselves and a breaking endpoint change fails at typecheck. Don't replace with typed fetch.
 */
export const client = hc<AppType>('/');

/** The failure envelope every endpoint returns (`apiError` in src/http/helpers.ts). */
type ApiErrorBody = { success: false; error: { code: string; message: string } };

/** Thrown by `unwrap`. Messages from the API are written for visitors, so callers can show `message` as-is. */
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export const GENERIC_FAILURE = 'Something went wrong. Please try again.';

/** What to show for any caught error: the server's own message, else the generic line (never a stack or a bug's text). */
export function failureText(err: unknown): string {
  return err instanceof ApiFailure ? err.message : GENERIC_FAILURE;
}

/** Structural rather than `Response`: Hono's `ClientResponse` carries the payload type, not the rest. */
type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

/**
 * The success body, or an `ApiFailure` thrown from the error envelope - so call sites never re-check
 * `ok` or `'error' in body`. Pass the success type: `unwrap<{ token: string }>(res)`.
 */
export async function unwrap<T>(res: JsonResponse): Promise<T> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = body as ApiErrorBody | null;
    throw new ApiFailure(err?.error?.code ?? 'request_failed', err?.error?.message ?? GENERIC_FAILURE, res.status);
  }
  return body as T;
}
