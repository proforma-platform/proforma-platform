# Contributing

## Regras principais

- Manter stack oficial: npm workspaces + turbo, Astro, Next.js App Router e Docusaurus.
- Evitar dependências novas sem necessidade clara.
- Toda entrega deve estar vinculada a item do `ROADMAP.md`.
- Atualizar documentação em toda mudança relevante:
  - `README.md`
  - `ROADMAP.md`
  - `CHANGELOG.md`
  - ADR em `docs/architecture/` quando houver decisão arquitetural

## Fluxo sugerido

1. Criar branch de trabalho.
2. Confirmar tarefa no `ROADMAP.md` (ou adicionar antes de implementar).
3. Implementar mudança de forma incremental.
4. Rodar `npm run build` na raiz.
5. Atualizar documentação relacionada.
6. Atualizar `CHANGELOG.md` em `## [Unreleased]`.
7. Declarar no PR o bump de versão proposto: `major`, `minor` ou `patch`.
8. Abrir PR com descrição objetiva do que mudou e por quê.

## Qualidade mínima

- Build do monorepo passando.
- Sem quebrar separação entre site público e portal.
- Sem introduzir autenticação real neste estágio.

## Referência

- Política de release: `docs/runbooks/versioning-release.md`.
