# Proforma Platform

Monorepo com `npm workspaces` e `turbo` para aplicações web e documentação.

## Estrutura

- `apps/web-public`: site público em Astro
- `apps/web-portal`: portal em Next.js
- `docs/docusaurus`: documentação em Docusaurus (preset classic + TypeScript)

## Rodando localmente

Requisitos:

- Node.js 20+
- npm 10+

Instalar dependências na raiz:

```bash
npm ci
```

Subir ambientes de desenvolvimento do monorepo:

```bash
npm run dev
```

Gerar build de todo o monorepo:

```bash
npm run build
```

Build apenas da documentação:

```bash
npm -w docs/docusaurus run build
```

## CI

O pipeline está em `.github/workflows/ci.yml`.

Ele executa em:

- `push` na branch `main`
- `pull_request`

Etapas do job:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` com Node 20 e cache npm
3. `npm ci`
4. `npm run build`
