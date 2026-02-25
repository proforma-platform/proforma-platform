# Runbook: Publicação do `web-public` no Ubuntu (Nginx)

## Objetivo

Publicar o build estático do Astro (`apps/web-public/dist`) no diretório servido pelo Nginx.

## Pré-requisitos

- Repositório em `/opt/proforma/proforma-platform`.
- Nginx ativo e servindo `/var/www/proforma-web-public/`.
- Acesso com `sudo` para sincronizar arquivos e recarregar o Nginx.

## Procedimento de publicação

1. Atualizar código da `main`:
   - `git checkout main`
   - `git pull --ff-only origin main`
2. Gerar build estático:
   - `npm -w apps/web-public run build`
3. Publicar build no diretório de origem do Nginx:
   - `sudo rsync -av --delete apps/web-public/dist/ /var/www/proforma-web-public/`
4. Recarregar Nginx:
   - `sudo nginx -s reload`

## Validação pós-publicação

1. Validar canonical direto no origin:
   - `grep -i 'rel="canonical"' /var/www/proforma-web-public/proformafarm/index.html`
   - `grep -i 'rel="canonical"' /var/www/proforma-web-public/medcore/index.html`
2. Validar links de produto na home (com trailing slash):
   - `grep -o 'href="/proformafarm/"\|href="/medcore/"' /var/www/proforma-web-public/index.html | sort -u`
3. Validar domínio publicado:
   - `curl -s https://proforma.net.br/proformafarm/ | grep -i 'rel="canonical"'`
   - `curl -s https://proforma.net.br/medcore/ | grep -i 'rel="canonical"'`
   - `curl -s https://proforma.net.br/ | grep -o 'href="/proformafarm/"\|href="/medcore/"' | sort -u`

## Evidência de execução: v0.6.0 (2026-02-25)

- SHA da `main` publicada: `e6b1364`
- Comandos executados:
  - `npm -w apps/web-public run build`
  - `sudo rsync -av --delete apps/web-public/dist/ /var/www/proforma-web-public/`
  - `sudo nginx -s reload`
- Resultado validado:
  - `canonical` de `/proformafarm/` e `/medcore/` com trailing slash.
  - links da home apontando para `/proformafarm/` e `/medcore/`.

## Rollback rápido

1. Voltar para uma tag estável:
   - `git checkout <tag_estavel>`
   - `npm -w apps/web-public run build`
2. Reaplicar publicação:
   - `sudo rsync -av --delete apps/web-public/dist/ /var/www/proforma-web-public/`
   - `sudo nginx -s reload`

## Observação de governança

Merge e tag no Git não publicam automaticamente o site.
O site só muda após executar o ciclo `build + rsync + reload`.
