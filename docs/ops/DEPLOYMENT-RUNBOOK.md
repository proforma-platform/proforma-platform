# Deployment Runbook (Web Public)

## Visão Geral

Este runbook descreve como publicar mudanças do `apps/web-public` (Astro) no ambiente atual com Nginx.

Fluxo operacional:
1. atualizar código no servidor
2. build do `web-public`
3. publicar conteúdo estático no diretório servido pelo Nginx
4. validar rotas e cache

## Estado Atual (Servidor)

- SO: Ubuntu Linux (kernel 5.15)
- Nginx: `1.18.0 (Ubuntu)`
- Virtual host público: `proforma.net.br` e `www.proforma.net.br`
- Root servido: `/var/www/proforma-web-public`

## Pré-requisitos

- Acesso shell ao servidor com permissões de deploy.
- Repositório clonado em `<REPO_PATH>`.
- Node 20 + npm instalados.
- Permissão para publicar em `<NGINX_ROOT_PATH>`.

Placeholders:
- `<REPO_PATH>`: caminho do monorepo no servidor (ex.: `/opt/proforma/proforma-platform`)
- `<NGINX_ROOT_PATH>`: caminho servido pelo Nginx (`/var/www/proforma-web-public`)

## Passo a Passo de Deploy Manual

### 1) Atualizar código

```bash
cd <REPO_PATH>
git checkout main
git pull --ff-only origin main
```

### 2) Instalar dependências (quando necessário)

```bash
npm ci
```

### 3) Build do web-public

```bash
npm -w apps/web-public run build
```

Saída esperada: `apps/web-public/dist` gerado sem erro.

### 4) Publicar `dist` no root do Nginx

Opção comum (sync incremental):

```bash
rsync -av --delete apps/web-public/dist/ <NGINX_ROOT_PATH>/
```

Alternativa:

```bash
cp -a apps/web-public/dist/. <NGINX_ROOT_PATH>/
```

### 5) Validar configuração e recarregar Nginx

```bash
sudo nginx -t
sudo nginx -s reload
```

### 6) Validar publicação

```bash
curl -I https://proforma.net.br/
curl -I https://proforma.net.br/proformafarm
curl -I https://proforma.net.br/medcore
```

Esperado: `HTTP 200` e headers de segurança presentes.

## Por que merge/tag não atualiza o site automaticamente?

Merge/tag no GitHub apenas altera o repositório remoto. O conteúdo público só muda após:
1. `git pull` no servidor
2. novo build local
3. publicação do `dist` no root servido pelo Nginx

Sem esses passos, o site continua servindo os artefatos antigos.

## Rollback

### Rollback por tag

```bash
cd <REPO_PATH>
git fetch --tags
git checkout <TAG_ANTERIOR>
npm ci
npm -w apps/web-public run build
rsync -av --delete apps/web-public/dist/ <NGINX_ROOT_PATH>/
sudo nginx -t
sudo nginx -s reload
```

### Retorno ao main

```bash
git checkout main
git pull --ff-only origin main
```

## Checklist de Evidência

- Hash do commit/tag publicado
- Timestamp de build
- Comando de sync executado
- `nginx -t` OK
- `curl -I` das rotas críticas

## Registro de Deploy Executado

Data (UTC): `2026-02-24`

Contexto:
- Publicação manual do `web-public` após merge/tag `v0.5.1`.
- Ambiente: `proforma.net.br` via Cloudflare + Nginx.

Comandos executados:

```bash
cd /opt/proforma/proforma-platform
git pull
npm ci
npm -w apps/web-public run build
sudo rsync -av --delete apps/web-public/dist/ /var/www/proforma-web-public/
sudo nginx -s reload
```

Validação HTTP capturada:

```bash
curl -I https://proforma.net.br/                # 200
curl -I https://proforma.net.br/proformafarm    # 301 -> /proformafarm/
curl -I https://proforma.net.br/medcore         # 301 -> /medcore/
```

Observação:
- `301` nas rotas sem slash final é esperado pela normalização de rota estática.
- Headers de segurança observados na resposta: `x-content-type-options`, `x-frame-options`, `referrer-policy`.

## Troubleshooting

### DNS/Cloudflare não refletiu
- confirmar proxy e registro DNS no Cloudflare
- validar com `dig`/`nslookup`

### Conteúdo antigo após deploy
- revisar comando de sync (`--delete`)
- limpar cache do Cloudflare
- conferir data dos arquivos em `<NGINX_ROOT_PATH>`

### 404 em rota de SPA/estática
- validar `try_files $uri $uri/ /index.html;` no vhost
- confirmar que o arquivo existe em `dist`

### Build falha
- conferir versão Node/npm
- rodar `npm ci` novamente
- validar mudanças recentes no monorepo
