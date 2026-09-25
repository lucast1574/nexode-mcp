---
name: nexode-deploy
description: Deploy an app from a local repository to Nexode, inspect deployments, and manage its compute, database, n8n, domain, or Shield resources through the Nexode MCP tools. Use when a user asks to publish, deploy, redeploy, or troubleshoot an app on Nexode.
---

# Deploy on Nexode

Use the Nexode MCP tools. The MCP process reads `NEXODE_API_KEY` from the user's environment; never request the key in chat, print it, put it in source control, or place it in tool arguments.

1. Call `nexode_me`, `nexode_plans`, and `nexode_subscriptions` to check identity, scopes, plan slug, and available slots. New Nexode API keys have full MCP permissions by default; customized or older keys may have narrower scopes. Superadmin accounts may bypass subscription checks; the Nexode backend remains the authority.
2. Inspect the app and its existing Git remote, branch, build/runtime, required environment variables, and health path. Nexode compute deploys a GitHub or GitLab repository. Push local code with the user's Git credentials when deployment is authorized. Do not assume the local folder has been published.
3. Call `nexode_repositories` to confirm the Git provider is connected and the target repository is visible to Nexode. If it is not connected, direct the user to the Nexode dashboard to connect it; an API key does not replace OAuth.
4. Prefer an existing compute instance if the app is already deployed; use `nexode_compute_redeploy` after pushing. Otherwise call `nexode_compute_create` with the correct `plan_slug`, provider, URL, branch and frontend/backend type. For full stack apps, use separate compute slots. Add a database or n8n only when requested or required by the app. When the backend needs object storage, set `connect_storage: true` on creation so its private S3 credentials are in place before the first deployment. For an existing backend, call `nexode_compute_link_storage` and redeploy when its response says `redeploy_required: true`. The key needs `compute:write` and `storage:connect`; `nexode_storage_get` needs `storage:read`. Never put S3 credentials in frontend computes or source code.
5. Poll `nexode_compute_deploy_status` and inspect `nexode_compute_deployments` or `nexode_compute_logs` if provisioning fails. Report the generated or custom URL when available. Do not claim the app is live from a successful create response alone.

Compute read tools omit stored passwords and environment content. Use `nexode_compute_set_env` to merge runtime variables, then redeploy. For a Nexode database, prefer `nexode_compute_link_database` so its URI remains server-side; the key needs `compute:write` and `databases:connect`. Never print, log, or commit secrets. Domain purchases require a separate Stripe checkout in a browser.
