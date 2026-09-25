# Nexode MCP

MCP tools and a shared skill for deploying GitHub/GitLab apps to [Nexode](https://cloud.nexode.app). Node.js 20+ is required. The client runs locally and calls the authenticated Nexode REST API; no extra service on the Nexode server is needed.

## Connect

1. Create an API key in [Nexode API Keys](https://cloud.nexode.app/dashboard/api-keys). Full MCP access is selected automatically, including S3, databases, n8n, domains, and Shield. You can optionally customize permissions. Copy the key when it is shown; Nexode stores only its hash.
2. Set `NEXODE_API_KEY` in the environment that launches your agent. Keep it out of repositories and chat. On PowerShell for the current terminal: `$secret = Read-Host 'Nexode API key' -AsSecureString; $env:NEXODE_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password`. On Bash: `read -rs NEXODE_API_KEY && export NEXODE_API_KEY`.

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

The API key must be available to the Codex process as `NEXODE_API_KEY`. Restart Codex after installation. To connect only the MCP server without the skill, run `codex mcp add nexode -- npx --yes --package=github:lucast1574/nexode-mcp nexode-mcp`.

### Other MCP clients

Configure a stdio server with command `npx`, arguments `--yes --package=github:lucast1574/nexode-mcp nexode-mcp`, and environment variable `NEXODE_API_KEY`. The executable writes only MCP JSON-RPC to stdout.

## What it can do

- Check identity, subscriptions, available service slots and connected repositories.
- Create and inspect frontend/backend compute instances; check deployment status, history and logs; merge environment variables, link Nexode databases without disclosing their URIs, redeploy and attach domains.
- Provision a private S3 bucket when creating a backend with `connect_storage: true`, or attach S3 to an existing backend with `nexode_compute_link_storage`. Nexode injects `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`; the MCP response never contains the secret. Redeploy an existing backend after linking.
- Create/list databases and n8n; Nexode assigns a free subscription slot automatically. Browse SQL tables, MongoDB documents and Redis keys; edit individual values or delete records and fields with database-specific safeguards.
- Run and list database backups, verify a restore in a temporary database, or restore a selected copy after confirmation. Inspect deployment history and diagnosis, create password-protected branch/PR previews, and roll back to retained images. Check domains; list and start Shield scans.

Nexode provisions from a pushed Git repository. The local agent uses its own Git tooling to commit and push code; the Nexode API key does not grant GitHub or GitLab access. Compute read endpoints omit stored credentials and environment content. Provisioning still obeys plan slots and the backend's superadmin bypass.
