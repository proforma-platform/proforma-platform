# GOV Manager - Governança de Fila V1

Data: 2026-03-06  
Escopo: `apps/gov-manager`  
Status: ativo em produção

## Objetivo
Formalizar regras de autoridade, conclusão segura e trilha de auditoria para operações da esteira (`open`, `in_progress`, `paused_waiting_owner`, `done`).

## Alterações aplicadas

### 1) Gate de conclusão (Reviewer Guard)
Arquivo: `apps/gov-manager/src/app/api/govhub/operations/queue/route.ts`

- Ação `done` exige parecer de revisão quando `GOVHUB_REQUIRE_REVIEWER_GUARD_FOR_DONE=true` (default).
- Campos obrigatórios no payload para concluir:
  - `reviewer_guard_approved: true`
  - `reviewer_guard_by` (diferente do ator que está concluindo)
  - `reviewer_guard_note` com tamanho mínimo de 8 caracteres
- Em caso de ausência, endpoint retorna:
  - `409 REVIEWER_GUARD_REQUIRED`

## 2) Matriz de autoridade na fila
Arquivo: `apps/gov-manager/src/app/api/govhub/operations/queue/route.ts`

- `admin`: permissões completas.
- `engineer`: apenas transições seguras:
  - `open -> in_progress`
  - `in_progress -> paused_waiting_owner`
  - `paused_waiting_owner -> in_progress`
- `engineer` não pode:
  - concluir (`done`)
  - reabrir (`open` a partir de `done`)
  - remover item (`remove_item`)
  - limpar concluídas (`clear_done`)
- Bloqueio retorna:
  - `403 QUEUE_ACTION_FORBIDDEN`

## 3) Matriz de autoridade em missões/manage
Arquivo: `apps/gov-manager/src/app/api/govhub/missions/manage/route.ts`

- Ações `group_missions`, `add_execution`, `start_all_non_paused`:
  - permitidas para `admin`, `Principal Architect`, `Tech Lead`.
- Ação `edit_mission`:
  - `admin`, `Principal Architect`, `Tech Lead`: edição completa;
  - executor: apenas `notas`.
- Violação retorna:
  - `403 MISSIONS_ACTION_FORBIDDEN`
  - `403 MISSIONS_EXECUTOR_EDIT_RESTRICTED` (quando executor tenta alterar campos não permitidos)

## 4) Alinhamento de UI
Arquivo: `apps/gov-manager/src/app/page.tsx`

- Fluxo de `Concluir` passou a usar coleta de Reviewer Guard.
- Botão `Concluir` em Kanban e em modal de Detalhes aparece apenas para `admin`.
- Em cancelamento da coleta de parecer:
  - mensagem operacional no painel e nenhum envio para backend.

## 5) Escritórios Operacionais (Fase 1)
Arquivos:
- `apps/gov-manager/src/app/page.tsx`
- `apps/gov-manager/src/app/api/govhub/operations/office/route.ts`
- `apps/gov-manager/src/core/office-hierarchy.ts`
- `apps/gov-manager/src/core/agent-registry.ts`

### Capacidades entregues
- Board de escritórios com cards de agentes (cargo, status, criado, atualizado, carga, skills).
- Suporte a escritórios dinâmicos (além de `P-ARQ`, `STAFF`, `CPP`) com ordenação base + extensões.
- Drag-and-drop de agente entre escritórios com validação server-side.
- Onboarding de agente via escritório:
  - registra agente no registry;
  - aloca no escritório alvo;
  - cria item em `A fazer` automaticamente (fila de execução).

### Regras de governança aplicadas
- `move_member` e `request_onboarding` exigem `admin`.
- Bloqueio de movimentação quando agente estiver em execução (`running`/`current_load > 0`).
- Líder de escritório não pode ser movido por drag-and-drop.
- Auditoria para movimentação e onboarding.

### Ações da API `operations/office`
- `upsert_node`
- `move_member`
- `request_onboarding`

## Payload de conclusão (exemplo)

```json
{
  "action": "update_status",
  "queue_id": "GOV-MANAGER-V1-00029-item-1",
  "status": "done",
  "reviewer_guard_approved": true,
  "reviewer_guard_by": "principal_architect",
  "reviewer_guard_note": "Validação técnica concluída com critérios atendidos."
}
```

## Auditoria
- Ao concluir com sucesso, o backend registra `reviewer_guard_by` no evento de auditoria.
- Recomendação operacional:
  - manter consultas de auditoria em UTC para trilha forense;
  - apresentar no painel em BR (São Paulo) para operação humana.

## Checklist de validação

1. Logar como `engineer` e tentar concluir item:
   - esperado: ação não exibida na UI; endpoint bloqueia com `403` se forçado.
2. Logar como `admin` e concluir sem Reviewer Guard:
   - esperado: `409 REVIEWER_GUARD_REQUIRED`.
3. Logar como `admin` e concluir com Reviewer Guard válido:
   - esperado: item movido para `done` e auditoria registrada.
