const DEFAULT_API = 'https://backend.nexode.app/api-v1/sdk/v1';

export function apiConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = env.NEXODE_API_KEY?.trim();
  if (!key) throw new Error('NEXODE_API_KEY is required. Create one at https://cloud.nexode.app/dashboard/api-keys');
  const base = (env.NEXODE_API_URL || DEFAULT_API).replace(/\/+$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) {
    throw new Error('NEXODE_API_URL must use HTTPS (HTTP is allowed only for localhost)');
  }
  return { key, base };
}

export async function request(path: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}) {
  const { key, base } = apiConfig();
  const response = await fetch(`${base}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data
      ? String((data as { message: unknown }).message) : String(data).slice(0, 500);
    throw new Error(`Nexode ${response.status}: ${message}`);
  }
  return data;
}
