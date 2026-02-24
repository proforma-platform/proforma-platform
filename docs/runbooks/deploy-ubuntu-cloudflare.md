# Runbook: Deploy Ubuntu + Docker + Traefik + Cloudflare

## Escopo

Publicar os serviços do monorepo via Traefik em HTTPS para:

- `proforma.net.br` e `www.proforma.net.br` -> `web-public`
- `portal.proforma.net.br` -> `web-portal`
- `docs.proforma.net.br` -> `docs`
- `status.proforma.net.br` -> `status` (placeholder)
- `n8n.proforma.net.br` -> `n8n`

## Convivência com serviços já existentes (sem conflito)

- Esta stack **não** cria nem altera serviço de Postgres.
- Esta stack usa volume dedicado do n8n: `proforma_n8n_data` (isolado de outros projetos).
- Esta stack usa projeto Compose dedicado: `proforma-platform-prod` (evita colisão de nomes).
- Não reutilizar banco/volume de outros sistemas sem plano de migração específico.

## DNS (Cloudflare)

Os registros DNS dos subdomínios já devem apontar para o IP público do ambiente
(80/443 encaminhados para `192.168.0.109`).

## SSL no Cloudflare

Configurar modo SSL/TLS como **Full (strict)**.

## Passo manual obrigatório no roteador

Remover o port-forward da porta **5678** (n8n) no roteador. O n8n deve ficar
acessível apenas por `n8n.proforma.net.br` via Traefik (443).

## Variáveis de ambiente

Criar `infra/docker/.env` a partir de `infra/docker/.env.example` e definir valores reais:

- `ACME_EMAIL`
- `CF_DNS_API_TOKEN`
- `N8N_BASIC_AUTH_ACTIVE`
- `N8N_BASIC_AUTH_USER`
- `N8N_BASIC_AUTH_PASSWORD`
- `GENERIC_TIMEZONE`

## Preparar armazenamento ACME

```bash
mkdir -p infra/docker/acme
touch infra/docker/acme/acme.json
chmod 600 infra/docker/acme/acme.json
```

## Subir stack (modo staging/validação)

No diretório raiz do repositório:

```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.prod.yml config
```

```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.prod.yml up -d --build
```

## Validações

### 1) Garantir que apenas 80/443 estão publicados

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Validar que somente o container `traefik` publica `0.0.0.0:80` e `0.0.0.0:443`.

### 2) Testar hosts

```bash
curl -I https://proforma.net.br
curl -I https://portal.proforma.net.br
curl -I https://docs.proforma.net.br
curl -I https://status.proforma.net.br
curl -I https://n8n.proforma.net.br
```

### 3) Inspecionar logs

```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.prod.yml logs -f traefik
```

```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.prod.yml logs -f web-public web-portal docs n8n status
```

## Recomendação de segurança adicional

Aplicar **Cloudflare Zero Trust (Access)** no subdomínio `n8n.proforma.net.br`
como camada adicional além da autenticação básica do n8n.
