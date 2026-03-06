# GOV-HUB Pre-Production Checklist

Base stack:

- `infra/docker/govhub-compose.stable.yml`

## 1) Subir stack canônico

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml up -d
```

## 2) Backup rápido do banco (antes de mudanças)

```bash
mkdir -p /opt/proforma/backups/govhub
ts=$(date -u +%Y%m%dT%H%M%SZ)
docker exec govhub-db pg_dump -U postgres -d govhub_n8n > "/opt/proforma/backups/govhub/govhub_n8n_${ts}.sql"
```

## 3) Verificação pré-prod (1 comando)

Script:

- `infra/docker/govhub-preprod-check.sh`

Execução:

```bash
bash /opt/proforma/proforma-platform/infra/docker/govhub-preprod-check.sh
```

## 4) Rollback operacional (stack)

Reaplicar último estado canônico:

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml up -d
```

Reinício limpo:

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml restart
```

## 5) Rollback de banco (somente sob aprovação)

```bash
cat /opt/proforma/backups/govhub/<arquivo>.sql | docker exec -i govhub-db psql -U postgres -d govhub_n8n
```

## 6) Evidências mínimas para Go/No-Go

- `docker ps` com os 4 containers `Up`.
- `GET /healthz` do n8n em `200`.
- `POST /webhook/govhub-output`:
  - assinatura válida `200`
  - assinatura inválida `401`
- `POST /webhook/govhub-status` sem `x-partner-id` em `401`.
