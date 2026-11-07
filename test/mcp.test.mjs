import { readFileSync } from 'node:fs';
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
    assert.equal(client.getServerVersion()?.version, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    await run(client);
  } finally {
    await client.close();
    api.close();
    await once(api, 'close');
  }
}

const data = result => JSON.parse(result.content[0].text);

test('current workspace API exposes packages and collaboration without retired app routes', async () => {
  const requests = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : undefined });
    res.setHeader('Content-Type', 'application/json'); res.end('{"data":[]}');
  }, async client => {
    const { tools } = await client.listTools();
    assert.ok(!tools.some(tool => tool.name.startsWith('nexode_n8n_')));
    for (const name of ['nexode_apps', 'nexode_app_create', 'nexode_app_update', 'nexode_app_connect', 'nexode_n8n_create', 'nexode_n8n_get', 'nexode_n8n_delete', 'nexode_shield_register_repo']) assert.ok(!tools.some(t => t.name === name));
    const create = tools.find(t => t.name === 'nexode_compute_create').inputSchema;
    assert.ok(!('app_id' in create.properties));
    assert.ok(!create.required.includes('project_name'));
    const cases = [
      ['nexode_workspaces', {}, 'GET', '/workspace'],
      ['nexode_pricing_catalog', {}, 'GET', '/billing/pricing'],
      ['nexode_credit_usage', {}, 'GET', '/billing/usage'],
      ['nexode_database_engines', {}, 'GET', '/databases/engines'],
      ['nexode_database_get', { id }, 'GET', `/databases/${id}`],
      ['nexode_database_metrics', { id, hours: 336 }, 'GET', `/databases/${id}/metrics?hours=336`],
      ['nexode_database_change_package', { id, package: 'standard' }, 'PUT', `/databases/${id}/package`, { package: 'standard' }],
      ['nexode_database_update_description', { id, description: '' }, 'PUT', `/databases/${id}/description`, { description: '' }],
      ['nexode_database_restart', { id }, 'POST', `/databases/${id}/restart`],
      ['nexode_domain_search', { query: 'my app' }, 'GET', '/domains/search?q=my%20app'],
      ['nexode_domain_add_dns', { id, type: 'MX', name: '', content: 'mail.example.com', ttl: 600, prio: 10 }, 'POST', `/domains/${id}/dns`, { type: 'MX', name: '', content: 'mail.example.com', ttl: 600, prio: 10 }],
      ['nexode_shield_repos', {}, 'GET', '/shield/repos'],
      ['nexode_shield_scan', { repo_id: id }, 'POST', '/shield/scans', { repo_id: id }],
      ['nexode_shield_get_scan', { id }, 'GET', `/shield/scans/${id}`],
      ['nexode_shield_findings', { id, severity: 'HIGH', only_new: true }, 'GET', `/shield/scans/${id}/findings?offset=0&limit=50&severity=HIGH&only_new=true&include_suppressed=false`],
      ['nexode_notifications', {}, 'GET', '/notifications'],
      ['nexode_notification_mark_viewed', { id }, 'POST', `/notifications/${id}/viewed`],
      ['nexode_notifications_mark_all_viewed', {}, 'POST', '/notifications/viewed'],
      ['nexode_support_tickets', { state: 'WAITING', page: 2 }, 'GET', '/support/tickets?page=2&state=WAITING'],
      ['nexode_support_create_ticket', { title: 'Database issue', description: 'Please inspect this database issue.', request_id: 'b43145e1-f526-4ee5-84eb-c43187a49541' }, 'POST', '/support/tickets', { title: 'Database issue', description: 'Please inspect this database issue.', requestId: 'b43145e1-f526-4ee5-84eb-c43187a49541' }],
    ];
    for (const [name, args, method, path, body] of cases) {
      assert.notEqual((await client.callTool({ name, arguments: args })).isError, true, name);
      assert.deepEqual(requests.at(-1), { method, path, body }, name);
    }
    const before = requests.length;
    for (const [name, args] of [
      ['nexode_database_metrics', { id, hours: 2 }],
      ['nexode_database_change_package', { id, package: 'ultra' }],
      ['nexode_support_create_ticket', { title: 'Issue', description: 'Please help me', request_id: 'not-a-uuid' }],
    ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true);
    assert.equal(requests.length, before);
    assert.match(client.getInstructions(), /prepaid_enabled/);
    assert.match(client.getInstructions(), /only on explicit user instruction/);
  });
});

