# GOVHUB v1 Architecture

## 1. Visao Geral
GOVHUB v1 e o plano operacional de governanca para execucao de missoes tecnicas entre multiplos repositorios.
O objetivo e padronizar intake, despacho de trabalho, ingestao de relatorios e rastreabilidade auditavel com persistencia estruturada.

No ecossistema multi-repo, o GOVHUB atua como camada central de orquestracao:
- recebe missoes e relatorios
- distribui proxima tarefa por repositorio/agente
- persiste evidencias e estado de lock
- suporta consolidacao de decisao (quando habilitada)

## 2. Componentes
### 2.1 Dedicated Postgres (`govhub-db`)
- Banco dedicado do hub.
- Schema operacional: `governance`.
- Tabelas principais: `missions`, `repositories`, `mission_tasks`, `reports`, `decisions`, `evidence`.

### 2.2 Dedicated n8n (`govhub-n8n`)
- Instancia dedicada para workflows de governanca.
- Fluxos principais:
  - `govhub-phase1-mission-intake`
  - `govhub-phase1-report-ingest`
  - `govhub-phase1-missions-next`
  - `govhub-phase1-decision-aggregate` (opcional no fluxo operacional MVP)

### 2.3 Clients
- `submit-report` (bash + powershell): envio estruturado de relatorio de agente.
- `missions-next` (pull): recupera proxima missao disponivel para `repo_key`.

### 2.4 Painel web (futuro)
- Consola web para observabilidade operacional do hub:
  - fila de missoes
  - locks ativos
  - status por repositorio/agente
  - trilha de evidencias

## 3. Fluxo Completo de Missao
1. Criacao:
- `mission-intake` registra missao e repositorios-alvo.

2. Pull:
- agente chama `missions-next` com `repo_key` e `agent_id`.

3. Lock:
- hub seleciona tarefa elegivel e aplica lock operacional.

4. Execucao:
- agente executa trabalho no repositorio correspondente.

5. Submit-report:
- agente envia relatorio via `report-ingest`.

6. Persistencia:
- dados gravados no schema `governance`.

7. Decision aggregate (opcional v1):
- consolidacao de decisao quando fluxo habilitado.

## 4. Modelo de Locking
- TTL logico: `900` segundos.
- Transicoes de estado:
  - `pending -> in_progress -> completed`
- Regra de reassignment:
  - tarefa elegivel se `status='pending'`
  - ou se `status='in_progress'` e `started_at < now() - interval '15 minutes'`
- Garantia anti-dupla atribuicao:
  - selecao com criterio deterministico
  - lock por update condicional na mesma tarefa elegivel
  - segunda chamada imediata nao devolve a mesma tarefa enquanto lock estiver valido

## 5. Endpoints Canonicos v1
- `POST /webhook/govhub/report-ingest`
- `POST /webhook/govhub/missions/next`

Compatibilidade temporaria (deprecated):
- `POST /webhook/govhub-phase1-missions-next/webhook%2520missions%2520next/govhub/missions/next`

Headers obrigatorios:
- `Content-Type: application/json`
- `X-GOVHUB-TOKEN: <token>`

Payload minimo `missions-next`:
```json
{
  "repo_key": "platform",
  "agent_id": "cpp-agent-a"
}
```

Payload minimo `report-ingest`:
```json
{
  "mission_key": "SMOKE-GOVHUB-DOMAIN",
  "repo_key": "platform",
  "agent_id": "manual",
  "branch": "main",
  "head_sha": "dom124",
  "report_md": "ok"
}
```

## 6. Politica de Seguranca
- Autenticacao por `X-GOVHUB-TOKEN`.
- Escopo de uso por agente/repo definido por governanca operacional.
- Nao retornar campos sensiveis nos payloads de resposta.
- Logs com minimo necessario para rastreabilidade.
- Teste negativo (token invalido) obrigatorio no ciclo de validacao.

## 7. Ambientes
- Ambiente oficial dedicado: `https://govhub.proforma.net.br`
- Separacao total do ambiente legado/produto:
  - `n8n.proforma.net.br` (MedCore)
  - `govhub.proforma.net.br` (GOVHUB)

## 8. Runbook Operacional
### 8.1 Importar workflows
1. Abrir n8n dedicado.
2. Importar exports em `docs/governance/hub/n8n/exports/`.
3. Validar credencial `GOVHUB_DB` nos nodes Postgres.

### 8.2 Ativar workflows
1. Salvar workflow.
2. Publicar/ativar.
3. Confirmar Production URL no node Webhook.

### 8.3 Validar ingest
1. Chamar `report-ingest` com token valido.
2. Esperado: `200` + `status=ok`.

### 8.4 Validar missions-next
1. Chamar endpoint com `repo_key` e `agent_id`.
2. Esperado:
  - `200 assigned` quando ha tarefa elegivel
  - `200 no_work` quando nao ha tarefa

### 8.5 Testar token invalido
1. Chamar endpoint com `X-GOVHUB-TOKEN` invalido.
2. Esperado: `401 unauthorized` (target de conformidade v1).

### 8.6 Verificar persistencia
1. Conferir `missions`, `mission_tasks`, `reports` no schema `governance`.
2. Validar `status`, `assigned_agent`, `head_sha`, `report_hash`.

## 9. Evidencias v1
- Submit-report branch merge/reference SHA:
  - `54e7845`
- Missions-next branch SHA (dispatcher export + contratos):
  - `58a85f3`
  - `8d217ad`

Evidencias de teste observadas:
- Assigned:
  - `missions-next` retornou `status=assigned` para agente A com `mission_key` preenchida.
- Double-pull:
  - segunda chamada imediata por agente B nao retornou a mesma missao locked.
- Postgres:
  - `mission_tasks` em `in_progress` com `assigned_agent` distinto por chamada.

Estado operacional atual:
- Dispatcher funcional no endpoint de producao registrado no runtime.
- Padronizacao final estrita do endpoint canonico do `missions-next` permanece como ajuste final de conformidade (sem impacto na operacao do dispatcher).
