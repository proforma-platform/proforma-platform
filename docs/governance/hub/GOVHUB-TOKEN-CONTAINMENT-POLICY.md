# GOVHUB Token Containment Policy (PT-BR)

## Objetivo
Reduzir consumo de token com controle técnico obrigatório no ciclo Staff -> n8n/DB -> CPP/CPP-IA, sem reduzir segurança, auditoria ou rastreabilidade.

## Regras Obrigatórias
- Saídas humanas no ciclo operacional devem ser curtas e orientadas a ação.
- Respostas de webhook devem retornar somente campos mínimos de contrato.
- É proibido retornar payload bruto de worker, stack trace, stdout/stderr, ou dumps integrais em `responseBody`.
- Em erro, retornar apenas `status`, `error_code` e `next_action` (mais IDs mínimos quando necessário).
- Semântica UDN deve permanecer compacta e com `!OUT:JSON_ONLY.NO_MD.NO_TXT`.

## SLO de Eficiência
- p95 de `responseBody` dos endpoints críticos <= 520 caracteres.
- 0 ocorrência de campos proibidos (`worker_response`, `worker_error`, `autofix_response`, `message:`) nos endpoints críticos.
- 100% de PRs de governança com validação de compactação passando no CI.

## Endpoints Críticos Cobertos por Gate
- `missions-next`
- `report-ingest`
- `missions-autofix-limited`
- `missions-owner-ack`
- `worker-cppia-dispatch`

## Modo de Correção
- Falha no gate de compactação bloqueia merge.
- Correção deve priorizar remoção de campos verbosos antes de qualquer ajuste funcional.
- Se houver regressão recorrente (>=2 PRs seguidas), abrir missão de hardening de contrato.

## Auditoria
- Evidência mínima por ciclo: commit SHA, resultado do gate de compactação, hash de snapshot quando aplicável.
- Não registrar token/secret em logs de validação.
