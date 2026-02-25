# PROFORMA PLATFORM — NOVO CHAT STARTER (2026-02-24 14:14:00)

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
