# Frontend quality and public verification

Use for a landing or frontend change. Preserve the customer's existing design and facts; this is a quality gate, not a requirement to redesign every app.

## Responsive content

Inspect actual rendering at narrow and common mobile widths (320px and 390px for phone layouts), tablet and desktop. Exercise menus, long headings, service links, select values and form/dialog states. Check text clipping and overlaps as well as horizontal overflow: an overflow:hidden wrapper can hide a broken heading without increasing document width. Use fluid type, flexible grid columns and natural line breaks; do not fix overflow by hiding meaningful content. Keep touch controls usable and verify that typography remains readable.

Use appropriate licensed/customer photos, reserve intrinsic dimensions, select useful object positions and provide smaller sources where needed. Check that photos remain visible on mobile instead of being obscured by a full-height overlay. Keep asset credits/provenance in internal documentation when not required in the public UI. Never describe stock imagery as the customer's completed projects or invent contact details, reviews, guarantees or successful form delivery. Public copy should explain the customer's offering; integration and staging notes belong in project documentation.

Preserve descriptive alt text, canonical URLs, useful service content, redirects and sitemap coverage when changing layout.

## Isolate connectivity failures

Read the existing compute's port, the actual listener and routing target. Public HTTPS uses 443; the internal container may legitimately use 80 or another custom port. Do not overwrite an existing working port with frontend defaults.

When one device fails, identify that device and network. Compare its resolver with public and authoritative DNS, then test HTTPS and redirects. A request pinned to a verified origin can isolate DNS while preserving hostname/TLS validation; clearly label that test and do not equate it with successful browser resolution. Fixing DNS on the agent's computer does not fix another PC. If an authorized local DNS override repairs a router, record its scope and verified address, explain that it must change when the public origin changes, and distinguish it from a public DNS repair. Avoid speculative DNS, proxy or port changes when evidence points to a local resolver.

## Finish on the published site

Verify the remote revision, deployment status, normal custom-domain HTTPS, representative assets and a fresh browser rendering on mobile and desktop. Reopen changed pages after a static build. A container health check proves only the health endpoint, not imagery, typography, form behavior or public DNS. Report exactly which device and URL were verified and any remaining access limitation.
