# GOV-HUB Pre-Production Checklist

Base stack:

- `infra/docker/govhub-compose.stable.yml`

## 1) Subir stack canônico

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml up -d
```

## 2) Backup rápido do banco (antes de mudanças)

```bash
bash /opt/proforma/proforma-platform/infra/docker/govhub-db-backup.sh
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
bash /opt/proforma/proforma-platform/infra/docker/govhub-db-restore.sh --file /opt/proforma/backups/govhub/<arquivo>.sql --yes
```

## 6) Evidências mínimas para Go/No-Go

- `docker ps` com os 4 containers `Up`.
- `GET /healthz` do n8n em `200`.
- `POST /webhook/govhub-output`:
  - assinatura válida `200`
  - assinatura inválida `401`
- `POST /webhook/govhub-status` sem `x-partner-id` em `401`.
