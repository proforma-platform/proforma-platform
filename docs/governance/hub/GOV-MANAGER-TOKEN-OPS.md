# GOV Manager Token Ops (PT-BR)

## Objetivo
Operar custo de token com visibilidade em tempo real no `gov-manager`, com governanca e previsibilidade por missao.

## Entregas desta fase
- Prospecao de custo por missao antes de registrar no HUB.
- Envio de `token_control` no `missions/register`.
- Monitoramento em tempo real por polling de `mission_runs_v1` (snapshot latest), com estimativa de consumo usado/restante.
- Politica de limite por owner (snapshot) com bloqueio automatico em `paused_waiting_owner`.
- Registro de uso projetado por missao (snapshot de uso).
- Biblioteca de prompts por referencia (`prompt_ref`) para reduzir payload repetido.
- Evolucao UDN V2 compacto (menos verbosidade no cliente, defaults no backend).
- Painel operacional v2:
  - KPIs de monitor (`progresso`, `status/fase`, `risco de limite`, `tokens usados/restantes`, `custo da missao`).
  - Uso em tempo real com ranking de missoes por custo (top consumo).
  - Prospecao rapida de projeto (`n` missoes planejadas x custo base por missao).
  - Polling configuravel (15s/30s/45s/60s/120s) com refresh manual para reduzir ruido e custo operacional.

## Endpoints (gov-manager)
- `POST /api/govhub/missions/cost-preview`
  - Entrada: envelope de missao (`udn`, `mission`, `token_control`).
  - Saida: `projected_input_tokens`, `projected_output_tokens`, `projected_total_tokens`, `projected_cost_usd`, `projected_cost_brl`, `warnings`.
- `GET /api/govhub/missions/token-monitor`
  - Query: `mission_id`, `agent_id`, `udn`, `objective`, `token_control` (json string).
  - Saida: `preview` + `realtime` (`status`, `phase`, `nn`, `total`, `progress_pct`, `estimated_used_tokens`, `estimated_remaining_tokens`) + bloco `governance` (`policy`, `usage`).
- `GET/POST /api/govhub/prompts`
  - Biblioteca de prompts em snapshot (`gov_manager_prompt_library_v1`).
  - `POST action=upsert|delete`.
- `GET/PUT /api/govhub/token/policy`
  - Politica de custo em snapshot (`gov_manager_token_policy_v1`).
- `GET /api/govhub/token/usage`
  - Resumo diario/mensal + ultimas reservas (`gov_manager_token_usage_v1`).

## Formula de estimativa (MVP)
- Tokens aproximados: `chars/4` (UDN + objetivo) + overhead por agente.
- Agente:
  - `CPP`: overhead menor.
  - `CPP-IA`: overhead maior + output projetado mais alto.
- Custo:
  - `usd = input/1000 * GOV_MANAGER_USD_PER_1K_INPUT + output/1000 * GOV_MANAGER_USD_PER_1K_OUTPUT`
  - `brl = usd * GOV_MANAGER_USD_TO_BRL`

## Evolucao V2 (redução de tokens)
- Padrao novo de emissao no cliente:
  - `!MIS|<token>`
  - `#μ:<objetivo>`
  - `#τ:<tarefas>`
- Itens removidos do prompt (agora defaults de backend):
  - `|PLAN|REGISTRAR`
  - `#σ:READY`
  - `!OUT:JSON_ONLY.NO_MD.NO_TXT.`
  - `#af:enabled=true;max_rounds=2;on_exhaust=pause_owner` (quando nao houver override)
- Regras de canonicalizacao no register:
  - rejeita UDN sem `!MIS`
  - rejeita divergencia entre token em `!MIS` e `mission.id`
  - corta texto livre antes do bloco UDN
- Resultado esperado:
  - reducao media por missao entre ~25% e ~45%, dependendo do tamanho do texto livre eliminado.

## Variaveis de ambiente opcionais
- `GOV_MANAGER_USD_PER_1K_INPUT` (default `0.003`)
- `GOV_MANAGER_USD_PER_1K_OUTPUT` (default `0.009`)
- `GOV_MANAGER_USD_TO_BRL` (default `5.2`)
- `GOVHUB_SNAPSHOTS_LATEST_PATH` (default `/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1`)
- `GOVHUB_SNAPSHOTS_LATEST_BASE_PATH` (default `/webhook/govhub/snapshots/latest`)
- `GOVHUB_SNAPSHOTS_INGEST_PATH` (default `/webhook/govhub/snapshots/ingest`)
- `GOVHUB_PROMPTS_SNAPSHOT_TYPE` (default `gov_manager_prompt_library_v1`)
- `GOVHUB_TOKEN_POLICY_SNAPSHOT_TYPE` (default `gov_manager_token_policy_v1`)
- `GOVHUB_TOKEN_USAGE_SNAPSHOT_TYPE` (default `gov_manager_token_usage_v1`)

## Regras de seguranca
- Sem log de token/secret.
- Fail-closed para payload snapshot invalido.
- Saidas compactas (sem dumps desnecessarios em webhooks criticos).
- Se limite for excedido e politica exigir bloqueio, registrar missao retorna `paused_waiting_owner` sem envio ao executor.
- JSON bruto mantido apenas em bloco de diagnostico no app (sem poluir fluxo principal).
