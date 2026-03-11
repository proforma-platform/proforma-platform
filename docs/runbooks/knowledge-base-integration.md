# Runbook: Base de Conhecimento Integrada do Portal

## Objetivo

Evoluir a central de ajuda do portal com estrutura de conteúdo reutilizável, sem
backend real nesta fase.

## Modelo adotado

- Catálogo local de artigos em `apps/web-portal/src/lib/kb.ts`.
- Página índice em `/portal/ajuda` com categorias e lista de artigos.
- Páginas de artigo em `/portal/ajuda/[slug]` com geração estática.

## Estrutura de conteúdo

Cada artigo contém:

- `slug`
- `title`
- `category`
- `summary`
- `updatedAt`
- `sections[]`

## Evolução futura

- Persistência em backend com versionamento de artigos.
- Busca textual e filtros avançados.
- Métricas de uso para priorização de conteúdo.

## Governança

- Toda alteração na KB deve atualizar `CHANGELOG.md` e item correspondente no roadmap.
- Mudança estrutural da arquitetura de conteúdo deve gerar ADR.