test('service creation forwards package/version without app lookups or grouping hints', async () => {
  const requests = [];
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json'); res.end('{}');
  }, async client => {
    await client.callTool({ name: 'nexode_compute_create', arguments: { name: 'Demo backend', project_name: 'Demo', app_role: 'backend', type: 'BACKEND', provider: 'GITHUB', repository_url: 'https://github.com/example/app', package: 'ultra', port: 8080 } });
    assert.deepEqual(requests[0], { path: '/compute', body: { name: 'Demo backend', type: 'BACKEND', provider: 'GITHUB', repository_url: 'https://github.com/example/app', branch: 'main', package: 'ultra', port: 8080, subdomain: 'api-demo' } });
    await client.callTool({ name: 'nexode_database_create', arguments: { name: 'Demo data', type: 'postgres', version: '17', package: 'standard' } });
    assert.deepEqual(requests[1], { path: '/databases', body: { name: 'Demo data', type: 'postgres', version: '17', package: 'standard' } });
  });
});

test('build logs select the deployment safely and preserve actionable failure evidence', async () => {
  const paths = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp((req, res) => {
    paths.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ deployment: { id: 'failed', status: 'error', commitSha: 'abcdef123' },
      log_status: 'available', log: 'TypeError: Invalid URL; input: 0.0.0.0' }));
  }, async client => {
    const result = data(await client.callTool({ name: 'nexode_compute_build_logs', arguments: { id, deployment_id: 'failed/a?b', tail: 500 } }));
    assert.equal(paths[0], `/compute/${id}/build-logs?tail=500&deployment_id=failed%2Fa%3Fb`);
    assert.match(result.log, /Invalid URL/);
    assert.equal(result.deployment.commitSha, 'abcdef123');
    await client.callTool({ name: 'nexode_compute_build_logs', arguments: { id } });
    assert.equal(paths[1], `/compute/${id}/build-logs?tail=200`);
    for (const tail of [0, 2001, 1.5]) assert.equal((await client.callTool({ name: 'nexode_compute_build_logs', arguments: { id, tail } })).isError, true);
    assert.equal(paths.length, 2);
    assert.match(client.getInstructions(), /before editing code or redeploying/);
    assert.match(client.getInstructions(), /HOST may be an application URL/);
  });
});

test('first deploy defaults to the app name for landing, dashboard and API', async () => {
  const received = [];
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.method === 'GET' ? { name: 'Sheeplink' } : { generated_domain: JSON.parse(raw).subdomain + '.nexode.app' }));
  }, async client => {
    for (const [app_role, type, expected] of [['landing', 'FRONTEND', 'sheeplink'], ['frontend', 'FRONTEND', 'dashboard-sheeplink'], ['backend', 'BACKEND', 'api-sheeplink']]) {
      const result = await client.callTool({ name: 'nexode_compute_create', arguments: {
        name: 'ugly-repo-random123', project_name: 'Sheeplink', app_role, type, provider: 'GITHUB', repository_url: 'https://github.com/example/repo',
      } });
      assert.notEqual(result.isError, true);
      assert.equal(received.at(-1).body.subdomain, expected);
      assert.equal(data(result).generated_domain, expected + '.nexode.app');
    }
    assert.equal(received.filter(r => r.method === 'GET').length, 0);
    const result = await client.callTool({ name: 'nexode_compute_create', arguments: {
      name: 'custom', project_name: 'Sheeplink', type: 'FRONTEND', provider: 'GITHUB', repository_url: 'https://github.com/example/repo', custom_domain: 'www.example.org',
    } });
    assert.notEqual(result.isError, true);
    assert.equal(received.filter(r => r.method === 'GET').length, 0);
    assert.equal(received.at(-1).body.subdomain, undefined);
  });
});

