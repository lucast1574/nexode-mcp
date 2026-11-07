# Nexode MCP

Build failures: use `nexode_compute_build_logs` with the compute `id`, optional `deployment_id`, and `tail` (1–2000, default 200). It returns the deployment identity, status and log availability separately from runtime container logs. A failed deploy-status response also includes build evidence. Requires the backend build-logs SDK endpoint and `compute:read`; unavailable logs must be reported before attempting speculative fixes.

MCP tools and a shared skill for deploying GitHub/GitLab apps to [Nexode](https://cloud.nexode.app). Node.js 20+ is required. The client runs locally and calls the authenticated Nexode REST API; no extra service on the Nexode server is needed.

## Connect

1. Create an API key in [Nexode API Keys](https://cloud.nexode.app/dashboard/api-keys). Full MCP access is selected automatically, including S3, databases, domains, and Shield. You can optionally customize permissions. Copy the key when it is shown; Nexode stores only its hash.
2. Set `NEXODE_API_KEY` in the environment that launches your agent. Keep it out of repositories and chat. On PowerShell for the current terminal: `$secret = Read-Host 'Nexode API key' -AsSecureString; $env:NEXODE_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password`. On Bash: `read -rs NEXODE_API_KEY && export NEXODE_API_KEY`.

With the MCP installed and `NEXODE_API_KEY` configured, the agent operates directly through the API. It does not need a Nexode dashboard session, Google login, password, cookies, SSH or Dokploy access. Ask it to call `nexode_me` to verify access. Authentication failures identify a missing/invalid key or a missing scope; a browser login is not a fallback. Existing GitHub/GitLab authorization is reused; request provider setup only when a repository operation actually requires it.

### Claude Code

```text
claude plugin marketplace add lucast1574/nexode-mcp
claude plugin install nexode-mcp@nexode-mcp
```

Restart Claude Code, then ask: “Use nexode-deploy to deploy this app.” The plugin includes the skill and MCP server configuration.

### Codex

Install the plugin, which includes the skill and MCP tools:

```text
codex plugin marketplace add lucast1574/nexode-mcp
codex plugin add nexode-mcp@nexode
```

The API key must be available to the Codex process as `NEXODE_API_KEY`. Restart Codex after installation. To connect only the MCP server without the skill, run `codex mcp add nexode -- npx --yes --package=github:lucast1574/nexode-mcp#v0.1.26 nexode-mcp`.

### Other MCP clients

Configure a stdio server with command `npx`, arguments `--yes --package=github:lucast1574/nexode-mcp#v0.1.26 nexode-mcp`, and environment variable `NEXODE_API_KEY`. The executable writes only MCP JSON-RPC to stdout.

## What it can do

- Ask for the project name before its first deploy and use it for clean default URLs: `nombre-del-proyecto.nexode.app` (landing), `dashboard-nombre-del-proyecto.nexode.app` (frontend), and `api-nombre-del-proyecto.nexode.app` (backend). Pass `project_name` and `app_role` as local naming hints; no app group or `app_id` exists. Custom domains take precedence. Occupied/reserved names produce an error instead of random suffixes.
- Repair older generated URLs with `nexode_compute_rename_subdomain` (`id`, `subdomain: "nombre-del-proyecto"`, `"dashboard-nombre-del-proyecto"`, or `"api-nombre-del-proyecto"`; `compute:write`). Routes and stored public URLs change together without rebuilding or changing port/HTTPS settings. Old URLs have no redirect. Existing deployments stay unchanged until a migration is requested. Verify DNS, HTTPS certificates, and dependent API/CORS/auth/webhook URLs; route updates alone do not repair application configuration.

- Prepare local code before deployment: the coding agent detects the stack, creates/adapts a production Dockerfile, aligns the real HTTP listener with Nexode (frontend/landing 3000, backend 4000 by default), verifies the container where Docker is available, then commits and pushes using configured local Git. `nexode_deployment_requirements` supplies the same port contract to clients with or without the plugin skill.
- Check identity, subscriptions, credit balances, usage packages and legacy entitlements and connected repositories.
- Create and inspect frontend/backend compute instances; check deployment status, history and logs; merge environment variables, link Nexode databases without disclosing their URIs, redeploy and attach domains.
- Provision a private S3 bucket when creating a backend with `connect_storage: true`, or attach S3 to an existing backend with `nexode_compute_link_storage`. Nexode injects `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`; the MCP response never contains the secret. Redeploy an existing backend after linking.
- Create/list databases; Choose a credit package; legacy bundles retain their available slots. Browse SQL tables, MongoDB documents and Redis keys; edit individual values or delete records and fields with database-specific safeguards.
- Add domains purchased elsewhere with `nexode_domain_add_external`, retrieve the exact DNS TXT challenge with `nexode_domain_get`, and verify it with `nexode_domain_verify_external`. The existing DNS provider keeps managing DNS; activation requires matching ownership proof. This does not purchase or transfer the domain.
- Run and list database backups, verify a restore in a temporary database, or restore a selected copy after confirmation. Inspect deployment history and diagnosis, create password-protected branch/PR previews, and roll back to retained images. Check domains; list and start Shield scans.

Nexode provisions from a pushed Git repository. Preparation happens before compute creation or a code redeploy. The MCP provides platform requirements; the coding agent uses its local file/shell tools to prepare the Dockerfile and its own Git tooling to commit and push code; the Nexode API key does not grant GitHub or GitLab access. Compute read endpoints omit stored credentials and environment content. Provisioning obeys credit-plan usage checks or legacy bundle entitlements and the backend's superadmin bypass.

### Reuse GitHub already authenticated on this PC

With a valid Nexode API key and user authorization to connect their local GitHub, call `nexode_github_connect_local`. It reads `gh auth token --hostname github.com` internally, validates the credential with GitHub through Nexode and connects it to the API-key owner. No Nexode browser login or token argument is required. It refuses to overwrite a different connected GitHub account. If gh is missing or unauthenticated, run `gh auth login` on that PC; a Git SSH key alone cannot authorize GitHub API access. The credential is transmitted only to the official Nexode HTTPS API and is never included in MCP responses.

For custom domains, configure apex and wildcard DNS when requested using the actual Nexode routing target, preserving mail/TXT and explicit host records. A wildcard DNS record does not attach hostnames to computes or issue wildcard TLS certificates. Each requested hostname still needs routing and HTTPS verification.

Domains bought through Nexode: use `nexode_domain_register` only for a purchase explicitly requested by the user, return its Stripe checkout URL, and inspect `nexode_domain_get` until `status=active` and `dns_status=ready`. Nexode configures apex and wildcard DNS automatically. Use `nexode_domain_dns` to inspect records, then attach each requested hostname to its intended compute and verify public HTTPS.

## Platform behavior in v0.1.26

The companion platform is the monorepo `ronnaldrangel/nexode` (backend and frontend). This MCP remains a separate repository and consumes only `/api-v1/sdk/v1` with workspace-scoped API keys.

- Standalone n8n tools and Shield repository registration were removed because their SDK routes no longer exist. n8n is now a Compute stack template; stack create/get/list/delete now use the live backend catalog.
- Compute creation supports WORKER and PRIVATE, DOCKER images (including registry credentials), Dockerfile/Railpack, root_directory, dockerfile_path, start_command and persistent volumes. Workers have no incoming port; private services have no public URL. PRIVATE is not guaranteed tenant network isolation.
- Running compute/databases consume credits per second. Monthly plan credits expire; top-ups do not. Read `prepaid_enabled` in credit usage: enabled means 24-hour grace then suspension; disabled retains transitional overage invoices. S3 charging has a separate rollout flag. Never infer activation from a plan name.
- Web analytics is being retired. Do not automatically add its script. Read/configure tools remain for explicitly requested legacy maintenance.
- Existing bundles keep backend-defined entitlements. Support ticket submission requires explicit user instruction and an idempotent request_id. Checkout/top-ups return URLs for user payment; billing changes require owner and subscriptions:write. Password/session/admin operations stay outside this deployment API.

Update pinned package references to `v0.1.26` and restart the MCP process after the release is available. Running clients do not reload themselves.

## Validation

Run `npm run build` then `npm test`. Protocol tests launch the real stdio server against a local mock API. They check tool schemas, payloads, removed routes, safe errors and release pins; they do not certify production deployment or payments.


## Expanded operations in 0.1.26

Requires backend SDK revision `2026-11-07-operations-v1` (read `nexode_capabilities` first). Adds live templates/stacks; full Compute lifecycle/settings/volumes/metrics; S3 buckets, objects and scoped keys; DNS edits/delegation; credit transactions, top-up checkout, auto-recharge and subscription operations; Shield review, suppression, webhook and export workflows; and Git branch discovery. See [operations](skills/nexode-deploy/references/operations.md) for semantics and deliberate account/admin boundaries. A backend update must precede using these routes.

New granular scopes are `storage:write`, `subscriptions:write` and `subscriptions:*`. Existing `*` keys include them; existing read-only keys do not acquire write permissions. Stack creation/deletion needs BOTH compute:write and databases:write.

## Reliability and compatibility in 0.1.26

Adds `nexode_stack_cancel` (140 tools total). Requires `stack-cancellation` and `durable-stacks` capabilities for the updated installation lifecycle. Installation inputs and resource IDs survive worker restarts. Failed/cancelled stacks preserve data and may retain running/billed resources; deletion is a separate authorized action. Legacy partners keep their existing subscription prices and entitlements. New credit-plan metering serializes workers and gates period settlement on persisted usage. PostgreSQL/MongoDB/Redis expose TLS endpoints on 443; MySQL remains internal-only.
