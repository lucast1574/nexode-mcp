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
    for (const name of ['nexode_deployment_requirements', 'nexode_me', 'nexode_plans', 'nexode_repositories', 'nexode_compute_create', 'nexode_compute_deploy_status', 'nexode_compute_set_env', 'nexode_compute_link_database', 'nexode_storage_get', 'nexode_compute_link_storage', 'nexode_n8n_restart']) {
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
