import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function withMcp(handler, run) {
  const api = createServer(handler);
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const client = new Client({ name: 'nexode-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, NEXODE_API_KEY: 'nxd_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456', NEXODE_API_URL: `http://127.0.0.1:${api.address().port}` },
  });
  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
    api.close();
    await once(api, 'close');
  }
}

const data = result => JSON.parse(result.content[0].text);

test('MCP handshake, tools and scoped API errors', async () => {
  await withMcp((_req, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Invalid API key' })); }, async client => {
    assert.ok(client.getInstructions()?.length);
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name);
    for (const name of ['nexode_apps', 'nexode_workspaces', 'nexode_app_create', 'nexode_app_update', 'nexode_app_connect', 'nexode_deployment_requirements', 'nexode_me', 'nexode_plans', 'nexode_repositories', 'nexode_compute_create', 'nexode_compute_deploy_status', 'nexode_compute_set_env', 'nexode_compute_link_database', 'nexode_storage_get', 'nexode_compute_link_storage', 'nexode_n8n_restart']) {
      assert.ok(names.includes(name), `${name} missing`);
    }
    const result = await client.callTool({ name: 'nexode_me', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Nexode 401/);
  });
});

test('preparation reports the container contract without creating cloud resources', async () => {
  let requests = 0;
  await withMcp((_req, res) => { requests++; res.end('{}'); }, async client => {
    for (const [type, port, expected] of [['FRONTEND', undefined, 3000], ['BACKEND', undefined, 4000], ['BACKEND', 8080, 8080]]) {
      const result = data(await client.callTool({ name: 'nexode_deployment_requirements', arguments: { type, ...(port ? { port } : {}) } }));
      assert.equal(result.container_port, expected);
      assert.equal(result.container_host, '0.0.0.0');
      assert.equal(result.dockerfile, 'Dockerfile');
      assert.equal(result.build_context, '.');
      assert.equal(result.build_type, 'dockerfile');
    }
    for (const port of [0, 65536, 3000.5]) {
      const result = await client.callTool({ name: 'nexode_deployment_requirements', arguments: { type: 'FRONTEND', port } });
      assert.equal(result.isError, true);
    }
    assert.equal(requests, 0);
  });
});

test('compute creation forwards the exact prepared port including defaults', async () => {
  const received = [];
  await withMcp(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    received.push({ path: req.url, method: req.method, body: JSON.parse(raw) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: '0123456789abcdef01234567' }));
  }, async client => {
    for (const [type, port] of [['FRONTEND', undefined], ['BACKEND', undefined], ['FRONTEND', 8080]]) {
      const result = await client.callTool({ name: 'nexode_compute_create', arguments: {
        name: 'test-app', type, provider: 'GITHUB', repository_url: 'https://github.com/example/app', ...(port ? { port } : {}),
      } });
      assert.notEqual(result.isError, true);
    }
    assert.deepEqual(received.map(r => r.body.port), [3000, 4000, 8080]);
    assert.ok(received.every(r => r.path === '/compute' && r.method === 'POST' && r.body.branch === 'main'));
    const invalid = await client.callTool({ name: 'nexode_compute_create', arguments: {
      name: 'test-app', type: 'BACKEND', provider: 'GITHUB', repository_url: 'https://github.com/example/app', port: 65536,
    } });
    assert.equal(invalid.isError, true);
    assert.equal(received.length, 3);
  });
});


