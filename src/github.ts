import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { apiConfig, request } from './api.js';

const exec = promisify(execFile);

export async function localGithubToken(): Promise<string> {
  try {
    const { stdout } = await exec('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 10000, maxBuffer: 65536 });
    const token = stdout.trim();
    if (token.length < 20 || token.length > 4096 || /\s/.test(token)) throw new Error();
    return token;
  } catch {
    // Child-process errors can include stdout/stderr containing credentials.
    throw new Error('GitHub CLI is unavailable or unauthenticated. Run gh auth login on this PC, then retry. SSH Git access alone cannot authorize Nexode.');
  }
}

export async function connectLocalGithub(deps = { config: apiConfig, readToken: localGithubToken, api: request }) {
  // Never send a local GitHub credential to a configurable third-party API host.
  if (deps.config().base !== 'https://backend.nexode.app/api-v1/sdk/v1') {
    throw new Error('Local GitHub connection requires the official Nexode HTTPS API URL.');
  }
  await deps.api('/me');
  const token = await deps.readToken();
  try {
    const result = await deps.api('/repositories/github/connect', { method: 'POST', body: { token } }) as { connected?: boolean; username?: string; github_id?: string };
    if (result.connected !== true || !result.username || !result.github_id) throw new Error('Nexode did not confirm the GitHub connection.');
    return { connected: true, username: result.username, github_id: result.github_id };
  } catch (error) {
    throw new Error((error instanceof Error ? error.message : 'GitHub connection failed.').replaceAll(token, '[redacted]'));
  }
}
