import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { errorCode, postJson, request } from './helpers';

describe('Worker API Routes', () => {
  it('GET /api/health returns 200 and reads the migrated schema', async () => {
    const response = await request('/api/health');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    // Written by migrations/0001, so this proves tests/setup.ts applied them.
    expect(data).toHaveProperty('schema', '1');
  });

  it('GET /api/health returns a valid ISO timestamp', async () => {
    const response = await request('/api/health');
    const data = await response.json<{ timestamp: string }>();
    const parsed = new Date(data.timestamp);
    expect(parsed.toISOString()).toBe(data.timestamp);
  });

  it('GET /api/hello returns a greeting message', async () => {
    const response = await request('/api/hello');
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('message');
  });

  it('answers an unknown API path with the JSON 404 envelope, not the document shell', async () => {
    const response = await request('/api/no-such-route');
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('answers a non-GET to an unknown path with the same 404', async () => {
    const response = await request('/no-such-thing', { method: 'DELETE' });
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('POST /api/login rejects a request with no API key header', async () => {
    const response = await request('/api/login', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('invalid_api_key');
  });

  it('POST /api/login rejects an invalid API key', async () => {
    const response = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(response.status).toBe(401);
  });

  it('POST /api/login issues a JWT for a valid API key', async () => {
    const response = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key' },
    });
    expect(response.status).toBe(200);

    const data = await response.json<{ token: string; expiresIn: number }>();
    expect(typeof data.token).toBe('string');
    expect(data.expiresIn).toBeGreaterThan(0);
  });

  it('GET /api/protected rejects requests without a token, in the error envelope', async () => {
    // The JWT middleware throws a plain-text 401; onError re-shapes it so clients `unwrap` it like any other.
    const response = await request('/api/protected');
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('unauthorized');
  });

  it('GET /api/protected rejects a malformed Bearer token', async () => {
    const response = await request('/api/protected', {
      headers: { Authorization: 'Bearer not.a.valid.jwt' },
    });
    expect(response.status).toBe(401);
  });

  it('GET /api/protected accepts a token minted by /api/login', async () => {
    const loginResponse = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key' },
    });
    const { token } = await loginResponse.json<{ token: string }>();

    const response = await request('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);

    const data = await response.json<{ payload: Record<string, unknown> }>();
    expect(data.payload).toHaveProperty('sub', 'demo-client');
  });
});

describe('Request guards', () => {
  it('refuses a cross-site POST', async () => {
    const response = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key', 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('cross_origin');
  });

  it('refuses a POST from a foreign Origin when Sec-Fetch-Site is absent', async () => {
    const response = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key', Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });

  it('accepts a same-origin POST and one with neither header (curl)', async () => {
    const browser = await request('/api/login', {
      method: 'POST',
      headers: { 'x-api-key': 'test-api-key', 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(browser.status).toBe(200);
    const curl = await request('/api/login', { method: 'POST', headers: { 'x-api-key': 'test-api-key' } });
    expect(curl.status).toBe(200);
  });

  it('rejects an oversized body before any handler parses it', async () => {
    const response = await postJson('/api/login', { padding: 'x'.repeat(70 * 1024) });
    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe('payload_too_large');
  });
});

describe('Security Headers', () => {
  it('locks API responses down to default-src none, with no nonce', async () => {
    const response = await request('/api/health');
    const csp = response.headers.get('Content-Security-Policy');
    // JSON loads and executes nothing, so the API CSP is strictly tighter than the document one.
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).not.toContain('nonce-');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('keeps the API out of the index, where no meta tag can reach', async () => {
    const response = await request('/api/health');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('sets Strict-Transport-Security with preload over https', async () => {
    const response = await request('/api/health');
    const hsts = response.headers.get('Strict-Transport-Security');
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('omits Strict-Transport-Security over plain http', async () => {
    // Plain-http LAN dev must not pin the host for a year. SELF.fetch honours the scheme it is given.
    const response = await SELF.fetch('http://localhost/api/health');
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('defaults API responses to no-store', async () => {
    const response = await request('/api/health');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets the hardening headers', async () => {
    const response = await request('/api/health');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy restricting sensitive features', async () => {
    const policy = (await request('/api/health')).headers.get('Permissions-Policy') ?? '';
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it('puts a fresh 16-byte script nonce on every document', async () => {
    const nonceOf = async (path: string) => {
      const csp = (await request(path)).headers.get('Content-Security-Policy') ?? '';
      return /script-src [^;]*'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
    };
    const first = await nonceOf('/');
    expect(first).toBeDefined();
    // A short or predictable value defeats the point of a nonce.
    expect(atob(first ?? '')).toHaveLength(16);
    expect(await nonceOf('/')).not.toBe(first);
  });

  it('keeps the asset CSP in step with the document CSP', async () => {
    // Documents (Worker) and static files (_headers) must carry the same policy; only the nonce may differ.
    const documentCsp = (await request('/')).headers.get('Content-Security-Policy') ?? '';
    const assetCsp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(env.TEST_ASSET_HEADERS)?.[1]?.trim();

    expect(assetCsp).toBeDefined();
    expect(documentCsp.replace(/'nonce-[^']+' ?/, '')).toBe(assetCsp);
  });
});
