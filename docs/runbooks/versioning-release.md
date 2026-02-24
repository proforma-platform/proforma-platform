# Runbook: Versionamento e Release

## Objetivo

Definir uma política única de versionamento e release para o monorepo Proforma Platform.

## Política de versão

Formato: `MAJOR.MINOR.PATCH`

- `MAJOR`: mudanças incompatíveis.
- `MINOR`: novas funcionalidades compatíveis.
- `PATCH`: correções compatíveis.

## Regras de atualização

1. Toda entrega deve entrar em `CHANGELOG.md` em `## [Unreleased]`.
2. A proposta de bump de versão deve ser declarada no PR (`major`, `minor` ou `patch`).
3. A decisão final do bump ocorre no merge para `main`.

## Fluxo de release (manual)

1. Garantir `npm run build` passando.
2. Revisar e consolidar `CHANGELOG.md`.
3. Definir versão alvo.
4. Criar tag Git anotada no formato `vX.Y.Z`.
5. Publicar release com resumo das mudanças.

## Checklist de PR

- Tarefa existe no `ROADMAP.md`.
- `CHANGELOG.md` atualizado em `Unreleased`.
- ADR incluída/atualizada quando houver decisão arquitetural.
- Tipo de bump proposto (`major`, `minor`, `patch`).

## Restrições

- Sem automação de push/commit em `main` via workflow.
- Sem release automática neste estágio.
