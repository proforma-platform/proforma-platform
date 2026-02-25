# Proforma Platform

Proforma Platform is the institutional multi-product monorepo for public channels, customer portal, shared UI contracts, and technical governance documentation.

## Current Version

Current release: see Git tags / Releases.

## Governance

All contributions follow GOV-0070: [Branch and Release Policy](/docs/governance/GOV-0070-branch-and-release-policy.md).

## Platform Structure

- `apps/web-public` (Astro): institutional public website
- `apps/web-portal` (Next.js App Router): customer portal base
- `docs/docusaurus` (Docusaurus): technical documentation portal
- `packages/ui`: shared UI primitives
- `packages/brand`: brand assets and tokens
- `packages/design-system`: semantic tokens and UI contracts
- `docs/architecture`: Architectural Decision Records (ADRs)
- `docs/context`: official context snapshots
- `docs/governance`: governance and release policies

## Architecture Summary

The repository follows npm workspaces with Turbo orchestration, clear app/package boundaries, and documentation-first governance for traceable releases.

## Development

Prerequisites:

- Node.js 20+
- npm 10+

Commands:

```bash
npm ci
npm run dev
npm run build
```

## Release Discipline

- Pull Request mandatory before merge to `main`
- At least one approval and resolved conversations
- CI green required before merge
- SemVer tags only after validated release evidence
- When releasing, update `CHANGELOG.md` (if present) or follow the repository release notes standard
- Context snapshot update required before tagging
