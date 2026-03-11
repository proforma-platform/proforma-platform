# GOV-HUB Stable Stack (docker compose)

Arquivo base:

- `infra/docker/govhub-compose.stable.yml`

Projeto compose (fixo):

- `tmp`

## Subir / aplicar

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml up -d
```

## Reiniciar stack

```bash
docker compose -p tmp -f /opt/proforma/proforma-platform/infra/docker/govhub-compose.stable.yml restart
```

## Status rápido

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'govhub-db|govhub-n8n|govhub-cpp-worker|govhub-cpp-ia-worker'
```

## Healthcheck n8n

```bash
curl -sS http://127.0.0.1:15678/healthz
```

## Smoke parceiro (output/status)

```bash
ts=$(date +%s)
nonce=n1
body='{"job_id":"JOB-SMOKE-001"}'
secret=$(docker exec govhub-n8n printenv GOVHUB_PARTNER_HMAC_SECRET)
sig=$(printf '%s' "${ts}.${nonce}.${body}" | openssl dgst -sha256 -hmac "$secret" -hex | awk '{print $2}')

curl -sS -X POST http://127.0.0.1:15678/webhook/govhub-output \
  -H 'content-type: application/json' \
  -H 'x-partner-id: PARTNER-TESTE' \
  -H 'x-correlation-id: CORR-SMOKE-001' \
  -H 'x-idempotency-key: IDEMP-SMOKE-001' \
  -H "x-timestamp: $ts" \
  -H "x-nonce: $nonce" \
  -H "x-signature: $sig" \
  --data "$body"

curl -sS -X POST http://127.0.0.1:15678/webhook/govhub-status \
  -H 'content-type: application/json' \
  -H 'x-partner-id: PARTNER-TESTE' \
  --data '{"job_id":"JOB-SMOKE-001","status":"DONE"}'
```

## Observação operacional

- Use sempre `-p tmp` para evitar conflito de projeto/rede/containers.
