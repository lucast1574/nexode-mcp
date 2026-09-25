# Nexode MCP

MCP tools and a shared skill for deploying GitHub/GitLab apps to [Nexode](https://cloud.nexode.app). Node.js 20+ is required. The client runs locally and calls the authenticated Nexode REST API; no extra service on the Nexode server is needed.

## Connect

1. Create an API key in [Nexode API Keys](https://cloud.nexode.app/dashboard/api-keys). Give it `me:read`, `subscriptions:read`, `compute:read`, and `compute:write`. Add database, n8n, domain, or Shield scopes only for those workflows. Copy the key when it is shown; Nexode stores only its hash.
2. Set `NEXODE_API_KEY` in the environment that launches your agent. Keep it out of repositories and chat. On PowerShell for the current terminal: `$secret = Read-Host 'Nexode API key' -AsSecureString; $env:NEXODE_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password`. On Bash: `read -rs NEXODE_API_KEY && export NEXODE_API_KEY`.

### Claude Code

```text
claude plugin marketplace add lucast1574/nexode-mcp
claude plugin install nexode-mcp@nexode-mcp
```

Restart Claude Code, then ask: “Use nexode-deploy to deploy this app.” The plugin includes the skill and MCP server configuration.

### Codex

Install the skill from `skills/nexode-deploy` and register the MCP process:

```text
codex mcp add nexode -- npx --yes --package=github:lucast1574/nexode-mcp nexode-mcp
```

The API key must be available to the Codex process as `NEXODE_API_KEY`. Codex plugin hosts that support local `.codex-plugin` packages can load this repo directly, including its `.mcp.json`.

### Other MCP clients

Configure a stdio server with command `npx`, arguments `--yes --package=github:lucast1574/nexode-mcp nexode-mcp`, and environment variable `NEXODE_API_KEY`. The executable writes only MCP JSON-RPC to stdout.

## What it can do

- Check identity, subscriptions, plan slugs and connected repositories.
- Create and inspect frontend/backend compute instances; check deployment status, history and logs; redeploy and attach domains.
- Create/list databases and n8n; check domains; list and start Shield scans.

Nexode provisions from a pushed Git repository. The local agent uses its own Git tooling to commit and push code; the Nexode API key does not grant GitHub or GitLab access. Compute read endpoints omit stored credentials and environment content. Provisioning still obeys plan slots and the backend's superadmin bypass.
