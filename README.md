# Proforma Platform

## 1. O que é a Proforma Platform
A Proforma Platform e a base institucional e de produtos SaaS do grupo, concentrando site publico, portal e documentacao tecnica em um monorepo governado.

## 2. Missao
Conectar operacao, dados e automacao com padrao unico de arquitetura, marca e governanca documental para suportar crescimento multi-produto.

## 3. Estrutura da plataforma
- `apps/web-public` (Astro): site institucional
- `apps/web-portal` (Next.js App Router): portal do cliente
- `docs/docusaurus` (Docusaurus): documentacao tecnica
- `packages/brand`: tokens e assets oficiais de marca
- `packages/ui`: componentes/utilitarios compartilhados
- `docs/architecture`: ADRs
- `docs/roadmap`: detalhamento do roadmap
- `docs/context`: snapshots oficiais por ciclo

## 4. Stack tecnologica
- Node.js 20
- npm workspaces
- Turbo
- Astro
- Next.js 16
- Docusaurus
- Docker (deploy)
- Traefik + Cloudflare (edge/reverse proxy)

## 5. Arquitetura resumida
- Monorepo com workspaces para apps, docs e packages.
- `ROADMAP.md` na raiz como fila macro oficial.
- `packages/brand` como fonte unica de tokens/identidade.
- Entregas por branch, com commit SHA rastreavel.

## 6. Estado atual
- Fase ativa: ver secao "Fase Atual" em `ROADMAP.md`.
- O planejamento macro e o status oficial vivem no roadmap raiz.

## 7. Proximo incremento previsto
- `feat(web-public): institutional hero + brand header`

## 8. Politica de Releases
- Versionamento SemVer (`MAJOR.MINOR.PATCH`).
- Release inicial oficial: `v0.1.0`.
- Regras:
  - feature relevante: incrementa `MINOR`
  - correcao: incrementa `PATCH`
  - breaking change: incrementa `MAJOR`

## 9. Como rodar localmente
Pre-requisitos:
- Node.js 20+
- npm 10+

Instalacao:
```bash
npm ci
```

Desenvolvimento:
```bash
npm run dev
```

Build:
```bash
npm run build
```

## 10. Links para documentacao detalhada
- Roadmap oficial macro: `ROADMAP.md`
- Snapshot oficial do ciclo: `docs/context/PROJECT-CONTEXT-2026-02.md`
- ADRs: `docs/architecture/`
- Changelog: `CHANGELOG.md`
- Processo de execucao: `docs/roadmap/processo-desenvolvimento.md`
- Runbook de release/versionamento: `docs/runbooks/versioning-release.md`