test('app/workspace tools and service creation keep explicit app assignments', async () => {
  const received = [];
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [] }));
  }, async client => {
    const app_id = 'aaaaaaaaaaaaaaaaaaaaaaaa', workspace_id = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    for (const [name, args] of [
      ['nexode_apps', {}], ['nexode_workspaces', {}],
      ['nexode_app_create', { name: 'Demo app', workspace_id }],
      ['nexode_app_update', { id: app_id, workspace_id }],
      ['nexode_compute_create', { name: 'Demo landing', type: 'FRONTEND', provider: 'GITHUB', repository_url: 'https://github.com/example/app', app_id, app_role: 'landing' }],
      ['nexode_database_create', { name: 'Demo data', type: 'postgres', app_id }],
      ['nexode_n8n_create', { name: 'Demo flows', app_id }],
    ]) assert.notEqual((await client.callTool({ name, arguments: args })).isError, true);
    assert.deepEqual(received.slice(0, 4).map(r => [r.method, r.path]), [['GET', '/apps'], ['GET', '/apps/workspaces'], ['POST', '/apps'], ['PUT', '/apps/' + app_id]]);
    assert.deepEqual(received[2].body, { name: 'Demo app', workspace_id });
    assert.deepEqual(received[3].body, { workspace_id });
    assert.ok(received.slice(4).every(r => r.body.app_id === app_id));
    assert.equal(received[4].body.app_role, 'landing');
  });
});

test('a configured API key operates Nexode without a browser session or login requests', async () => {
  const received = [];
  await withMcp((req, res) => {
    received.push({ path: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (req.headers.authorization !== 'Bearer nxd_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' || req.headers.cookie) {
      res.writeHead(401); res.end('{"message":"API key required"}'); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/me' ? { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', scopes: ['*'] } : { data: [] }));
  }, async client => {
    for (const name of ['nexode_me', 'nexode_apps', 'nexode_compute_list', 'nexode_database_list', 'nexode_n8n_list']) {
      assert.notEqual((await client.callTool({ name, arguments: {} })).isError, true, name);
    }
    assert.deepEqual(received.map(req => req.path), ['/me', '/apps', '/compute', '/databases', '/n8n']);
    assert.ok(received.every(req => req.cookie === undefined));
  });
});

test('API login redirects are rejected rather than followed', async () => {
  const received = [];
  await withMcp((req, res) => {
    received.push(req.url);
    if (req.url === '/me') { res.writeHead(302, { Location: '/auth/login' }); res.end(); }
    else { res.writeHead(200); res.end('Login page'); }
  }, async client => {
    const result = await client.callTool({ name: 'nexode_me', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Nexode 302/);
    assert.deepEqual(received, ['/me']);
  });
});

test('scope failures identify the permission without exposing the configured key', async () => {
  await withMcp((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'API key missing required scope: compute:write' }));
  }, async client => {
    const result = await client.callTool({ name: 'nexode_compute_redeploy', arguments: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /compute:write/);
    assert.doesNotMatch(result.content[0].text, /ABCDEFGHIJKLMNOPQRSTUVWXYZ123456/);
  });
});

test('external domain tools resume TXT verification without purchase or DNS mutation', async () => {
  const requests = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa'; let published = false;
  const pending = { _id: id, domain: 'example.com.pe', source: 'external', status: 'pending_verification', verification: { type: 'TXT', name: '_nexode-verify.example.com.pe', value: 'nexode-verification=demo' } };
  await withMcp(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    requests.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/verify') && !published) { res.writeHead(400); res.end(JSON.stringify({ message: 'TXT record not found; DNS propagation pending' })); }
    else res.end(JSON.stringify(req.url.endsWith('/verify') ? { ...pending, status: 'active', verification: null } : pending));
  }, async client => {
    const added = data(await client.callTool({ name: 'nexode_domain_add_external', arguments: { domain: 'example.com.pe' } }));
    assert.deepEqual(added.verification, pending.verification); assert.equal(added.status, 'pending_verification');
    assert.deepEqual(data(await client.callTool({ name: 'nexode_domain_get', arguments: { id } })), pending);
    assert.equal((await client.callTool({ name: 'nexode_domain_verify_external', arguments: { id } })).isError, true);
    published = true;
    const verified = data(await client.callTool({ name: 'nexode_domain_verify_external', arguments: { id } }));
    assert.equal(verified.status, 'active'); assert.equal(verified.verification, null);
    assert.deepEqual(requests.map(r => [r.method, r.path]), [['POST', '/domains/external'], ['GET', `/domains/${id}`], ['POST', `/domains/${id}/verify`], ['POST', `/domains/${id}/verify`]]);
    assert.deepEqual(requests[0].body, { domain: 'example.com.pe' });
  });
});
