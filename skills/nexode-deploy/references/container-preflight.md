# Prepare local code before a Nexode deploy

Use this for a new app or a deployment of local code changes. The coding agent performs the file edits and Git operations with its local tools; the MCP supplies platform requirements and deploys the resulting remote repository.

## Inspect the actual project

Read the repo instructions, Git status/remotes/current branch, dependency manifests and lockfiles, runtime versions, build scripts, output directories and production entrypoint. Identify each deployable HTTP service in a monorepo or full stack app. Do not use a Node template for a Python, PHP, Go, JVM, .NET, Ruby, Rust, static, or other project: derive the container from that project's real build and runtime. Respect existing runtime pins and package managers.

Call `nexode_deployment_requirements` for the selected FRONTEND or BACKEND. Defaults are frontend/landing 3000 and backend 4000. For an existing compute, read it first and keep its configured port; pass that port to the requirements tool. An explicit custom port must match the running process and Nexode routing.

## Prepare and verify the container

If there is no root `Dockerfile`, create one. Preserve an existing compatible Dockerfile; fix incompatible build, bind address or port settings before deploying. Nexode currently builds the repository root with `Dockerfile`: a monorepo Dockerfile must copy the chosen service and its workspace dependencies from that context. Do not silently deploy another service or rewrite unrelated containers.

Use a production start command and install required OS/runtime dependencies. For compiled stacks, build the actual artifact and copy it into the runtime image. For static frontends, serve the build output with a production HTTP server; configure SPA fallback only where the app needs it. Do not leave dev servers, watch mode, or a process that exits immediately as the deployment command.

Configure the real server to bind `0.0.0.0` on `container_port`; `EXPOSE` alone does not change its listener. Use the framework's supported host/port flags, server config or environment variables, not an assumed universal `PORT` setting. Keep Dockerfile, start scripts, runtime env, `EXPOSE` and the compute request aligned. Use an existing health endpoint that works without user authentication. Put secrets in Nexode runtime variables; never bake them into an image.

Maintain `.dockerignore` for credentials, real `.env` files, `.git` and local artifacts, while keeping build inputs and lockfiles. Run the repo's appropriate checks. When Docker is available, build from the exact root context, start a temporary container with a free local port mapped to `container_port`, request its real HTTP/health endpoint, inspect failures and clean up the temporary container. If Docker cannot run locally, say the runtime check was unavailable and use the actual Nexode build and health result to finish verification.

If a project has no deployable HTTP target (for example a native-only mobile app or a CLI), identify its existing web/server target or ask for the intended service. Do not invent a placeholder server or claim that a non-web artifact has been hosted successfully.

## Commit and push as part of the authorized deploy

Review the diff for secrets and accidental changes. Use the user's existing Git identity, remote, branch and credentials. Commit the deployment files and necessary start/port adjustments using explicit paths; preserve unrelated staged and unstaged user work. Do not run `git add .`, reset, stash or force-push. If the prepared files are already committed and pushed, reuse that commit.

Push the selected branch without overwriting divergent history, and compare its local HEAD with the remote branch SHA. If Git authentication, remote access or branch protection blocks the push, report that concrete blocker; a Nexode API key cannot supply Git credentials. Do not create compute from a stale branch. Reuse the existing Nexode Git-provider connection and call compute_create with the exact repository, branch and `container_port`, or redeploy the existing compute. Finish only after the build and public endpoint work; report the published SHA and URL.