test('rename supports nested platform names and reports collision errors without fallback', async () => {
  const received = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ path: req.url, method: req.method, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    if (JSON.parse(raw).subdomain === 'taken') { res.writeHead(400); res.end('{"message":"This subdomain is already in use."}'); }
    else res.end(JSON.stringify({ url: 'https://' + JSON.parse(raw).subdomain + '.nexode.app', https_status: 'pending_verification' }));
  }, async client => {
    for (const subdomain of ['sheeplink', 'dashboard-sheeplink', 'api-sheeplink']) {
      const result = await client.callTool({ name: 'nexode_compute_rename_subdomain', arguments: { id, subdomain } });
      assert.notEqual(result.isError, true);
      assert.equal(data(result).url, 'https://' + subdomain + '.nexode.app');
      assert.deepEqual(received.at(-1), { path: '/compute/' + id + '/subdomain', method: 'PUT', body: { subdomain } });
    }
    for (const subdomain of ['https://bad.nexode.app', 'a.b.c', '-bad', 'a'.repeat(64)]) {
      assert.equal((await client.callTool({ name: 'nexode_compute_rename_subdomain', arguments: { id, subdomain } })).isError, true);
    }
    assert.equal(received.length, 3);
    const conflict = await client.callTool({ name: 'nexode_compute_rename_subdomain', arguments: { id, subdomain: 'taken' } });
    assert.equal(conflict.isError, true); assert.match(conflict.content[0].text, /already in use/);
    assert.equal(received.length, 4);
    assert.match(client.getInstructions(), /ask the user what the project is called/i);
  });
});

