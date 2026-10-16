# Nexode MCP

MCP tools and a shared skill for deploying GitHub/GitLab apps to [Nexode](https://cloud.nexode.app). Node.js 20+ is required. The client runs locally and calls the authenticated Nexode REST API; no extra service on the Nexode server is needed.

## Connect

1. Create an API key in [Nexode API Keys](https://cloud.nexode.app/dashboard/api-keys). Full MCP access is selected automatically, including S3, databases, n8n, domains, and Shield. You can optionally customize permissions. Copy the key when it is shown; Nexode stores only its hash.
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

The API key must be available to the Codex process as `NEXODE_API_KEY`. Restart Codex after installation. To connect only the MCP server without the skill, run `codex mcp add nexode -- npx --yes --package=github:lucast1574/nexode-mcp#v0.1.11 nexode-mcp`.

### Other MCP clients

Configure a stdio server with command `npx`, arguments `--yes --package=github:lucast1574/nexode-mcp#v0.1.11 nexode-mcp`, and environment variable `NEXODE_API_KEY`. The executable writes only MCP JSON-RPC to stdout.

## What it can do

- Prepare local code before deployment: the coding agent detects the stack, creates/adapts a production Dockerfile, aligns the real HTTP listener with Nexode (frontend/landing 3000, backend 4000 by default), verifies the container where Docker is available, then commits and pushes using configured local Git. `nexode_deployment_requirements` supplies the same port contract to clients with or without the plugin skill.
- Keep deployments visible in My Apps: select/create an app and workspace, pass `app_id` when creating services, and inspect the visual grouping and environment-derived connections without exposing values. One app per workspace, with three collaborators plus the owner in standard plans.
- Check identity, subscriptions, available service slots and connected repositories.
- Create and inspect frontend/backend compute instances; check deployment status, history and logs; merge environment variables, link Nexode databases without disclosing their URIs, redeploy and attach domains.
- Provision a private S3 bucket when creating a backend with `connect_storage: true`, or attach S3 to an existing backend with `nexode_compute_link_storage`. Nexode injects `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`; the MCP response never contains the secret. Redeploy an existing backend after linking.
- Create/list databases and n8n; Nexode assigns a free subscription slot automatically. Browse SQL tables, MongoDB documents and Redis keys; edit individual values or delete records and fields with database-specific safeguards.
- Add domains purchased elsewhere with `nexode_domain_add_external`, retrieve the exact DNS TXT challenge with `nexode_domain_get`, and verify it with `nexode_domain_verify_external`. The existing DNS provider keeps managing DNS; activation requires matching ownership proof. This does not purchase or transfer the domain.
- Run and list database backups, verify a restore in a temporary database, or restore a selected copy after confirmation. Inspect deployment history and diagnosis, create password-protected branch/PR previews, and roll back to retained images. Check domains; list and start Shield scans.

Nexode provisions from a pushed Git repository. Preparation happens before compute creation or a code redeploy. The MCP provides platform requirements; the coding agent uses its local file/shell tools to prepare the Dockerfile and its own Git tooling to commit and push code; the Nexode API key does not grant GitHub or GitLab access. Compute read endpoints omit stored credentials and environment content. Provisioning still obeys plan slots and the backend's superadmin bypass.

### Reuse GitHub already authenticated on this PC

With a valid Nexode API key and user authorization to connect their local GitHub, call `nexode_github_connect_local`. It reads `gh auth token --hostname github.com` internally, validates the credential with GitHub through Nexode and connects it to the API-key owner. No Nexode browser login or token argument is required. It refuses to overwrite a different connected GitHub account. If gh is missing or unauthenticated, run `gh auth login` on that PC; a Git SSH key alone cannot authorize GitHub API access. The credential is transmitted only to the official Nexode HTTPS API and is never included in MCP responses.

For custom domains, configure apex and wildcard DNS when requested using the actual Nexode routing target, preserving mail/TXT and explicit host records. A wildcard DNS record does not attach hostnames to computes or issue wildcard TLS certificates. Each requested hostname still needs routing and HTTPS verification.
