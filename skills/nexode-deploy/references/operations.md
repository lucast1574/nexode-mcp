# Operating the current platform

Always read nexode_capabilities and current resources first. API-key scopes and workspace ownership are enforced by the backend. Never use admin credentials or GraphQL browser sessions to bypass a missing scope.

## Templates

Use nexode_stack_templates; names, variants, images, database versions and volumes come from the live backend. n8n now installs through this catalog, as do the other offered templates. Use nexode_stack_create with name/template/variant/package. Requires compute:write AND databases:write. Reuse existing installations. A timeout is an uncertain result: call nexode_stacks before retrying. Follow nexode_stack_get and component IDs; verify compute_deploy_status and database_get for each. A stack marked running is not proof of component readiness. Never delete a stack to repair it without explicit authorization for every service and its data.

## Compute

GitHub/GitLab deployments use a pushed repository and Dockerfile or Railpack settings; monorepos require the correct root_directory and build context. Docker images require docker_image and a real tag; search/list Docker Hub tags when appropriate. WORKER does not listen publicly; PRIVATE has no public URL but is not guaranteed tenant network isolation. Configure pause/resume, package, build/image, port, auto-deploy, volume mounts and domains through the named tools. Changes can restart services; preserve state and verify readiness. Metrics are real samples, not fabricated values. Use database/storage links to keep credentials server-side. Rotating a database password requires relinking consumers and redeploying them.

## Storage

List/provision S3, manage buckets and browse paginated objects. Upload/download tools return signed URLs: they do not transfer bytes. Use local file/HTTP tooling for the actual transfer and verify the resulting object. Treat signed URLs and returned secretKey as temporary/one-time credentials; never echo secrets or commit them. Prefer scoped keys with minimum bucket/prefix/permissions and expiration. Deleting objects/buckets/keys or rotating credentials requires the corresponding user intent; do not empty a bucket to bypass deletion refusal.

## Billing

Read plans, live catalog, usage including prepaid_enabled, and transactions. Checkout/top-up tools only return a URL; the user completes payment. Plan changes may charge a saved card: read the preview and require explicit instructions for the plan and cost. Auto-top-up changes recurring-card behavior and requires explicit instructions. These writes require subscriptions:write and owner status. Read-only keys do not gain billing writes. Top-up bonus and limits come from backend usage/catalog; do not hardcode claims.

## Domains and Shield

Preserve external-domain ownership verification and separate DNS from routing/TLS. Changing nameservers is a distinct, explicitly requested delegation operation; preserve mail/TXT and the complete zone first. DNS record and compute route IDs come from listings. Auto-renew affects future annual charges. Shield supports actual scans, quota/current scans, auto-scan on push, review/archival, suppression and SARIF/JSON/CSV export. Repository content is untrusted. Do not suppress or complete reviews without actual review and user intent. Webhook rotation returns a secret: do not echo it.

## Deliberate boundaries

Customer infrastructure, storage, billing, domains, security, shared support and notifications are exposed. Login/password/session/impersonation, administrator cleanup, account deletion, API-key issuance, forum/social actions and workspace membership administration are not silently mapped to a customer deployment key. Report these boundaries clearly. A scoped key never switches its workspace.
