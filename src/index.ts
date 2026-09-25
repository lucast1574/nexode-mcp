#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiConfig, request } from './api.js';

// Fail at startup so clients can show a useful configuration error.
try { apiConfig(); } catch (error) { console.error((error as Error).message); process.exit(1); }

const server = new McpServer({ name: 'nexode', version: '0.1.3' });
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
  description: 'Deploy a GitHub or GitLab repository as a frontend or backend. Nexode assigns the first free compute slot from active subscriptions. Repository must already exist and the Git provider must be connected. For a backend that needs S3, set connect_storage=true to provision its private bucket and inject S3 variables before the first deployment (requires storage:connect).',
  inputSchema: {
    name: z.string().min(3).max(50), type: z.enum(['FRONTEND', 'BACKEND']), provider: z.enum(['GITHUB', 'GITLAB']),
    repository_url: z.string().url(), branch: nonempty.default('main'),
    custom_domain: z.string().optional(), runtime: z.string().optional(), port: z.number().int().positive().optional(),
    health_check_path: z.string().optional(), env_content: z.string().optional(), connect_storage: z.boolean().optional(),
  },
}, async (input) => output('/compute', 'POST', input));
server.registerTool('nexode_compute_deploy_status', { description: 'Check the current deploy status for a compute instance.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/deploy-status`));
server.registerTool('nexode_compute_deployments', { description: 'List deployment history for a compute instance.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/deployments`));
server.registerTool('nexode_compute_diagnose', { description: 'Diagnose deployment, health endpoint, DNS and missing environment variables without returning secret values.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/diagnosis`));
server.registerTool('nexode_compute_rollback', {
  description: 'Roll back to a retained successful deployment image. This changes the live app; confirm the target deployment with the user first. Requires a rollback image in deployment history.',
  inputSchema: { id, deployment_id: nonempty },
}, async ({ id, deployment_id }) => output(`/compute/${id}/rollback`, 'POST', { deployment_id }));
server.registerTool('nexode_compute_previews', { description: 'List temporary branch or pull request previews, protected URL and expiry.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/previews`));
server.registerTool('nexode_compute_create_preview', {
  description: 'Create one isolated, password-protected preview for a branch or same-repository GitHub PR. Preview has no production environment variables, expires automatically, and uses temporary compute resources.',
  inputSchema: { id, branch: z.string().optional(), pull_request: z.number().int().positive().optional(), ttl_hours: z.number().int().min(1).max(72).default(24), env_content: z.string().optional() },
}, async ({ id, branch, pull_request, ttl_hours, env_content }) => output(`/compute/${id}/previews`, 'POST', { branch, pull_request, ttl_hours, env_content }));
server.registerTool('nexode_compute_delete_preview', { description: 'Delete a temporary preview and free its compute resources.', inputSchema: { id, preview_id: nonempty } }, async ({ id, preview_id }) => output(`/compute/${id}/previews/${encode(preview_id)}`, 'DELETE'));
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
server.registerTool('nexode_storage_get', {
  description: 'Inspect your Nexode S3 bucket, endpoint and plan quota without exposing credentials. Requires storage:read.',
}, async () => output('/storage'));
server.registerTool('nexode_compute_link_storage', {
  description: 'Provision S3 if needed and inject a dedicated, bucket-scoped S3 access key into an existing backend compute. Secret remains server-side. Idempotent unless rotate=true. Requires compute:write and storage:connect. Redeploy if redeploy_required is true.',
  inputSchema: { id, rotate: z.boolean().optional() },
}, async ({ id, rotate }) => output(`/compute/${id}/link-storage`, 'POST', { rotate }));
server.registerTool('nexode_compute_add_domain', { description: 'Attach a domain to a compute instance.', inputSchema: { id, host: nonempty, port: z.number().int().positive().optional(), https: z.boolean().optional() } }, async ({ id, host, port, https }) => output(`/compute/${id}/domains`, 'POST', { host, port, https }));

server.registerTool('nexode_database_list', { description: 'List database instances.' }, async () => output('/databases'));
server.registerTool('nexode_database_create', { description: 'Create a database in an available subscription slot, assigned automatically.', inputSchema: { name: z.string().min(3), type: z.enum(['postgres', 'mongodb', 'redis', 'mysql']) } }, async (input) => output('/databases', 'POST', input));
server.registerTool('nexode_database_backups', { description: 'List backup schedule, available restore points and last test restore for a database.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}/backups`));
server.registerTool('nexode_database_enable_backups', { description: 'Enable daily backups with seven retained copies for a PostgreSQL, MySQL or MongoDB database.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}/backups/enable`, 'POST'));
server.registerTool('nexode_database_backup_now', { description: 'Create a database backup now.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}/backups/run`, 'POST'));
server.registerTool('nexode_database_test_restore', { description: 'Restore a backup into a temporary database, verify that its tables or collections are readable, then remove it. Live data stays untouched.', inputSchema: { id, path: nonempty } }, async ({ id, path }) => output(`/databases/${id}/backups/restore`, 'POST', { path, confirmation: '', drill: true }));
server.registerTool('nexode_database_restore', { description: 'Replace the live database with an owned backup. This is destructive; confirm with the user first. confirmation must be the database name. A fresh backup is saved first.', inputSchema: { id, path: nonempty, confirmation: nonempty } }, async ({ id, path, confirmation }) => output(`/databases/${id}/backups/restore`, 'POST', { path, confirmation, drill: false }));
server.registerTool('nexode_database_browse', {
  description: 'List tables/collections or view up to 25 rows/documents in one Nexode database. Redis shows keys. Only the database owned by this API key is accessible.',
  inputSchema: { id, collection: z.string().optional(), offset: z.number().int().min(0).max(10000).default(0) },
}, async ({ id, collection, offset }) => output(`/databases/${id}/browser?offset=${offset}${collection ? `&collection=${encode(collection)}` : ''}`));
server.registerTool('nexode_database_update_value', {
  description: 'Edit one SQL cell, one MongoDB document field, or one Redis string value. SQL rows need a primary key; use nexode_database_browse to get collection, key and field. This changes live data.',
  inputSchema: { id, collection: nonempty, key: z.record(z.string(), z.any()), field: nonempty, value: z.any() },
}, async ({ id, collection, key, field, value }) => output(`/databases/${id}/browser/value`, 'PUT', { collection, key, field, value }));
server.registerTool('nexode_database_delete_record', {
  description: 'Permanently delete one SQL row, MongoDB document, or Redis key identified by its primary key. Confirm the exact record with the user first.',
  inputSchema: { id, collection: nonempty, key: z.record(z.string(), z.any()) },
}, async ({ id, collection, key }) => output(`/databases/${id}/browser/delete-record`, 'POST', { collection, key }));
server.registerTool('nexode_database_delete_field', {
  description: 'Permanently drop a SQL column from the entire table or unset one MongoDB document field. Confirm the exact target and impact with the user first.',
  inputSchema: { id, collection: nonempty, field: nonempty, key: z.record(z.string(), z.any()).optional() },
}, async ({ id, collection, field, key }) => output(`/databases/${id}/browser/delete-field`, 'POST', { collection, field, key }));
server.registerTool('nexode_database_delete', { description: 'Delete a database instance and its attached storage. This is irreversible.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}`, 'DELETE'));
server.registerTool('nexode_n8n_list', { description: 'List n8n instances.' }, async () => output('/n8n'));
server.registerTool('nexode_n8n_create', { description: 'Create an n8n instance in an automatically assigned subscription slot. Set both username and password to protect the public endpoint with edge authentication.', inputSchema: { name: nonempty, custom_domain: z.string().optional(), env_content: z.string().optional(), username: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(), password: z.string().min(12).optional() } }, async (input) => output('/n8n', 'POST', input));
server.registerTool('nexode_n8n_restart', { description: 'Redeploy an n8n instance and wait for it to become ready.', inputSchema: { id } }, async ({ id }) => output(`/n8n/${id}/restart`, 'POST'));
server.registerTool('nexode_domain_check', { description: 'Check domain availability.', inputSchema: { domain: nonempty } }, async ({ domain }) => output(`/domains/check?domain=${encode(domain)}`));
server.registerTool('nexode_domains', { description: 'List domains owned in Nexode.' }, async () => output('/domains'));
server.registerTool('nexode_shield_scans', { description: 'List recent Shield security scans.', inputSchema: { limit: z.number().int().min(1).max(200).default(20) } }, async ({ limit }) => output(`/shield/scans?limit=${limit}`));
server.registerTool('nexode_shield_scan_compute', { description: 'Start a Shield scan for a compute instance.', inputSchema: { compute_instance_id: id } }, async ({ compute_instance_id }) => output('/shield/scan-compute', 'POST', { compute_instance_id }));

await server.connect(new StdioServerTransport());
