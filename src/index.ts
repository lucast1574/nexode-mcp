#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiConfig, request } from './api.js';

// Fail at startup so clients can show a useful configuration error.
try { apiConfig(); } catch (error) { console.error((error as Error).message); process.exit(1); }

const server = new McpServer({ name: 'nexode', version: '0.1.0' });
const output = async (path: string, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
  try {
    const data = await request(path, { method, body });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
  }
};
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a Nexode resource ID');
const nonempty = z.string().min(1);
const encode = (value: string) => encodeURIComponent(value);

server.registerTool('nexode_me', { description: 'Check Nexode API key, identity and scopes.' }, async () => output('/me'));
server.registerTool('nexode_plans', { description: 'List current Nexode plan slugs, prices and resource slots.' }, async () => output('/subscriptions/plans'));
server.registerTool('nexode_subscriptions', { description: 'List active subscriptions and included slots.' }, async () => output('/subscriptions'));
server.registerTool('nexode_repositories', {
  description: 'List repositories from a GitHub or GitLab account connected to Nexode. Connect accounts in the Nexode dashboard first.',
  inputSchema: { provider: z.enum(['github', 'gitlab']), organization: z.string().optional() },
}, async ({ provider, organization }) => output(`/repositories/${provider}${organization ? `?${provider === 'github' ? 'org' : 'group'}=${encode(organization)}` : ''}`));

server.registerTool('nexode_compute_list', { description: 'List deployed frontend and backend compute instances.' }, async () => output('/compute'));
server.registerTool('nexode_compute_get', { description: 'Get a compute instance and its operational status.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}`));
server.registerTool('nexode_compute_create', {
  description: 'Deploy a GitHub or GitLab repository as a frontend or backend. Requires an active plan with a free compute slot; plan_slug comes from nexode_plans. Repository must already exist and the Git provider must be connected.',
  inputSchema: {
    name: z.string().min(3).max(50), type: z.enum(['FRONTEND', 'BACKEND']), provider: z.enum(['GITHUB', 'GITLAB']),
    repository_url: z.string().url(), branch: nonempty.default('main'), plan_slug: nonempty,
    custom_domain: z.string().optional(), runtime: z.string().optional(), port: z.number().int().positive().optional(),
    health_check_path: z.string().optional(), env_content: z.string().optional(),
  },
}, async (input) => output('/compute', 'POST', input));
server.registerTool('nexode_compute_deploy_status', { description: 'Check the current deploy status for a compute instance.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/deploy-status`));
server.registerTool('nexode_compute_deployments', { description: 'List deployment history for a compute instance.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/deployments`));
server.registerTool('nexode_compute_logs', { description: 'Read recent compute logs to diagnose a deployment.', inputSchema: { id, tail: z.number().int().min(1).max(2000).default(200) } }, async ({ id, tail }) => output(`/compute/${id}/logs?tail=${tail}`));
server.registerTool('nexode_compute_redeploy', { description: 'Trigger a rebuild and redeployment of an existing compute instance.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/restart`, 'POST'));
server.registerTool('nexode_compute_set_env', {
  description: 'Merge environment variables into a compute instance without returning secret values. Requires compute:write. Redeploy after changing variables.',
  inputSchema: { id, variables: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(8192)) },
}, async ({ id, variables }) => output(`/compute/${id}/environment`, 'PUT', { variables }));
server.registerTool('nexode_compute_link_database', {
  description: 'Set a compute environment variable to a Nexode database connection URI without revealing the URI to the agent. Requires compute:write and databases:connect. Redeploy afterward.',
  inputSchema: { id, database_id: id, variable_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional() },
}, async ({ id, database_id, variable_name }) => output(`/compute/${id}/link-database`, 'POST', { database_id, variable_name }));
server.registerTool('nexode_compute_add_domain', { description: 'Attach a domain to a compute instance.', inputSchema: { id, host: nonempty, port: z.number().int().positive().optional(), https: z.boolean().optional() } }, async ({ id, host, port, https }) => output(`/compute/${id}/domains`, 'POST', { host, port, https }));

server.registerTool('nexode_database_list', { description: 'List database instances.' }, async () => output('/databases'));
server.registerTool('nexode_database_create', { description: 'Create a database in an available subscription slot.', inputSchema: { name: z.string().min(3), type: z.enum(['postgres', 'mongodb', 'redis', 'mysql']), plan_slug: nonempty } }, async (input) => output('/databases', 'POST', input));
server.registerTool('nexode_n8n_list', { description: 'List n8n instances.' }, async () => output('/n8n'));
server.registerTool('nexode_n8n_create', { description: 'Create an n8n instance in an available subscription slot.', inputSchema: { name: nonempty, plan_slug: nonempty, custom_domain: z.string().optional(), env_content: z.string().optional() } }, async (input) => output('/n8n', 'POST', input));
server.registerTool('nexode_domain_check', { description: 'Check domain availability.', inputSchema: { domain: nonempty } }, async ({ domain }) => output(`/domains/check?domain=${encode(domain)}`));
server.registerTool('nexode_domains', { description: 'List domains owned in Nexode.' }, async () => output('/domains'));
server.registerTool('nexode_shield_scans', { description: 'List recent Shield security scans.', inputSchema: { limit: z.number().int().min(1).max(200).default(20) } }, async ({ limit }) => output(`/shield/scans?limit=${limit}`));
server.registerTool('nexode_shield_scan_compute', { description: 'Start a Shield scan for a compute instance.', inputSchema: { compute_instance_id: id } }, async ({ compute_instance_id }) => output('/shield/scan-compute', 'POST', { compute_instance_id }));

await server.connect(new StdioServerTransport());
