#!/usr/bin/env node
import { registerStorageTools } from './storage-tools.js';
import { registerShieldTools } from './shield-tools.js';
import { registerOperationsTools } from './operations-tools.js';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiConfig, output } from './api.js';
import { deploymentInstructions, deploymentRequirements } from './deployment.js';
import { connectLocalGithub } from './github.js';
import { projectSubdomain } from './naming.js';
import { registerPlatformTools } from './platform-tools.js';

// Fail at startup so clients can show a useful configuration error.
try { apiConfig(); } catch (error) { console.error((error as Error).message); process.exit(1); }

const server = new McpServer({ name: 'nexode', version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version }, { instructions: deploymentInstructions });
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a Nexode resource ID');
const nonempty = z.string().min(1);
const encode = (value: string) => encodeURIComponent(value);

server.registerTool('nexode_deployment_requirements', {
  description: 'First step for deploying local application code: get Nexode Dockerfile, host, port and Git preparation requirements. The coding agent then creates/adapts the Dockerfile for the actual stack, tests it, commits and pushes using its local tools before creating or redeploying compute. This tool returns requirements; it does not edit files or push Git itself.',
  inputSchema: { type: z.enum(['FRONTEND', 'BACKEND', 'WORKER', 'PRIVATE']), port: z.number().int().min(1).max(65535).optional() },
}, async ({ type, port }) => ({ content: [{ type: 'text' as const, text: JSON.stringify(deploymentRequirements(type, port)) }] }));

server.registerTool('nexode_me', { description: 'Verify Nexode API-key access, identity and scopes. When this succeeds, operate directly through MCP; no dashboard or Google login is needed.' }, async () => output('/me'));
server.registerTool('nexode_github_connect_local', {
  description: 'Connect the GitHub CLI account already authenticated on this PC to the owner of NEXODE_API_KEY (requires compute:write). Reads gh auth token internally and transmits it only to the official Nexode HTTPS API for private repository deployments. Call when the user authorizes connecting their local GitHub; no token argument or browser login is needed. Refuses replacing a different connected GitHub identity. SSH-only Git authentication is insufficient.',
}, async () => {
  try { return { content: [{ type: 'text' as const, text: JSON.stringify(await connectLocalGithub()) }] }; }
  catch (error) { return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true }; }
});
server.registerTool('nexode_plans', { description: 'List Nexode plans, monthly credits, prices and features. Only credit plans are sold; legacy bundles remain for existing subscribers.' }, async () => output('/subscriptions/plans'));
server.registerTool('nexode_subscriptions', { description: 'List subscriptions in the API key workspace and their credit or legacy bundle entitlements. Coupons, including 100% discounts, do not by themselves remove active plan entitlements.' }, async () => output('/subscriptions'));
server.registerTool('nexode_repositories', {
  description: 'List repositories from a GitHub or GitLab account connected to Nexode. Reuse existing provider authorization. Call only for repository discovery; a Nexode browser session is not required. Report missing provider authorization only if this operation actually fails.',
  inputSchema: { provider: z.enum(['github', 'gitlab']), organization: z.string().optional() },
}, async ({ provider, organization }) => output(`/repositories/${provider}${organization ? `?${provider === 'github' ? 'org' : 'group'}=${encode(organization)}` : ''}`));

registerPlatformTools(server);
registerOperationsTools(server);
registerStorageTools(server);
registerShieldTools(server);

