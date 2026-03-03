# Fundação Gov-Manager V7

## Componentes
- Esquema TDV 1.0 e validador de sinal: `src/tdv/schema-v1.ts`
- Motor canônico UDN: `src/udn/canonical-engine.ts`
- Primitivos da cadeia Ledger V7: `src/infra/ledger-v7.ts`
- Adaptador de contrato legado para V7: `src/contracts/adapter-v7.ts`

## Modelo de Determinismo
- Hash com SHA-256 (`src/core/determinism.ts`)
- Hash de JSON com ordenação estável de chaves
- Hash de gênese do ledger determinístico
- Normalização de quebra de linha e espaços do UDN antes do hash

## Fronteira de API
- Rota de missão local: `src/app/api/mission/route.ts`
- Rota proxy de registro no GOVHUB: `src/app/api/govhub/missions/register/route.ts`
- Rota proxy de decisao do Owner: `src/app/api/govhub/missions/owner-ack/route.ts`
- Versão de contrato retornada: `v7-baseline`
- Adaptador aceita envelope legado e normaliza para o contrato V7

## Controles Operacionais (V7)
- O payload de missão aceita `autofix_control`:
  - `enabled: boolean`
  - `max_rounds: 1 | 2`
  - `on_exhaust: "pause_owner"`
- O payload de missão aceita `token_control`:
  - `enabled: boolean`
  - `budget_usd: number`
  - `budget_brl: number`
  - `max_input_tokens: number`
  - `max_output_tokens: number`
  - `hard_stop: boolean`
- Validação em modo fail-closed para valores inválidos
- A UI gera UDN com linhas de governança:
  - `#af:` para política de autofix limitado
  - `#ct:` para política de orçamento e limites de tokens

## Configuração de Runtime GOVHUB
- Variáveis obrigatórias:
  - `GOVHUB_BASE_URL` (exemplo: `https://govhub.proforma.net.br`)
  - `GOVHUB_TOKEN` (somente servidor; não expor no navegador)
- Variável opcional:
  - `GOVHUB_MISSIONS_REGISTER_PATH` (padrão: `/webhook/govhub/missions/register`)
- O app envia o registro de missão server-side com header `X-GOVHUB-TOKEN`
- O app envia a decisao do Owner (`approve|deny`) server-side para `missions/owner-ack`

## Registro de Status dos Bots
- Snapshot dedicado: `gov_manager_bot_status_v1` (configurável por `GOVHUB_BOT_STATUS_SNAPSHOT_TYPE`).
- Endpoint do app:
  - `GET /api/govhub/bots/status` (sessão ativa).
  - `PUT /api/govhub/bots/status` (sessão ativa ou token técnico no header `x-gov-manager-token`).
- Variável opcional do app para escrita técnica sem sessão:
  - `GOV_MANAGER_BOT_STATUS_TOKEN`
- Secrets necessários no GitHub Actions para registrar o status no app:
  - `GOV_MANAGER_BOT_STATUS_ENDPOINT` (exemplo: `https://gov.proforma.net.br/api/govhub/bots/status`)
  - `GOV_MANAGER_BOT_STATUS_TOKEN` (mesmo valor do runtime do app)
- Workflows que atualizam o status:
  - `GOVHUB Auto PR` -> bot `govhublab-pr`
  - `GOVHUB Auto Approve` -> bot `govhub-approve-br`

## Fluxo Owner Ack
- Quando o retorno indicar `owner_ack_required` (ou `paused_waiting_owner`), a UI abre painel de decisao.
- O Owner pode executar:
  - `APROVAR` -> envia `decision=approve`
  - `NEGAR` -> envia `decision=deny`
- A resposta da acao e exibida no painel em JSON para auditoria rapida.

## Observações
- Não usar timestamps dinâmicos em identificadores determinísticos de contrato
- A verificação de reprodutibilidade de build ainda depende de `npm ci` com rede
