// The one way the suite talks to the Worker, plus the shapes it asserts on.
import { SELF } from 'cloudflare:test';

export const ORIGIN = 'https://example.test';

/** A request to the Worker under test. Redirects are never followed, so a test sees the 3xx itself. */
export function request(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init });
}

/** A JSON POST, shaped the way the SPA sends one (same-origin). */
export function postJson(path: string, body: unknown, init: RequestInit = {}): Promise<Response> {
  return request(path, {
    method: 'POST',
    ...init,
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...init.headers },
    body: JSON.stringify(body),
  });
}

/** The envelope every failing endpoint answers with (`apiError`), and the code out of it. */
type ErrorBody = { success: false; error: { code: string; message: string } };
export const errorCode = async (res: Response): Promise<string> => (await res.json<ErrorBody>()).error.code;
