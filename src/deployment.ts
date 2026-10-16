export type ComputeType = 'FRONTEND' | 'BACKEND';

export const deploymentInstructions = `For a request to deploy local application code, first call nexode_deployment_requirements and prepare the repository using the agent's local file, shell and Git tools. Inspect the actual stack and start command; create a production Dockerfile if absent or adapt an incompatible one. Make the HTTP server listen on 0.0.0.0 and the returned container_port, not just EXPOSE it. Build and smoke-test when Docker is available. Commit only the deployment changes and push the selected branch using the user's configured Git credentials as part of the authorized deployment. Before creating services, use nexode_apps to select the visual app or nexode_app_create to create it in a free workspace. Pass app_id on each compute, database and n8n creation, and app_role=landing for its landing compute. Every deployed service must appear in My Apps. Use nexode_apps afterward to verify the cards and connections inferred from environment configuration; inspection must not change variables. Verify the remote commit before nexode_compute_create or nexode_compute_redeploy. Pass the same port explicitly to compute_create. Preserve unrelated user changes and never commit secrets. Read skills/nexode-deploy/references/container-preflight.md for stack and Git details when the plugin is installed. This preparation applies to deploying local code, not read-only operations or managed database/n8n provisioning.`;

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
