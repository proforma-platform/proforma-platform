# PROJECT CONTEXT - 2026-02

## Monorepo Structure

- `apps/`
  - `web-public` (Astro)
  - `web-portal` (Next.js App Router)
- `packages/`
  - `brand` (design tokens + brand assets)
  - `ui` (shared UI utilities/components)
- `infra/`
  - `docker` (compose and production infra definitions)
- `docs/`
  - `docusaurus` (technical docs)
  - `architecture`, `roadmap`, `runbooks`, `brand`, `context`

## Runtime and Tooling Versions

- Node.js: `v20.20.0`
- npm: `10.8.2`
- Astro: `^5.17.1` (`apps/web-public/package.json`)
- Next.js: `16.1.6` (`apps/web-portal/package.json`)
- Turbo: `2.8.10` pinado no root (`package.json`) e validado por `npm run build` / `npx turbo build`

## Single Source of Truth for Brand Tokens

- Canonical source: `packages/brand/tokens.css` and `packages/brand/colors.ts`
- Mandatory rule: apps/docs consume tokens from `@proforma/brand`
- Duplicated local token files in apps are prohibited
- Borders/background/text in app CSS must come from brand tokens (no hardcoded hex in app stylesheets)
- Temporary exception: shadows can remain `rgba(...)` until dedicated shadow tokens are introduced

## Import Rules (Anti-Drift)

- Use workspace imports for shared packages
  - Example: `@proforma/brand/tokens.css`
- Relative imports to shared packages are prohibited
  - Example (prohibited): `../../packages/brand/...`

## Pipeline Baseline

- `build`: `turbo build`
- `dev`: `turbo dev`
- `lint`: `turbo lint`
- `typecheck`: `turbo typecheck`
- `test`: `turbo test`

## Deployment Notes

- `web-public`: static build served by nginx (`apps/web-public/Dockerfile.prod`)
- `web-portal`: Next.js App Router runtime (`apps/web-portal/Dockerfile.prod`)
- `docs`: static build served by nginx (`docs/docusaurus/Dockerfile.prod`)

## Next Planned Increment

- `feat(web-public): institutional hero + brand header`
- This context baseline intentionally does not implement hero/header yet.
