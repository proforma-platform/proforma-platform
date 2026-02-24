# Proforma Platform

Monorepo institucional com `npm workspaces` + `turbo` para produtos e documentação do grupo.

## Estrutura

- `apps/web-public` (Astro): site público institucional
- `apps/web-portal` (Next.js App Router): portal do cliente
- `docs/docusaurus` (Docusaurus): documentação técnica e governança
- `packages/ui`: componentes compartilhados (inclui `HelpLauncher`)
- `packages/brand`: tokens e assets de marca institucional
- `docs/architecture`: decisões arquiteturais (ADR)
- `docs/roadmap`: detalhamento de fila e processo de execução
- `docs/brand`: guidelines visuais e regras de marca
- `docs/runbooks`: procedimentos operacionais

## Rodando localmente

Pré-requisitos:

- Node.js 20+
- npm 10+

Instalar dependências:

```bash
npm ci
```

Desenvolvimento:

```bash
npm run dev
```

Build completo:

```bash
npm run build
```

## Governança e Operação do Codex

### Regra central

Nenhuma tarefa pode ser executada fora da fase atual definida no `ROADMAP.md`.

### Como o Codex deve operar

1. Identificar a fase atual no roadmap.
2. Verificar se a tarefa está na fila da fase.
3. Se não estiver, adicionar no roadmap antes de executar.
4. Executar incrementalmente apenas itens da fase ativa.
5. Atualizar documentação obrigatória ao concluir:
   - `ROADMAP.md`
   - `CHANGELOG.md`
   - ADR em `docs/architecture/` quando houver decisão arquitetural

### Referências de processo

- Fila oficial: `ROADMAP.md`
- Processo Founder Mode: `docs/roadmap/processo-desenvolvimento.md`
- Changelog semântico: `CHANGELOG.md`
- ADRs: `docs/architecture/`

## Arquitetura de Marca

- Arquitetura adotada: **Branded House**
- Marca principal: **Proforma**
- Assinatura formal: **Proforma Platform**
- Submarcas: **ProformaFarm** e **MedCore**

Referências:

- ADR de marca: `docs/architecture/ADR-0003-brand-architecture.md`
- Guidelines visuais: `docs/brand/visual-guidelines.md`
- Tokens e assets: `packages/brand/`

Evolução da marca:

- Alterações estruturais de identidade exigem nova ADR.
- Tokens devem ser alterados primeiro em `packages/brand`, depois aplicados nas apps.

## Deploy no Ubuntu (visão geral)

- Produção via Docker + Traefik + Cloudflare usando `infra/docker/docker-compose.prod.yml`.
- Detalhes operacionais em `docs/runbooks/deploy-ubuntu-cloudflare.md`.