4. Em `missions/manage`, usuário executor tentar alterar `objetivo`:
   - esperado: `403 MISSIONS_EXECUTOR_EDIT_RESTRICTED`.

## Risco conhecido
- Se `GOVHUB_REQUIRE_REVIEWER_GUARD_FOR_DONE` for desligado, a conclusão volta a ser permissiva.
- Recomendação: não desativar em produção sem ata de exceção aprovada pelo Owner.

## Bloco GOV - ACK obrigatório de início (2026-03-06)

### Regras aplicadas
- `open -> in_progress` agora exige ACK real de `worker/n8n`.
- Sem ACK válido, ocorre rollback automático para `open` com erro padronizado.
- Falhas de start geram alerta automático (`type=start_ack_rollback`, `source=queue-start`).
- Start idempotente:
  - se item já estiver `in_progress`, API retorna sucesso idempotente e não duplica start/alocação.
  - payload de dispatch inclui `x-idempotency-key=queue-start:<queue_id>`.

### Erros padronizados de start
- `START_ACK_TIMEOUT`
- `WORKER_UNREACHABLE`
- `START_ACK_REJECTED`
- `START_ACK_INVALID_RESPONSE`
- `START_ACK_ENV_MISSING`

### Configuração operacional (env)
- `GOVHUB_QUEUE_START_ACK_TIMEOUT_MS` (default `30000`)
- `GOVHUB_QUEUE_START_ACK_CPP_PATH` (default `/webhook/govhub/workers/cpp/dispatch`)
- `GOVHUB_QUEUE_START_ACK_CPPIA_PATH` (default `/webhook/govhub/workers/cppia/dispatch`)
- `GOVHUB_QUEUE_START_ACK_STAFF_LOCAL` (default `true`)

### E2E (sucesso/falha)
1. Sucesso:
```bash
curl -s -X POST http://127.0.0.1:3000/api/govhub/operations/queue \
  -H 'content-type: application/json' \
  --data '{"action":"update_status","queue_id":"<QUEUE_ID_OPEN>","status":"in_progress"}'
```
Esperado: `status=ok`, item em `in_progress`, `last_start_ack_at_utc` preenchido.

2. Falha por timeout/unreachable:
```bash
curl -s -X POST http://127.0.0.1:3000/api/govhub/operations/queue \
  -H 'content-type: application/json' \
  --data '{"action":"update_status","queue_id":"<QUEUE_ID_OPEN>","status":"in_progress"}'
```
com endpoint de ACK indisponível/mal configurado.
Esperado: `status=rollback_applied`, erro padronizado, item em `open`, alerta `start_ack_rollback` aberto.

3. Idempotência:
repetir `update_status` para item já em `in_progress`.
Esperado: `idempotent_start=true` sem nova alocação/start duplicado.

## Bloco GOV - Auto-report obrigatório do executor (2026-03-07)

### Regra de governança
- Falha de dispatch do executor (`CPP/DamaQwen`) **não pode** ficar silenciosa.
- O n8n deve reportar automaticamente no GOV:
  1. alerta operacional (`/api/govhub/operations/alerts`)
  2. pausa técnica da missão (`/api/govhub/operations/queue/relay` com `status=paused_waiting_owner`)
- Mensagem padrão em erro:
  - `(... falha/erro reportado ao time de suporte).`

### Política de status no dispatch CPP
- Resposta `200 + status=ok` do worker no webhook de dispatch **não conclui missão**.
- O relay após aceite do worker deve manter `in_progress` com:
  - `reason_code=CPP_WORKER_ACK`
  - `release_load=false`
- Conclusão (`done`) só por fluxo explícito de término com prova de completion.

### Workflow exportado
- Arquivo: `docs/governance/hub/n8n/exports/worker-cpp-dispatch.json`
- Ajustes aplicados:
  - validação de erro ampliada (`error`, `statusCode>=400`, `body.status!=ok`)
  - nó de alerta automático no GOV
  - nó de pausa automática no GOV por falha de dispatch
  - caminho de sucesso alterado de `done` para `in_progress` (ACK de execução)

## Bloco GOV - Relay de conclusão obrigatório (2026-03-07)

### Regras aplicadas
- `queue/relay` com `status=done` agora sincroniza a missão no board (`missions/manage`) para `done`.
- A nota padrão GOV é persistida no board e na fila com `completion_proof` + `request_id`.
- Export `partner-client-status-relay.json` valida e propaga:
  - `completion_ack=true`
  - `completion_proof`
  - `request_id`/`correlation_id`
- A barra da esteira passa a consumir `execution_progress_pct` e `execution_progress_label` persistidos na fila.
- ETA permanece secundário; sem progresso factual do executor, a barra não deve avançar por tempo.

### Efeito operacional
- Missão concluída por relay não volta para `A fazer` por falta de sync entre board e fila.
- A coluna `Concluídas` passa a refletir o fechamento E2E com evidência mínima obrigatória.
- O dispatch CPP publica progresso inicial factual no relay assim que o worker aceita a missão.
