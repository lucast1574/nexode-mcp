import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP handshake, tools and scoped API errors', async () => {
  const client = new Client({ name: 'nexode-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, NEXODE_API_KEY: 'nxd_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    for (const name of ['nexode_me', 'nexode_plans', 'nexode_repositories', 'nexode_compute_create', 'nexode_compute_deploy_status', 'nexode_compute_set_env', 'nexode_compute_link_database', 'nexode_storage_get', 'nexode_compute_link_storage', 'nexode_n8n_restart']) {
      assert.ok(names.includes(name), `${name} missing`);
    }
    const result = await client.callTool({ name: 'nexode_me', arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Nexode 401/);
  } finally {
    await client.close();
  }
});