test('MCP handshake, tools and scoped API errors', async () => {
  await withMcp((_req, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Invalid API key' })); }, async client => {
    assert.ok(client.getInstructions()?.length);
    const { tools } = await client.listTools();
    const names = tools.map(tool => tool.name);
    for (const name of ['nexode_workspaces', 'nexode_pricing_catalog', 'nexode_credit_usage', 'nexode_database_engines', 'nexode_deployment_requirements', 'nexode_me', 'nexode_github_connect_local', 'nexode_plans', 'nexode_repositories', 'nexode_compute_create', 'nexode_compute_deploy_status', 'nexode_compute_set_env', 'nexode_compute_link_database', 'nexode_storage_get', 'nexode_compute_link_storage']) {
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
        name: 'test-app', type, provider: 'GITHUB', repository_url: 'https://github.com/example/app', subdomain: 'test-app', ...(port ? { port } : {}),
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
    for (const name of ['nexode_me', 'nexode_workspaces', 'nexode_compute_list', 'nexode_database_list']) {
      assert.notEqual((await client.callTool({ name, arguments: {} })).isError, true, name);
    }
    assert.deepEqual(received.map(req => req.path), ['/me', '/workspace', '/compute', '/databases']);
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

test('local GitHub tool accepts no credentials and refuses configurable API hosts', async () => {
  let requests = 0;
  await withMcp((_req, res) => { requests++; res.end('{}'); }, async client => {
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === 'nexode_github_connect_local');
    assert.ok(tool);
    assert.ok(!tool.inputSchema?.properties?.token);
    const result = await client.callTool({ name: tool.name, arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /official Nexode HTTPS/);
    assert.equal(requests, 0);
  });
});

test('selected environment keys can be removed without passing credential values', async () => {
 let received;
 await withMcp(async (req,res)=>{let raw='';for await(const part of req)raw+=part;received={method:req.method,path:req.url,body:JSON.parse(raw)};res.end(JSON.stringify({removed:received.body.keys,redeploy_required:true}));},async client=>{
  const id='aaaaaaaaaaaaaaaaaaaaaaaa';const result=await client.callTool({name:'nexode_compute_unset_env',arguments:{id,keys:['SUPERADMIN_EMAIL','SUPERADMIN_PASSWORD']}});
  assert.notEqual(result.isError,true);assert.deepEqual(received,{method:'DELETE',path:'/compute/'+id+'/environment',body:{keys:['SUPERADMIN_EMAIL','SUPERADMIN_PASSWORD']}});
 });
});


test('purchased domain checkout and DNS inspection preserve backend states', async () => {
  const received = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.endsWith('/register')
      ? { domain: { _id: id, status: 'pending_payment' }, checkout_url: 'https://checkout.stripe.com/test' }
      : req.url.endsWith('/dns') ? { data: [{ type: 'ALIAS', content: 'nodes.nexode.app' }] }
      : { _id: id, status: 'active', dns_status: 'pending' }));
  }, async client => {
    const checkout = await client.callTool({ name: 'nexode_domain_register', arguments: { domain: 'example.org' } });
    assert.equal(data(checkout).domain.status, 'pending_payment');
    assert.equal(data(checkout).checkout_url, 'https://checkout.stripe.com/test');
    assert.equal(data(await client.callTool({ name: 'nexode_domain_get', arguments: { id } })).dns_status, 'pending');
    assert.equal(data(await client.callTool({ name: 'nexode_domain_dns', arguments: { id } })).data[0].type, 'ALIAS');
    assert.deepEqual(received, [
      { path: '/domains/register', method: 'POST', body: { domain: 'example.org' } },
      { path: '/domains/' + id, method: 'GET', body: null },
      { path: '/domains/' + id + '/dns', method: 'GET', body: null },
    ]);
    assert.match(client.getInstructions(), /dns_status=ready/);
    assert.match(client.getInstructions(), /Never use the worker's private LAN IP/);
  });
});

test('analytics tools return the real installation snippet and toggle without leaking keys', async () => {
  const received = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.method === 'GET' ? { enabled: false, script: `<script src="https://backend.nexode.app/api-v1/analytics/script.js" data-site="${id}"></script>` } : { enabled: JSON.parse(raw).enabled }));
  }, async client => {
    assert.match(client.getInstructions(), /Do not install or enable its script on new deployments/);
    const tools = await client.listTools();
    assert.ok(tools.tools.some(t => t.name === 'nexode_compute_analytics'));
    assert.ok(tools.tools.some(t => t.name === 'nexode_compute_configure_analytics'));
    for (const days of [undefined, 1, 30]) {
      const result = await client.callTool({ name: 'nexode_compute_analytics', arguments: { id, ...(days ? { days } : {}) } });
      assert.notEqual(result.isError, true);
      assert.match(data(result).script, new RegExp(`data-site="${id}"`));
      assert.equal(received.at(-1).path, `/compute/${id}/analytics?days=${days || 7}`);
    }
    for (const enabled of [true, false]) {
      const result = await client.callTool({ name: 'nexode_compute_configure_analytics', arguments: { id, enabled } });
      assert.deepEqual(data(result), { enabled });
      assert.deepEqual(received.at(-1), { method: 'PUT', path: `/compute/${id}/analytics`, body: { enabled } });
    }
    for (const args of [{ id, days: 365 }, { id: '../bad' }]) {
      assert.equal((await client.callTool({ name: 'nexode_compute_analytics', arguments: args })).isError, true);
    }
    assert.equal((await client.callTool({ name: 'nexode_compute_configure_analytics', arguments: { id, enabled: 'false' } })).isError, true);
    assert.equal(received.length, 5);
    assert.ok(!JSON.stringify(received).includes('nxd_live_'));
    const frontend = data(await client.callTool({ name: 'nexode_deployment_requirements', arguments: { type: 'FRONTEND' } }));
    assert.match(frontend.web_analytics, /Web analytics is being retired/);
    const backend = data(await client.callTool({ name: 'nexode_deployment_requirements', arguments: { type: 'BACKEND' } }));
    assert.equal(backend.web_analytics, undefined);
  });
});


