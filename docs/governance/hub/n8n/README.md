# Governance Hub n8n Workflows (Phase 1)

## Purpose
This folder versions the Governance Hub Phase 1 workflow exports for n8n.

These workflows implement:
- mission intake
- mission owner approve/deny gate
- mission auto-fix limited controller (2 rounds + pause for owner)
- operations chat dispatch webhook (staff -> hub)
- CPP-IA worker dispatch (self-hosted agent call)
- report ingest with idempotency and hashing
- decision aggregation
- snapshot update (mission run upsert + mission_runs_v1 snapshot publishing)
- XBO watchdog 24x7 (detecção de travas em `in_progress` + auto-recuperação limitada)

The objective is auditable, reproducible governance execution that remains aligned with GOV-0070 and in-repo artifacts.

## Naming convention (PT-BR)
- Use PT-BR for visual workflow names and node titles.
- Do not translate technical IDs/keys/paths that participate in contracts.
- If a workflow depends on compatibility URLs, prefer pinning stable webhook IDs to avoid route drift when labels change.

## How to import workflows into n8n (Docker)
1. Open n8n UI.
2. Go to **Workflows** -> **Import from File**.
3. Import the JSON files from `docs/governance/hub/n8n/workflows/`.
4. Configure credentials/environment variables before activation.

Alternative (CLI inside container):
```bash
docker exec -it <n8n_container> n8n import:workflow --input=/path/in/container/mission-intake.json
```

## Required environment variables
Use environment variables in the n8n runtime (container/env file/secrets manager):

- `GOVHUB_TOKENS`
  - Comma-separated token list accepted for webhook authentication.
  - Example: `token_agent_a,token_agent_b`
- `GOVHUB_TOKEN_SCOPES_JSON`
  - JSON map of token -> scopes used by scoped endpoints.
  - `snapshot-update` requires scope `s:w` (or `snapshots:write`).
  - `missions-owner-ack`: if this map is empty/unset, token-only auth is used (scope gate skipped). If configured, requires `m:w`/`missions:write`/`s:w`.
  - `missions-autofix-limited`: if this map is empty/unset, token-only auth is used (scope gate skipped). If configured, requires `m:w`/`missions:write`/`s:w`.
  - Example: `{"token_agent_a":["s:w","snapshots:read"],"token_agent_b":["snapshots:read"]}`

Autofix mission control:
- `missions-register` accepts optional `autofix_control` and writes canonical control into mission UDN:
  - `#af:enabled=<bool>;max_rounds=<1|2>;on_exhaust=pause_owner`
- `missions-autofix-limited` reads this line per mission and applies controller behavior without schema change.
- `worker-cppia-dispatch` aceita opcionalmente `git_ops` no payload e repassa ao self-worker.
  - sem `git_ops`: fluxo padrao de execucao
  - com `git_ops`: worker executa ciclo git (fetch/checkout/add/commit/push) conforme politica local
  - se dispatch do worker falhar (`5xx` no gateway), o workflow aciona automaticamente `missions-autofix-limited`
  - quando o limite do autofix for excedido, o estado vai para `paused_waiting_owner` e o retorno segue com sinalizacao para chamada do owner
- `operations-chat-dispatch` recebe comandos do Chat HUB (gov-manager) com validacao strict + fail-closed.
- `GOVHUB_DB_URL` (or equivalent DB host/user/db config)
  - Database connection for Governance Hub Postgres schema.

Mission partitioning (staff-first triage):
- `missions/register` accepts optional `parts` array.
- If `parts` is absent, workflow attempts fallback parse from UDN `#part:` lines.
- Normalized partitions are persisted in `gov.mission_parts`.
- Initial `gov.mission_runs.total` is derived from number of parts (minimum `1`).

Optional:
- `N8N_LOG_LEVEL=info`
- `N8N_ENCRYPTION_KEY` (recommended for credential protection)
- `GOV_MANAGER_BASE_URL` (default recomendado para o watchdog: `http://127.0.0.1:3000`)

## Local test (curl examples)
No secrets are embedded below. Replace placeholders at runtime.

Mission intake:
```bash
curl -X POST http://localhost:5678/webhook/govhub/mission-intake \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: <token>" \
  -d '{
    "mission_key": "AEI-0.6.2",
    "title": "Structural Inventory",
    "created_by": "owner",
    "repos": ["proforma-platform", "medcore"]
  }'
```

Report ingest:
```bash
curl -X POST http://localhost:5678/webhook/govhub/report-ingest \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: <token>" \
  -d '{
    "mission_key": "AEI-0.6.2",
    "repo_key": "proforma-platform",
    "agent_id": "codex-agent",
    "branch": "main",
    "head_sha": "7cabb1d",
    "report_md": "# Inventory\\n..."
  }'
```

Snapshot update:
```bash
curl -X POST http://localhost:5678/webhook/govhub/snapshot-update \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: <token_with_s:w_scope>" \
  -d '{
    "run_id": "run-001",
    "mission_id": "GOV-TEST",
    "branch": "main",
    "status": "in_progress",
    "phase": "SNAPSHOT_LAYER",
    "nn": 1,
    "total": 3,
    "last_event_ts": "2026-03-01T00:00:00Z",
    "udn_state": "!GOV-TEST|ACT|CPP|PF|main\n#μ:test\n#τ:[a]\n#σ:running"
  }'
```

Mission owner ack (single human gate):
```bash
curl -X POST http://localhost:5678/webhook/govhub/missions/owner-ack \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: <token_with_mission_write_scope>" \
  -d '{
    "mission_id": "GOV-MANAGER-V1-FOUNDATION",
    "decision": "approve",
    "owner_id": "owner-user"
  }'
```

Mission auto-fix limited:
```bash
curl -X POST http://localhost:5678/webhook/govhub/missions/autofix-limited \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: <token_with_mission_write_scope>" \
  -d '{
    "mission_id": "GOV-MANAGER-V1-FOUNDATION",
    "error_code": "REPORT_INGEST_INCONSISTENT_STATE",
    "error_excerpt": "runtime task progression mismatch"
  }'
```

Mission runs snapshot read:
```bash
curl "http://localhost:5678/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1" \
  -H "X-GOVHUB-TOKEN: <token>"
```

## Idempotency model
Idempotency key for report ingestion is effectively:
- `(mission_task_id, head_sha)`

Operational result:
- first insert -> report recorded
- duplicate insert for same task/head_sha -> ignored and returned as duplicate-safe success

## Operational notes
- Backups: perform daily logical dump of Governance Hub schema with retention.
- Logging: keep workflow execution logs and DB records for traceability.
- Failure recovery:
  - retry safe for ingest operations
  - duplicates are no-op by design
  - manually re-run decision-aggregate when needed

## Teste de contrato automatico (missions-next)
Script:
- `docs/governance/hub/n8n/tests/validate_missions_next_contract.sh`

Objetivo:
- validar invariante de contrato do endpoint `missions-next`:
  - se `status=assigned`, `mission_key` e `mission_task_id` devem estar preenchidos.
  - caso contrario, o fluxo deve responder `status=no_work`.

Uso:
```bash
GOVHUB_TOKEN=<token> \
GOVHUB_BASE_URL=http://127.0.0.1:15678 \
CALLS=3 \
docs/governance/hub/n8n/tests/validate_missions_next_contract.sh
```

## Data safety and audit posture
- Report and decision artifacts are hash-addressed.
- Hashes are persisted in Postgres (governance schema).
- GitHub Evidence PR remains a secondary historical source in disaster recovery posture.
