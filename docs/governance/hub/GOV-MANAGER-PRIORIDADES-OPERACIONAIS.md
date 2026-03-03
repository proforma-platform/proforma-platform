# GOV Manager - Prioridades Operacionais

## Objetivo
Executar missões com ordem clara, baixo ruído e distribuição automática entre `STAFF`, `CPP` e `CPP-IA`.

## Ordem de Prioridade (produção)
1. `P0` Continuidade operacional
   - incidentes de produção
   - bloqueios de merge/deploy
   - falha de endpoint crítico
2. `P1` Entrega de missão ativa
   - itens da missão em execução
   - ajustes de contrato e integração
3. `P2` Evolução de capacidade
   - automações de governança
   - dashboards e otimização de custo
4. `P3` Backlog de melhoria
   - refinamentos não críticos

## Regras de Distribuição
- `STAFF`: triagem, contrato, decisão, liberação.
- `CPP`: implementação runtime, API, deploy, correções de produção.
- `CPP-IA`: análise técnica, lacunas de especificação, risco arquitetural, proposta de plano.

## Fluxo Padrão
1. Staff cria missão e particiona em tarefas.
2. GOV Manager gera fila em `gov_manager_execution_queue_v1`.
3. Cada tarefa recebe assignee automático por tipo.
4. Execução ocorre por prioridade (`P0 -> P3`).
5. Status e evidência retornam para o painel.

## Endpoint
- `GET /api/govhub/operations/queue`
- `POST /api/govhub/operations/queue`
  - `action=create_plan`
  - `action=create_item`