test('current compute providers and private types forward validated payloads', async () => {
  const requests = [];
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json'); res.end('{}');
  }, async client => {
    const create = args => client.callTool({ name: 'nexode_compute_create', arguments: args });
    assert.notEqual((await create({ name: 'Worker', type: 'WORKER', provider: 'DOCKER', docker_image: 'example/jobs', docker_tag: '1', project_name: 'Example' })).isError, true);
    assert.deepEqual(requests[0], { path: '/compute', body: { name: 'Worker', type: 'WORKER', provider: 'DOCKER', docker_image: 'example/jobs', docker_tag: '1', branch: 'main' } });
    assert.notEqual((await create({ name: 'Internal', type: 'PRIVATE', provider: 'GITHUB', repository_url: 'https://github.com/example/api', build_type: 'railpack', root_directory: 'backend', port: 8080 })).isError, true);
    assert.equal(requests[1].body.port, 8080);
    assert.equal(requests[1].body.root_directory, 'backend');
    assert.equal(requests[1].body.subdomain, undefined);
    for (const args of [
      { type: 'BACKEND', provider: 'DOCKER' },
      { type: 'BACKEND', provider: 'GITHUB' },
      { type: 'BACKEND', provider: 'GITHUB', repository_url: 'https://example.com/github.com/repo' },
      { type: 'BACKEND', provider: 'GITHUB', repository_url: 'https://github.com.example.com/repo' },
      { type: 'BACKEND', provider: 'GITLAB', repository_url: 'https://user:secret@gitlab.com/org/repo' },
      { type: 'BACKEND', provider: 'GITHUB', repository_url: 'http://github.com/org/repo' },
      { type: 'WORKER', provider: 'DOCKER', docker_image: 'example/jobs', port: 4000 },
      { type: 'PRIVATE', provider: 'DOCKER', docker_image: 'example/api', subdomain: 'private' },
    ]) assert.equal((await create({ name: 'Invalid', ...args })).isError, true);
    assert.equal(requests.length, 2);
    const instructions = client.getInstructions();
    assert.match(instructions, /prepaid_enabled/);
    assert.match(instructions, /24-hour grace/);
    assert.match(instructions, /standalone n8n API was removed/);
    assert.match(instructions, /not guaranteed network isolation/);
    assert.doesNotMatch(instructions, /usage draws hourly|include automatic Nexode web analytics/);
  });
});

test('release manifests and launcher pins match the server version', () => {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  for (const path of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, version);
  }
  for (const path of ['.mcp.json', '.codex-plugin/plugin.json']) {
    assert.match(readFileSync(path, 'utf8'), new RegExp('nexode-mcp#v' + version.replaceAll('.', '\\.')));
  }
});


