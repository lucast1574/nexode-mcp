export type ComputeType = 'FRONTEND' | 'BACKEND';

export const authenticationInstructions = `Authenticate Nexode operations exclusively through the configured NEXODE_API_KEY and Nexode MCP tools. A valid API key is sufficient for Nexode API access within its scopes, ownership permissions and plan limits; do not ask for a Nexode dashboard login, Google sign-in, password, browser cookies, session JWT, SSH or Dokploy credentials. Call nexode_me to verify the key and continue through MCP when it succeeds. If the key is missing from the MCP process environment, ask the user to configure NEXODE_API_KEY and restart the MCP client without pasting the key into chat or tool arguments. For an invalid, expired or revoked key, request a replacement key configured the same way. For a missing scope, name only the required permission; signing into the website cannot fix it. Never fall back to browser login or scraping for an API authentication error. Git-provider authorization is separate: reuse an existing connection and the local Git credentials, and request a provider connection only when the requested repository operation actually reports it missing. An absent browser session is never a deployment prerequisite.`;

export const externalDomainInstructions = `For a domain already purchased elsewhere, use nexode_domains to find and reuse its existing record; otherwise use nexode_domain_add_external with the domain name. Never use availability/purchase flows for an already-owned domain. Return the exact verification.type, verification.name and verification.value from the tool, and ask the user to publish that TXT at their existing DNS provider unless an authorized DNS connection is available. Use nexode_domain_get to resume a pending challenge, then nexode_domain_verify_external after publication; DNS propagation or a mismatch is not success. Report active only when the backend returns active. Do not replace nameservers, change mail records or claim the domain was purchased/transferred. After verification, attach the domain to the requested compute/app only when requested, and explain/configure the routing DNS separately using the actual target returned by Nexode. If DNS access is unavailable, provide the exact record and report the remaining DNS step rather than asking for Nexode login or silently inventing DNS values.`;

export const deploymentInstructions = `${authenticationInstructions}

${externalDomainInstructions}

For a request to deploy local application code, first call nexode_deployment_requirements and prepare the repository using the agent's local file, shell and Git tools. Inspect the actual stack and start command; create a production Dockerfile if absent or adapt an incompatible one. Make the HTTP server listen on 0.0.0.0 and the returned container_port, not just EXPOSE it. Build and smoke-test when Docker is available. Commit only the deployment changes and push the selected branch using the user's configured Git credentials as part of the authorized deployment. Before creating services, use nexode_apps to select the visual app or nexode_app_create to create it in a free workspace. Pass app_id on each compute, database and n8n creation, and app_role=landing for its landing compute. Every deployed service must appear in My Apps. Use nexode_apps afterward to verify the cards and connections inferred from environment configuration; inspection must not change variables. Verify the remote commit before nexode_compute_create or nexode_compute_redeploy. Pass the same port explicitly to compute_create. Preserve unrelated user changes and never commit secrets. Read skills/nexode-deploy/references/container-preflight.md for stack and Git details when the plugin is installed. This preparation applies to deploying local code, not read-only operations or managed database/n8n provisioning.`;

export function deploymentRequirements(type: ComputeType, port?: number) {
  return {
    type,
    build_type: 'dockerfile',
    dockerfile: 'Dockerfile',
    build_context: '.',
    container_host: '0.0.0.0',
    container_port: port ?? (type === 'FRONTEND' ? 3000 : 4000),
    instructions: deploymentInstructions,
    preparation: [
      'Inspect the selected service, manifests, lockfiles, runtime, build output and production start command; do not assume Node.js.',
      'Create a stack-appropriate Dockerfile if missing; preserve a compatible existing one. Ensure Docker build context includes monorepo dependencies.',
      'Configure the actual production server and Dockerfile to use container_host and container_port. Static builds need a production HTTP server with SPA fallback where required.',
      'Exclude credentials, .env files and local artifacts from the Docker context. Keep secrets in Nexode runtime variables.',
      'Build the image and run its actual HTTP/health endpoint when Docker is available; report any unverified runtime check.',
      'Review the diff, commit only deployment files, push to the selected repository/branch using local Git, and verify the remote SHA before deploying.',
    ],
  };
}
