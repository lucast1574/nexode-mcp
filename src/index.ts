#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiConfig, request } from './api.js';
import { deploymentInstructions, deploymentRequirements } from './deployment.js';
import { connectLocalGithub } from './github.js';
import { projectSubdomain } from './naming.js';

// Fail at startup so clients can show a useful configuration error.
try { apiConfig(); } catch (error) { console.error((error as Error).message); process.exit(1); }

const server = new McpServer({ name: 'nexode', version: '0.1.12' }, { instructions: deploymentInstructions });
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

server.registerTool('nexode_deployment_requirements', {
  description: 'First step for deploying local application code: get Nexode Dockerfile, host, port and Git preparation requirements. The coding agent then creates/adapts the Dockerfile for the actual stack, tests it, commits and pushes using its local tools before creating or redeploying compute. This tool returns requirements; it does not edit files or push Git itself.',
  inputSchema: { type: z.enum(['FRONTEND', 'BACKEND']), port: z.number().int().min(1).max(65535).optional() },
}, async ({ type, port }) => ({ content: [{ type: 'text' as const, text: JSON.stringify(deploymentRequirements(type, port)) }] }));

server.registerTool('nexode_me', { description: 'Verify Nexode API-key access, identity and scopes. When this succeeds, operate directly through MCP; no dashboard or Google login is needed.' }, async () => output('/me'));
server.registerTool('nexode_github_connect_local', {
  description: 'Connect the GitHub CLI account already authenticated on this PC to the owner of NEXODE_API_KEY (requires compute:write). Reads gh auth token internally and transmits it only to the official Nexode HTTPS API for private repository deployments. Call when the user authorizes connecting their local GitHub; no token argument or browser login is needed. Refuses replacing a different connected GitHub identity. SSH-only Git authentication is insufficient.',
}, async () => {
  try { return { content: [{ type: 'text' as const, text: JSON.stringify(await connectLocalGithub()) }] }; }
  catch (error) { return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true }; }
});
server.registerTool('nexode_plans', { description: 'List current Nexode plan slugs, prices and resource slots.' }, async () => output('/subscriptions/plans'));
server.registerTool('nexode_subscriptions', { description: 'List active subscriptions and included slots.' }, async () => output('/subscriptions'));
server.registerTool('nexode_repositories', {
  description: 'List repositories from a GitHub or GitLab account connected to Nexode. Reuse existing provider authorization. Call only for repository discovery; a Nexode browser session is not required. Report missing provider authorization only if this operation actually fails.',
  inputSchema: { provider: z.enum(['github', 'gitlab']), organization: z.string().optional() },
}, async ({ provider, organization }) => output(`/repositories/${provider}${organization ? `?${provider === 'github' ? 'org' : 'group'}=${encode(organization)}` : ''}`));

server.registerTool('nexode_apps', { description: 'List visible apps, workspace/team assignments, all service cards and relationships detected from environment configuration. Secret values are never returned. Orphan services are automatically added to My Apps.', }, async () => output('/apps'));
server.registerTool('nexode_workspaces', { description: 'List your owned and joined workspaces. Each workspace contains at most one app, with three collaborators plus the owner in standard plans.' }, async () => output('/apps/workspaces'));
server.registerTool('nexode_app_create', {
  description: 'Create a visual app in My Apps, using a free owned workspace or creating one within plan capacity. Choose this app before deploying its services. One app per workspace.',
  inputSchema: { name: z.string().min(3).max(60), workspace_id: id.optional() },
}, async input => output('/apps', 'POST', input));
server.registerTool('nexode_app_update', {
  description: 'Assign an app to a free owned workspace or update its visual service grouping. This only changes grouping: no environment writes or redeploys. Use nexode_apps to inspect manually configured relationships.',
  inputSchema: { id, name: z.string().min(3).max(60).optional(), workspace_id: id.optional(), landing_id: id.nullable().optional(), frontend_id: id.nullable().optional(), backend_id: id.nullable().optional(), database_id: id.nullable().optional(), n8n_id: id.nullable().optional(), domain_id: id.nullable().optional(), use_storage: z.boolean().optional() },
}, async ({ id, ...input }) => output(`/apps/${id}`, 'PUT', input));
server.registerTool('nexode_app_connect', {
  description: 'Explicitly wire the selected app services, inject database/S3 variables server-side, and redeploy affected computes. Requires apps:write, compute:write, databases:connect and storage:connect. Inspect grouping first; this changes live infrastructure.',
  inputSchema: { id },
}, async ({ id }) => output(`/apps/${id}/connect`, 'POST'));