test('expanded operations use real SDK routes, encode identifiers and reject invalid inputs', async () => {
  const requests = [], id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  await withMcp(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : undefined });
    res.setHeader('Content-Type', 'application/json'); res.end('{}');
  }, async client => {
    const cases = [
      ['nexode_capabilities', {}, 'GET', '/'],
      ['nexode_stack_templates', {}, 'GET', '/stacks/templates'],
      ['nexode_stacks', {}, 'GET', '/stacks'],
      ['nexode_stack_create', { name: 'my-flows', template: 'n8n', variant: 'postgres', package: 'pro' }, 'POST', '/stacks', { name: 'my-flows', template: 'n8n', variant: 'postgres', package: 'pro' }],
      ['nexode_stack_get', { id }, 'GET', `/stacks/${id}`],
      ['nexode_stack_cancel', { id }, 'POST', `/stacks/${id}/cancel`],
      ['nexode_stack_delete', { id }, 'DELETE', `/stacks/${id}`],
      ['nexode_compute_set_paused', { id, paused: true }, 'PUT', `/compute/${id}/paused`, { paused: true }],
      ['nexode_compute_change_package', { id, package: 'ultra' }, 'PUT', `/compute/${id}/package`, { package: 'ultra' }],
      ['nexode_compute_update_build', { id, build_type: 'railpack', root_directory: 'backend' }, 'PUT', `/compute/${id}/build`, { build_type: 'railpack', root_directory: 'backend' }],
      ['nexode_compute_update_image', { id, docker_image: 'nginx', docker_tag: 'stable' }, 'PUT', `/compute/${id}/image`, { docker_image: 'nginx', docker_tag: 'stable' }],
      ['nexode_compute_add_volume', { id, mount_path: '/data' }, 'POST', `/compute/${id}/volumes`, { mount_path: '/data' }],
      ['nexode_compute_remove_volume', { id, mount_path: '/data' }, 'DELETE', `/compute/${id}/volumes`, { mount_path: '/data' }],
      ['nexode_compute_metrics', { id, hours: 12 }, 'GET', `/compute/${id}/metrics?hours=12`],
      ['nexode_compute_delete_domain', { id, domain_id: 'route/a?b' }, 'DELETE', `/compute/${id}/domains/route%2Fa%3Fb`],
      ['nexode_database_rotate_password', { id }, 'POST', `/databases/${id}/rotate-password`],
      ['nexode_database_unlock_writes', { id }, 'POST', `/databases/${id}/unlock-writes`],
      ['nexode_storage_buckets', {}, 'GET', '/storage/buckets'],
      ['nexode_storage_objects', { bucket: 'assets', prefix: 'a/b', continuation_token: 'a+b' }, 'GET', '/storage/objects?bucket=assets&prefix=a%2Fb&continuation_token=a%2Bb'],
      ['nexode_storage_create_key', { name: 'Read assets', bucket: 'assets', permission: 'read', prefix: 'public/', expires_in_days: 7 }, 'POST', '/storage/keys', { name: 'Read assets', bucket: 'assets', permission: 'read', prefix: 'public/', expires_in_days: 7 }],
      ['nexode_storage_upload_url', { bucket: 'assets', key: 'a/b.png', content_type: 'image/png' }, 'POST', '/storage/upload-url', { bucket: 'assets', key: 'a/b.png', content_type: 'image/png' }],
      ['nexode_storage_delete_object', { bucket: 'assets', key: 'a/b.png' }, 'DELETE', '/storage/objects', { bucket: 'assets', key: 'a/b.png' }],
      ['nexode_topup_checkout', { amount_usd: 25, upgrade: { kind: 'compute', id, package: 'pro' } }, 'POST', '/billing/topup-checkout', { amount_usd: 25, upgrade: { kind: 'compute', id, package: 'pro' } }],
      ['nexode_auto_topup', { enabled: false, max_per_month: 2 }, 'PUT', '/billing/auto-topup', { enabled: false, max_per_month: 2 }],
      ['nexode_subscription_preview', { id, plan_slug: 'nexode-pro' }, 'POST', `/subscriptions/${id}/preview`, { plan_slug: 'nexode-pro', billing_cycle: 'monthly' }],
      ['nexode_domain_delete_dns', { id, record_id: 'record/a' }, 'DELETE', `/domains/${id}/dns/record%2Fa`],
      ['nexode_shield_review_finding', { id, fingerprint: 'fp', reviewed: true }, 'PUT', `/shield/scans/${id}/reviewed`, { fingerprint: 'fp', reviewed: true }],
      ['nexode_shield_export', { id }, 'GET', `/shield/scans/${id}/export?format=sarif`],
      ['nexode_shield_suppress_finding', { id, fingerprint: 'fp', reason: 'Reviewed false positive' }, 'POST', `/shield/scans/${id}/suppressions`, { fingerprint: 'fp', reason: 'Reviewed false positive' }],
      ['nexode_github_branches', { owner: 'team', repo: 'a/b' }, 'GET', '/repositories/github/branches?owner=team&repo=a%2Fb'],
    ];
    for (const [name, args, method, path, body] of cases) {
      assert.notEqual((await client.callTool({ name, arguments: args })).isError, true, name);
      assert.deepEqual(requests.at(-1), { method, path, body }, name);
    }
    const before = requests.length;
    for (const [name, args] of [
      ['nexode_stack_create', { name: 'Invalid Name', template: 'n8n', variant: 'postgres' }],
      ['nexode_stack_create', { name: 'valid-name', template: 'n8n' }],
      ['nexode_compute_set_paused', { id, paused: 'false' }],
      ['nexode_storage_create_key', { name: 'x', permission: 'admin' }],
      ['nexode_topup_checkout', { amount_usd: 1 }],
      ['nexode_auto_topup', { enabled: true, max_per_month: 21 }],
      ['nexode_subscription_checkout', { plan_slug: 'nexode-pro', billing_cycle: 'annual' }],
    ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true, name);
    assert.equal(requests.length, before);
    assert.match(client.getInstructions(), /nexode_stack_templates/);
    assert.doesNotMatch(client.getInstructions(), /Stack creation is currently available in the dashboard/);
  });
});
