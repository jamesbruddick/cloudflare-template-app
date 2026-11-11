import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { client } from '@/lib/api';

export function AuthDemo() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function authenticate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const loginRes = await client.api.login.$post({}, { headers: { 'x-api-key': apiKey } });

      const loginBody = await loginRes.json();
      if ('error' in loginBody) {
        throw new Error(loginBody.error.message);
      }
      const { token } = loginBody;

      const protectedRes = await client.api.protected.$get({}, { headers: { Authorization: `Bearer ${token}` } });
      if (!protectedRes.ok) {
        throw new Error('Protected route rejected the token');
      }
      const { message } = await protectedRes.json();
      setResult(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Protected API demo</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Exchanges an API key for a short-lived JWT via <code>POST /api/login</code>, then calls <code>GET /api/protected</code> with it. Use the value from your{' '}
        <code>.dev.vars</code> file locally.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={e => {
          e.preventDefault();
          authenticate();
        }}>
        <label htmlFor="api-key" className="sr-only">
          API key
        </label>
        <Input id="api-key" name="apiKey" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API key" />
        <Button type="submit" disabled={loading || !apiKey} className="shrink-0">
          {loading ? 'Authenticating…' : 'Authenticate'}
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {result && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{result}</p>}
    </Card>
  );
}