server.registerTool('nexode_compute_list', { description: 'List deployed frontend and backend compute instances.' }, async () => output('/compute'));
server.registerTool('nexode_compute_get', { description: 'Get a compute instance and its operational status.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}`));
server.registerTool('nexode_compute_rename_subdomain', {
  description: 'Rename the generated Nexode hostname of an existing running compute. Convention: landing sheeplink.nexode.app, frontend panel.sheeplink.nexode.app, backend api.sheeplink.nexode.app. Identify actual roles with nexode_apps and compute_list/get. Pass sheeplink, panel.sheeplink or api.sheeplink, not a URL/full hostname. Assign the base landing first; nested names require the same owner. Requires compute:write. Rejects occupied/reserved names and instances using custom domains. Preserves port, HTTPS settings, repo and infrastructure without rebuild. Old URL has no redirect. Verify every returned HTTPS URL before claiming success; nested names require matching DNS and certificates. Do not rewrite environment URLs automatically.',
  inputSchema: { id, subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?$/, 'Pass sheeplink, panel.sheeplink or api.sheeplink') },
}, async ({ id, subdomain }) => output(`/compute/${id}/subdomain`, 'PUT', { subdomain }));
server.registerTool('nexode_compute_create', {
  description: 'Deploy a GitHub/GitLab repo. First ask the user what the project is called (unless already stated), select/create its app using that name, and pass app_id. Default public names use the app name: landing <project>.nexode.app, frontend panel.<project>.nexode.app, backend api.<project>.nexode.app. Set app_role=landing for the commercial landing. Existing app namespaces are reused; subdomain overrides the default. Occupied names return an error; ask for another base rather than appending random repo suffixes. An explicit custom_domain takes precedence. First prepare/test the Dockerfile, commit/push and verify the remote SHA. Pass the actual container port (frontend 3000/backend 4000 defaults). Git provider must be connected. connect_storage=true injects private S3 variables for backends (storage:connect).',
  inputSchema: {
    name: z.string().min(3).max(50), type: z.enum(['FRONTEND', 'BACKEND']), provider: z.enum(['GITHUB', 'GITLAB']),
    repository_url: z.string().url(), branch: nonempty.default('main'), app_id: id, app_role: z.enum(['landing', 'frontend', 'backend']).optional(),
    subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?$/).optional(),
    custom_domain: z.string().optional(), runtime: z.string().optional(), port: z.number().int().min(1).max(65535).optional(),
    health_check_path: z.string().optional(), env_content: z.string().optional(), connect_storage: z.boolean().optional(),
  },
}, async (input) => {
  try {
    const role = input.app_role || (input.type === 'BACKEND' ? 'backend' : 'frontend');
    let subdomain = input.subdomain;
    if (!input.custom_domain && !subdomain) {
      const app = await request(`/apps/${input.app_id}`) as { name?: string; subdomain_base?: string };
      subdomain = projectSubdomain(app, role);
    }
    return await output('/compute', 'POST', { ...input, app_role: role, ...(subdomain ? { subdomain } : {}), port: deploymentRequirements(input.type, input.port).container_port });
  } catch (error) {
    return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
  }
});
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
server.registerTool('nexode_compute_redeploy', { description: 'Trigger a rebuild and redeployment of an existing compute instance. For local code changes, first check deployment requirements, preserve the existing compute port, prepare/test its Dockerfile, commit/push and verify the remote SHA.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/restart`, 'POST'));
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
server.registerTool('nexode_compute_domains', { description: 'Inspect the current routing hostnames and HTTPS settings of an owned compute. Use to verify or reconcile a subdomain rename; still test public DNS and HTTPS separately.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/domains`));

server.registerTool('nexode_database_list', { description: 'List database instances.' }, async () => output('/databases'));
server.registerTool('nexode_database_create', { description: 'Create a database in an available subscription slot, assigned automatically.', inputSchema: { name: z.string().min(3), type: z.enum(['postgres', 'mongodb', 'redis', 'mysql']), app_id: id.optional() } }, async (input) => output('/databases', 'POST', input));
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
server.registerTool('nexode_n8n_create', { description: 'Create an n8n instance in an automatically assigned subscription slot. Set both username and password to protect the public endpoint with edge authentication.', inputSchema: { name: nonempty, app_id: id.optional(), custom_domain: z.string().optional(), env_content: z.string().optional(), username: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(), password: z.string().min(12).optional() } }, async (input) => output('/n8n', 'POST', input));
server.registerTool('nexode_n8n_restart', { description: 'Redeploy an n8n instance and wait for it to become ready.', inputSchema: { id } }, async ({ id }) => output(`/n8n/${id}/restart`, 'POST'));
server.registerTool('nexode_domain_check', { description: 'Check domain availability.', inputSchema: { domain: nonempty } }, async ({ domain }) => output(`/domains/check?domain=${encode(domain)}`));
server.registerTool('nexode_domains', { description: 'List domains owned in Nexode.' }, async () => output('/domains'));
server.registerTool('nexode_domain_get', {
  description: 'Read one owned domain and its status. For an external domain pending verification, returns the exact DNS TXT challenge so setup can resume without re-adding the domain.',
  inputSchema: { id },
}, async ({ id }) => output(`/domains/${id}`));
server.registerTool('nexode_domain_add_external', {
  description: 'Add an already-owned domain bought at another registrar to Nexode. Requires domains:write. Returns pending_verification and the exact TXT record to create at the external DNS provider. This does not buy, transfer, activate the domain, change nameservers or configure routing. Use nexode_domains first to reuse an existing record.',
  inputSchema: { domain: z.string().min(3).max(253) },
}, async input => output('/domains/external', 'POST', input));
server.registerTool('nexode_domain_verify_external', {
  description: 'Check DNS TXT proof for an owned external domain after its returned verification record has been published. Requires domains:write. Only the backend can mark it active after the TXT matches; a missing/mismatched record or propagation delay remains pending. Routing to the app is a separate step.',
  inputSchema: { id },
}, async ({ id }) => output(`/domains/${id}/verify`, 'POST'));

server.registerTool('nexode_shield_scans', { description: 'List recent Shield security scans.', inputSchema: { limit: z.number().int().min(1).max(200).default(20) } }, async ({ limit }) => output(`/shield/scans?limit=${limit}`));
server.registerTool('nexode_shield_scan_compute', { description: 'Start a Shield scan for a compute instance.', inputSchema: { compute_instance_id: id } }, async ({ compute_instance_id }) => output('/shield/scan-compute', 'POST', { compute_instance_id }));

await server.connect(new StdioServerTransport());
