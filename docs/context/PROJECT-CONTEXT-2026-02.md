# Proforma Platform — Project Context Snapshot
**Date:** 2026-02-24  
**Status:** Active Development  
**Scope:** Institutional platform baseline after governance and infra consolidation

---

## Current Operational State

- Nginx configured as reverse proxy for public entry points.
- Cloudflare SSL/TLS mode set to Full (strict).
- Cloudflare Origin Certificate installed on origin.
- HTTP port 80 redirecting to HTTPS 443.
- n8n protected with Basic Auth.
- DNS records proxied in Cloudflare (orange cloud).
- Public infrastructure currently stable.

## Version Status

- `v0.1.0` — Structural governance consolidated.
- `v0.2.0` — Institutional hero implemented (**in progress** if tag not yet published).
- Next planned increment: `v0.3.0` — Tangible Product Pages (`/produtos/proformafarm` and `/produtos/medcore`).

## Infrastructure Model

- Ubuntu server as runtime host.
- Nginx as reverse proxy.
- Docker containers for platform services.
- n8n running in container, exposed internally on port `5678`.
- Cloudflare operating as edge proxy.
- SSL Full (strict) with Origin Certificate.
- UI feature branches must not alter shared infrastructure.

## Security Posture

- SSL Full (strict) active.
- Origin Certificate installed and in use.
- Basic Auth enabled for n8n access.
- Public services segmented by subdomain.
- No sensitive service should be exposed without reverse proxy protection.

## Platform Topology

Monorepo structure:

- `apps/web-public` (Astro)
- `apps/web-portal` (Next.js App Router)
- `docs/docusaurus` (Docusaurus)
- `packages/brand` (brand tokens/assets)
- `packages/ui` (shared UI components)
- `infra/` (deployment and routing assets)

Core stack:

- Node 20
- npm workspaces
- Turbo
- Docker (deployment environment)

## Brand and UI Rules

- Single source of truth for brand tokens: `packages/brand`.
- No local duplicated token files in apps.
- Workspace imports only for shared packages (no `../../packages/...` pattern).
- UI work must not modify infra, database, n8n, or edge networking.

## Roadmap Status

- Current phase: Institutional platform consolidation.
- Next phase: Product tangibilization (ProformaFarm and MedCore).

## Governance Continuity

- `ROADMAP.md` is the official single source roadmap.
- Root `README.md` is the institutional executive entrypoint.
- Deliveries require branch name and commit SHA.
- Infrastructure changes are allowed only through ADR-backed decisions.

## Delivery Rules (Persistent)

- Feature execution must align with current roadmap phase.
- Every relevant delivery updates documentation and changelog.
- Architectural decisions require ADR registration.
- Snapshot updates are required when operational baseline changes.

## Next Planned Increment

`feat(web-public): product pages v0.3.0`

- Implement reusable product page layout.
- Publish tangible institutional pages for ProformaFarm and MedCore.
- Preserve static build, token governance, and infra isolation.
