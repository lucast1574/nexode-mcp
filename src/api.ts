const DEFAULT_API = 'https://backend.nexode.app/api-v1/sdk/v1';

export function apiConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = env.NEXODE_API_KEY?.trim();
  if (!key) throw new Error('NEXODE_API_KEY is required. Set it in the MCP process environment and restart the client. Nexode browser login is not required.');
  const base = (env.NEXODE_API_URL || DEFAULT_API).replace(/\/+$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) {
    throw new Error('NEXODE_API_URL must use HTTPS (HTTP is allowed only for localhost)');
  }
  return { key, base };
}

export async function request(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}) {
  const { key, base } = apiConfig();
  const response = await fetch(`${base}${path}`, {
    method: init.method || 'GET',
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Nexode ${response.status}: API redirect refused. Check NEXODE_API_URL; use NEXODE_API_KEY for access, not a browser login.`);
  }
  const raw = await response.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: unknown }).message) : String(data).slice(0, 500);
    const hint = /missing required scope/i.test(message)
      ? 'Configure a key with the required scope. Nexode browser login is not required.'
      : response.status === 401
        ? 'Check NEXODE_API_KEY in the MCP environment; replace it if invalid, expired or revoked. Nexode browser login is not required.'
        : response.status === 403
          ? 'Check key scopes, resource permissions and plan limits. Nexode browser login does not replace these permissions.'
          : '';
    throw new Error(`Nexode ${response.status}: ${message}${hint ? ` ${hint}` : ''}`);
  }
  return data;
}

/** Keep API errors in MCP tool results without losing the server's explanation. */
export async function output(path: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await request(path, { method, body })) }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
  }
}
