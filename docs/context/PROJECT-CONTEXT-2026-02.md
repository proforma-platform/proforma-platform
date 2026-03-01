# PROFORMA PLATFORM — NOVO CHAT STARTER

## Missão Ativa

- GOV-ID atual: `GOV-0070-NCS-V2.1-DUAL-CONSOLIDATION`
- Versão alvo: `NCS v2.1`
- Branch ativa: `docs/gov-0070-ncs-v2-1-dual-consolidation`
- Status: `In Progress`

## Estado do Deploy Público

- Último commit publicado: `e6b1364` (baseline operacional v0.6.0)
- `version.txt` público: `https://proforma.net.br/version.txt`
- Canonical/trailing slash: estável para páginas de produto (`/proformafarm/` e `/medcore/`)

## Histórico de Consolidação Técnica

| GOV-ID | Commit | Decisão | Data |
|--------|--------|---------|------|
| GOV-0060 | `e6b1364` | Enterprise credibility layer consolidado no web-public | 2026-02-25 |
| GOV-0061 | `e6b1364` | Regra de trailing slash validada em canonical/og/json-ld | 2026-02-25 |
| OPS-0060 | `3141611` | Evidência de republish documentada em runbook operacional | 2026-02-25 |
| GOV-0065 | `30dbff6` | Hardening narrativo e release integrity metadata no web-public | 2026-02-25 |

## Release Checklist Padrão

- [ ] Build OK
- [ ] Canonical OK
- [ ] JSON-LD OK
- [ ] version.txt OK
- [ ] Links auditáveis OK
- [ ] Sem alteração infra

## Contexto Oficial (fonte única)
- Repo: proforma-platform (agora sob conta institucional `proforma-platform`)
- Branch principal: `main`
- ROADMAP.md (root) é fonte única oficial
- Snapshot base: docs/context/PROJECT-CONTEXT-2026-02.md
- Releases: SemVer

## Regra de Ouro (Governança)
Ninguém deve conseguir alterar `main` sem:
- PR obrigatório
- 1 approval
- conversa resolvida
- histórico linear
- sem force-push e sem delete da branch

Objetivo: eliminar 90% dos riscos (ex.: commit direto no roadmap / regressões silenciosas).

## Estado Atual (o que já foi feito)
### v0.5.0 — Design System Core
- Novo workspace `@proforma/design-system` como núcleo de tokens semânticos, contratos tipados e tema compartilhado.
- Consumo de tokens consolidado por pacote nos canais:
  - `apps/web-public`
  - `apps/web-portal`
  - `docs/docusaurus`
- `@proforma/brand` mantém identidade visual canônica; `@proforma/design-system` define semântica e escala de UI.

### Governança / Gates
- Root scripts padronizados: build, lint, typecheck, test (+ dev quando aplicável)
- Turbo task graph inclui `test`
- Turbo version pinned (removido "latest") para reprodutibilidade
- Lighthouse instalado localmente e scripts `lighthouse:mobile` e `lighthouse:desktop` adicionados
- Workspaces têm `test` stub com exit 0 (“no tests yet”) para não quebrar pipeline enquanto suíte real não existe

### v0.3.0 — Product Pages Tangíveis
- GOV-0031: product pages refinadas (ProformaFarm e MedCore)
  - headline/subheadline
  - capabilities (~5)
  - “como funciona” (3 passos)
  - módulos
  - CTAs: /contato e docs
- GOV-0033: baseline SEO em BaseLayout
  - title/description
  - og:title/og:description/og:image/og:url
  - canonical implementado

### Infra (imutável sem ADR)
- Ubuntu + Nginx reverse proxy
- Cloudflare SSL Full (strict) com Origin Certificate
- 80 → 443 redirect
- n8n com Basic Auth
- DNS proxied (laranja)
- Sem mudanças permitidas sem ADR

## Pendências (prioridade)
1) Lighthouse evidências para release:
   - Rodar `npm run lighthouse:mobile` e `npm run lighthouse:desktop` no host com DNS ok
   - Gerar/armazenar HTMLs conforme política do repo
   - Colar bloco padrão de métricas no PR do release
2) Validar SEO baseline:
   - canonical não pode gerar href vazio
   - og:image deve ser URL absoluta para bots
   - og:url consistente (base + pathname)
3) Definir se v0.3.0 vai ser tag imediata ou após um “v0.3.1 hardening” (separando melhorias estruturais)
4) (Recomendado) CODEOWNERS para proteger arquivos críticos (ROADMAP.md, docs/context, infra, brand, package.json, turbo.json)

## Próximo Passo Recomendado (alto impacto)
Fechar GOV-0032: release `v0.3.0` com evidências Lighthouse anexadas + checks verdes.

## Regras de interação neste chat
- Não reanalisar histórico.
- Foco no próximo incremento.
- Qualquer mudança em infra exige ADR.
- Sempre manter governança e rastreabilidade (branch + PR + commit SHA).

## GOV-MANAGER V7 FOUNDATION (2026-03-01)
- merge_commit_sha: `c7f5da673d7bd3434fec81376b8d0f9aaccf26c4`
- foundation_commit_sha: `4b87026`
- tdv_root_hash: `1693b2656a46f5d6ec0f232b95e9433601f8dcc14c0324adb531f10d670595d9`
- udn_engine_hash: `714b63e9ed0edaf3f3277f7fa9b13d1f8cdeac26f904c2d75b85da8dc1d5cc13`
- ledger_genesis_hash: `1a60c2703e8166c43db06554c345f024ac5f3b6cb5d62222bc290d9fde2a4242`
- contract_adapter_hash: `6ce1ec1f089d035f789286b8185e0c4d4d170e1e2c650522ae20cbaad4792c7d`
- documentation_hash: `b4c90f11eb5a558ff85f1475e5c98e2b0bc578adcbc0f76babc1540b7483c6d4`

## GOV-HUB V7 ORCHESTRATION V1 (HASH BLOCK)
- migration: `docs/governance/hub/schema/0004_govhub_v7_orchestration.sql`
- endpoints:
  - `POST /webhook/govhub/missions/register`
  - `GET /webhook/govhub/missions/next`
  - `POST /webhook/govhub/snapshot-update`
  - `GET /webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1`
- workflow_exports:
  - `docs/governance/hub/n8n/exports/missions-register.json`
  - `docs/governance/hub/n8n/exports/missions-next-get.json`
  - `docs/governance/hub/n8n/exports/orchestration-monitor.json`
  - `docs/governance/hub/n8n/exports/snapshot-update.json`
