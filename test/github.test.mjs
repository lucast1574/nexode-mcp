import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectLocalGithub } from '../dist/github.js';
const token = 'gho_test_credential_only_for_tests';
const config = () => ({ base: 'https://backend.nexode.app/api-v1/sdk/v1', key: 'test-key' });
test('connects the local credential without tool arguments or secret outputs', async () => {
  const calls = [];
  const result = await connectLocalGithub({ config, readToken: async () => token, api: async (...args) => {
    calls.push(args); return { connected: true, username: 'test-user', github_id: '123', token };
  } });
  assert.deepEqual(calls, [['/me'], ['/repositories/github/connect', { method: 'POST', body: { token } }]]);
  assert.deepEqual(result, { connected: true, username: 'test-user', github_id: '123' });
  assert.ok(!JSON.stringify(result).includes(token));
});
test('refuses custom destinations before reading or sending local credentials', async () => {
  let touched = false;
  for (const base of ['https://example.com/api', 'http://127.0.0.1:3000', 'https://backend.nexode.app.evil.test/api-v1/sdk/v1']) {
    await assert.rejects(connectLocalGithub({ config: () => ({ base }), readToken: async () => { touched = true; }, api: async () => { touched = true; } }), /official Nexode/);
  }
  assert.equal(touched, false);
});
test('API authentication failure does not read local credentials and errors redact the token', async () => {
  await assert.rejects(connectLocalGithub({ config, readToken: async () => { throw new Error('unexpected read'); }, api: async () => { throw new Error('Invalid API key'); } }), /Invalid API key/);
  await assert.rejects(connectLocalGithub({ config, readToken: async () => token, api: async path => { if (path !== '/me') throw new Error('failed ' + token); } }), error => !error.message.includes(token));
});