server.registerTool('nexode_compute_list', { description: 'List web, worker and private compute instances.' }, async () => output('/compute'));
server.registerTool('nexode_compute_get', { description: 'Get a compute instance and its operational status.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}`));
server.registerTool('nexode_compute_analytics', {
  description: 'Get owned frontend/landing web analytics, exact installation script (src and data-site), accepted domains, tracking status and 30-day retention. Requires compute:read. Use the returned script in the real app root/head, never guess its URL or compute ID; install once, adapt to the framework, commit/push and redeploy. No API key belongs in website source. Reading does not enable tracking.',
  inputSchema: { id, days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7) },
}, async ({ id, days }) => output(`/compute/${id}/analytics?days=${days}`));
server.registerTool('nexode_compute_configure_analytics', {
  description: 'Enable or pause web analytics for an owned frontend/landing compute (compute:write). Call with enabled=true only during an explicitly requested legacy analytics setup, then install the exact script returned by nexode_compute_analytics and redeploy the website. This only changes collection status; it does not edit source or prove events are arriving. Respect explicit opt-outs and preserve paused tracking during unrelated maintenance.',
  inputSchema: { id, enabled: z.boolean() },
}, async ({ id, enabled }) => output(`/compute/${id}/analytics`, 'PUT', { enabled }));

server.registerTool('nexode_compute_rename_subdomain', {
  description: 'Rename the generated Nexode hostname of an existing running compute. Convention: landing nombre-del-proyecto.nexode.app, frontend dashboard-nombre-del-proyecto.nexode.app, backend api-nombre-del-proyecto.nexode.app. Identify actual roles with compute_list/get and source configuration. Pass nombre-del-proyecto, dashboard-nombre-del-proyecto or api-nombre-del-proyecto, not a URL/full hostname. Single-label prefixed names need no parent resource; nested names require the base compute in the same workspace. Requires compute:write. Rejects occupied/reserved names and instances using custom domains. Preserves port, HTTPS settings, repo and infrastructure without rebuild. Old URL has no redirect. Verify every returned HTTPS URL before claiming success; nested names require matching DNS and certificates. Do not rewrite environment URLs automatically.',
  inputSchema: { id, subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?$/, 'Pass nombre-del-proyecto, dashboard-nombre-del-proyecto or api-nombre-del-proyecto') },
}, async ({ id, subdomain }) => output(`/compute/${id}/subdomain`, 'PUT', { subdomain }));
server.registerTool('nexode_compute_create', {
  description: 'Deploy a GitHub/GitLab repository or a prebuilt DOCKER image into the API key workspace. WORKER has no incoming port; PRIVATE has no public URL. Private networking is not tenant isolation. Git requires repository_url; DOCKER requires docker_image. Dockerfile and Railpack builds accept root_directory. Preserve persistent volumes. Use the user-provided project_name for branded default hostnames; no app grouping or app_id exists. Public roles: landing <project>, frontend dashboard-<project>, backend api-<project>, under nexode.app. An explicit subdomain or custom_domain overrides defaults. Prepare/test the Dockerfile and verify the pushed SHA first. Select package for credit plans (default basic); legacy bundles retain their entitlements. Pass the actual container port. connect_storage injects private S3 variables for backends only.',
  inputSchema: {
    name: z.string().min(3).max(50), type: z.enum(['FRONTEND', 'BACKEND', 'WORKER', 'PRIVATE']), provider: z.enum(['GITHUB', 'GITLAB', 'DOCKER']),
    repository_url: z.string().url().optional(),
    docker_image: nonempty.max(255).optional(), docker_tag: nonempty.max(128).optional(),
    registry_username: nonempty.max(255).optional(), registry_password: nonempty.max(4096).optional(),
    build_type: z.enum(['dockerfile', 'railpack']).optional(), root_directory: z.string().max(200).optional(),
    dockerfile_path: z.string().max(200).optional(), start_command: z.string().optional(),
    volumes: z.array(nonempty).optional(), branch: nonempty.default('main'), project_name: nonempty.optional(), app_role: z.enum(['landing', 'frontend', 'backend']).optional(),
    subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?$/).optional(),
    custom_domain: z.string().optional(), runtime: z.string().optional(), port: z.number().int().min(1).max(65535).optional(),
    package: z.enum(['basic', 'standard', 'pro', 'ultra']).optional(),
    username: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(), password: z.string().min(12).optional(),
    health_check_path: z.string().optional(), env_content: z.string().optional(), connect_storage: z.boolean().optional(),
  },
}, async (input) => {
  try {
    if (input.provider === 'DOCKER' ? !input.docker_image : !input.repository_url) {
      throw new Error(input.provider === 'DOCKER' ? 'docker_image is required for DOCKER.' : 'repository_url is required for Git providers.');
    }
    if (input.provider !== 'DOCKER') {
      const repository = new URL(input.repository_url!);
      const host = input.provider === 'GITHUB' ? 'github.com' : 'gitlab.com';
      if (repository.protocol !== 'https:' || repository.hostname !== host || repository.port || repository.username || repository.password) {
        throw new Error(`Use an HTTPS repository URL on ${host}, without embedded credentials or a custom port.`);
      }
    }
    const isPublic = input.type === 'FRONTEND' || input.type === 'BACKEND';
    if (!isPublic && (input.subdomain || input.custom_domain || input.app_role)) throw new Error('Workers and private services do not have public domains or app_role.');
    if (input.type === 'WORKER' && input.port !== undefined) throw new Error('Workers do not accept an incoming port.');
    const { project_name, app_role, ...body } = input;
    const role = app_role || (input.type === 'BACKEND' ? 'backend' : 'frontend');
    const subdomain = isPublic && !input.custom_domain && !input.subdomain && project_name
      ? projectSubdomain({ name: project_name }, role) : input.subdomain;
    return await output('/compute', 'POST', { ...body, ...(subdomain ? { subdomain } : {}), port: deploymentRequirements(input.type, input.port).container_port });
  } catch (error) {
    return { content: [{ type: 'text' as const, text: (error as Error).message }], isError: true };
  }
});
server.registerTool('nexode_compute_deploy_status', { description: 'Check deployment and runtime status. Health uses the active custom domain when configured, otherwise the generated domain. Inspect build logs for build errors and runtime/dependency logs for readiness failures.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/deploy-status`));
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
server.registerTool('nexode_compute_build_logs', {
  description: 'Read build logs for the latest or a specific deployment. Use after a failed build BEFORE changing code or redeploying. Returns deployment identity, status, log availability and a bounded log tail; runtime logs are separate. If unavailable, report the observability failure instead of guessing a cause.',
  inputSchema: { id, deployment_id: z.string().min(1).max(200).optional(), tail: z.number().int().min(1).max(2000).default(200) },
}, async ({ id, deployment_id, tail }) => output(`/compute/${id}/build-logs?tail=${tail}${deployment_id ? `&deployment_id=${encode(deployment_id)}` : ''}`));
server.registerTool('nexode_compute_logs', { description: 'Read runtime container logs. These do not include Docker build output; use nexode_compute_build_logs for build failures.', inputSchema: { id, tail: z.number().int().min(1).max(2000).default(200) } }, async ({ id, tail }) => output(`/compute/${id}/logs?tail=${tail}`));
server.registerTool('nexode_compute_redeploy', { description: 'Trigger a rebuild and redeployment of an existing compute instance. For local code changes, first check deployment requirements, preserve the existing compute port, prepare/test its Dockerfile, commit/push and verify the remote SHA.', inputSchema: { id } }, async ({ id }) => output(`/compute/${id}/restart`, 'POST'));
server.registerTool('nexode_compute_set_env', {
  description: 'Merge environment variables into a compute instance without returning secret values. Requires compute:write. Redeploy after changing variables.',
  inputSchema: { id, variables: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(8192)) },
}, async ({ id, variables }) => output(`/compute/${id}/environment`, 'PUT', { variables }));
server.registerTool('nexode_compute_unset_env', {
  description: 'Remove only the selected environment variable names without exposing other credentials. Requires compute:write. Redeploy afterward.',
  inputSchema: { id, keys: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).min(1).max(50) },
}, async ({ id, keys }) => output(`/compute/${id}/environment`, 'DELETE', { keys }));
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
server.registerTool('nexode_database_create', { description: 'Create a database in the API key workspace. Choose an engine version from nexode_database_engines and a credit package (default basic); existing legacy bundles use their entitlements.', inputSchema: { name: z.string().min(3), type: z.enum(['postgres', 'mongodb', 'redis', 'mysql']), version: nonempty.optional(), package: z.enum(['basic', 'standard']).optional() } }, async (input) => output('/databases', 'POST', input));
server.registerTool('nexode_database_backups', { description: 'List backup schedule, available restore points and last test restore for a database.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}/backups`));
server.registerTool('nexode_database_enable_backups', { description: 'Enable daily backups with retention determined by the database package for a PostgreSQL, MySQL or MongoDB database.', inputSchema: { id } }, async ({ id }) => output(`/databases/${id}/backups/enable`, 'POST'));
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
server.registerTool('nexode_domain_check', { description: 'Check domain availability.', inputSchema: { domain: nonempty } }, async ({ domain }) => output(`/domains/check?domain=${encode(domain)}`));
server.registerTool('nexode_domains', { description: 'List domains owned in Nexode.' }, async () => output('/domains'));
server.registerTool('nexode_domain_register', {
  description: 'Begin purchase of the exact domain requested by the user. Requires domains:write. Returns a Stripe checkout URL; the user completes payment. Reuse existing pending purchases instead of registering again. After payment Nexode automatically registers and configures apex/wildcard DNS. Poll nexode_domain_get until active and dns_status=ready, then attach the requested hostnames to the intended compute and verify HTTPS.',
  inputSchema: { domain: z.string().min(3).max(253) },
}, async input => output('/domains/register', 'POST', input));
server.registerTool('nexode_domain_dns', {
  description: 'Inspect DNS records for an owned domain registered through Nexode. Requires domains:read. External domains use their existing DNS provider. DNS readiness does not attach a hostname to a compute or guarantee HTTPS.',
  inputSchema: { id },
}, async ({ id }) => output(`/domains/${id}/dns`));
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

server.registerTool('nexode_shield_scans', { description: 'List recent Shield security scans.', inputSchema: { limit: z.number().int().min(1).max(200).default(20), include_archived: z.boolean().optional(), archived_only: z.boolean().optional() } }, async ({ limit, include_archived, archived_only }) => output(`/shield/scans?limit=${limit}${include_archived === undefined ? '' : `&include_archived=${include_archived}`}${archived_only === undefined ? '' : `&archived_only=${archived_only}`}`));
server.registerTool('nexode_shield_scan_compute', { description: 'Start a Shield scan for a compute instance.', inputSchema: { compute_instance_id: id } }, async ({ compute_instance_id }) => output('/shield/scan-compute', 'POST', { compute_instance_id }));

await server.connect(new StdioServerTransport());
