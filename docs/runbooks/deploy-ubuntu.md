# Runbook: Deploy no Ubuntu com Docker + Reverse Proxy

## Objetivo

Publicar `web-public`, `web-portal` e `docs` no servidor Ubuntu já existente,
sem alterar stack.

## Pré-requisitos

- Docker e Docker Compose instalados no host.
- Reverse proxy (Traefik ou Nginx) já configurado no servidor.
- Portas internas expostas apenas para rede privada do host quando aplicável.

## Passos

1. No diretório do monorepo, construir imagens:
   - `docker compose -f docker-compose.dev.yml build`
2. Subir os serviços:
   - `docker compose -f docker-compose.dev.yml up -d`
3. Configurar reverse proxy:
   - `web-public` -> `localhost:4321`
   - `web-portal` -> `localhost:3000`
   - `docs` -> `localhost:3002`
4. Validar headers de segurança no proxy e nas apps.

## Observações

- Não há deploy automático por workflow neste incremento.
- Não há autenticação real no portal nesta fase.
- A integração com Postgres existente será tratada em incrementos futuros.
