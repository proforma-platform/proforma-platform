# Inventário n8n - 2026-03-09

Base validada: `govhub.proforma.net.br` + `govhub-n8n` (container).

## Canais reais de execução (validados)
- `POST /webhook/govhub/workers/cpp/dispatch`
- `POST /webhook/govhub/workers/cppia/dispatch`
- `POST /webhook/govhub/memory/store`
- `POST /webhook/govhub/memory/starter`
- `POST /webhook/govhub/memory/retrieve`

## Canais aparentes/orquestração (não ponte executor direta)
- `POST /webhook/govhub/operations/chat-dispatch`
- `POST /webhook/govhub/missions/register`
- `POST /webhook/govhub/missions/owner-ack`
- `POST /webhook/govhub/missions/autofix-limited`
- `POST /webhook/govhub/snapshot-update`
- `POST /webhook/govhub/report-ingest`
- `POST /webhook/govhub/timelines/write`
- `POST /webhook/govhub-output`
- `POST /webhook/govhub-status`

## Consolidação de duplicidades (memória)
- Mantidos ativos:
  - `govhub-v7-memory-store`
  - `govhub-v7-memory-starter`
  - `govhub-v7-memory-retrieve`
- Desativados legados:
  - `zk4qCq7gTDXvoLcF` (`govhub-memory-store`)
  - `cVOkN97smboBAMvB` (`govhub-memory-starter`)

## Observações operacionais
- A rota `memory/retrieve` não estava registrada em produção e foi implantada/ativada.
- Monitor de regressão de webhooks críticos adicionado em:
  - `apps/gov-manager/scripts/monitor-govhub-webhooks.sh`
