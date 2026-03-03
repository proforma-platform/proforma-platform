# GOVHUB Contracts (Webhooks + Payloads)
## Authentication
All webhook requests MUST include header:
- `X-GOVHUB-TOKEN: <token>`

Requests without valid token MUST be rejected.

## Webhook: mission-intake
Endpoint purpose:
- register mission metadata and execution envelope.

Method:
- `POST`

## Webhook: report-ingest
Endpoint purpose:
- ingest repository execution report payload for consolidation.

Method:
- `POST`

## Webhook: missions-register
Endpoint purpose:
- register `gov.missions` + initial `gov.mission_runs` with UDN-first contract and per-mission autofix control.

Method:
- `POST`

Canonical endpoint:
- `https://govhub.proforma.net.br/webhook/govhub/missions/register`

Required input:
- `mission_id`
- `udn_mission`
- `tdv_version`
- `created_by`

Optional input:
- `branch` (default: `main`)
- `agent_id` (default: `CPP`)
- `autofix_control`
  - `enabled` (bool, default `true`)
  - `max_rounds` (`1` or `2`, default `2`)
  - `on_exhaust` (`pause_owner`, default `pause_owner`)

Persistence rule:
- the control is persisted inside `udn_mission` as:
  - `#af:enabled=<bool>;max_rounds=<int>;on_exhaust=<value>`
- any previous `#af:` line is replaced at register-time by canonical value.

## Webhook: missions-next
Endpoint purpose:
- deterministic pull of the next mission task for a repository agent.

Compact output policy:
- respostas HTTP devem ser minimas para reduzir consumo de tokens.
- detalhamento operacional completo permanece no DB/ledger.

Method:
- `POST` (MVP)

Canonical endpoint:
- `https://govhub.proforma.net.br/webhook/govhub/missions/next`

Temporary compatibility endpoint (deprecated, removal pending canonical conformance):
- `https://govhub.proforma.net.br/webhook/govhub-phase1-missions-next/webhook%2520missions%2520next/govhub/missions/next`

Required input:
- `repo_key` (JSON body, required; query string accepted for compatibility)
- `agent_id` (JSON body, required; query string accepted for compatibility)

Success responses:
- `200` + `{ "status": "no_work" }` when no mission is available
- `200` + assignment payload when lock succeeds and dispatch is sent to the worker selected by `agent_id` (`CPP` or `CPP-IA`):
```json
{
  "status": "assigned",
  "mission_id": "AEI-0.6.2",
  "mission_task_id": "97a2d9a9-2e44-4b3f-b0bb-58e4f9b3b97f",
  "next_action": "execute_mission"
}
```

Invariante de contrato (obrigatorio):
- se `status="assigned"`, entao `mission_id` e `mission_task_id` DEVEM estar preenchidos.
- se qualquer um estiver ausente, a resposta deve ser normalizada para `status="no_work"` (fail-closed sem atribuicao fantasma).

Auditoria automatica (timeline):
- quando `status=assigned`, o workflow registra evento `EVL` automaticamente no ledger via `POST /webhook/govhub/timelines/write`.
- envio nao bloqueia o dispatch principal (`ignoreResponseCode=true`) para preservar continuidade operacional.
- campos preenchidos no evento: `mission_id`, `run_id` (`mission_task_id`), `executor_id` (`agent_id`), `performed_by`, `occurred_at`, `context_summary`, `context_payload`.

Error responses:
- `400` invalid request (`repo_key`/`agent_id` missing)
- `401` unauthorized (`X-GOVHUB-TOKEN` invalid)
- `500` internal error

## Webhook: mission-owner-ack
Endpoint purpose:
- apply the single human gate for mission start (`approve` or `deny`).

Method:
- `POST`

Canonical endpoint:
- `https://govhub.proforma.net.br/webhook/govhub/missions/owner-ack`

Compatibility endpoint (current runtime):
- `https://govhub.proforma.net.br/webhook/govhub-v7-missions-owner-ack/webhook%2520missao%2520owner%2520ack/govhub/missions/owner-ack`

Required input:
- `mission_id`
- `decision` (`approve` or `deny`)
- `owner_id`

Optional input:
- `note`

Rules:
- this is the only mandatory interactive confirmation in the mission lifecycle.
- after `approve`, mission transitions to runnable state and proceeds automatically.
- after `deny`, mission transitions to blocked state and automation does not continue.

Success response (`200`):
```json
{
  "status": "ok",
  "mission_id": "GOV-MANAGER-V1-FOUNDATION",
  "decision": "approve",
  "transition": "awaiting_owner_ack->queued"
}
```

Error responses:
- `400` invalid payload
- `401` unauthorized token
- `404` mission not found
- `409` mission already decided
- `500` internal error

## Webhook: missions-autofix-limited
Endpoint purpose:
- apply limited automatic correction rounds after runtime inconsistency.

Method:
- `POST`

Canonical endpoint:
- `https://govhub.proforma.net.br/webhook/govhub/missions/autofix-limited`

Required input:
- `mission_id`

Optional input:
- `error_code`
- `error_excerpt` (truncated to 256)

Behavior:
- control source: parsed from mission `udn_mission` `#af:` line
- defaults when absent: `enabled=true`, `max_rounds=2`, `on_exhaust=pause_owner`
- when `enabled=false`: state becomes `resolved`, `next_action=autofix_disabled`
- when `enabled=true`:
  - round 1: set `autofix_state=round_1`, increment attempts
  - round 2 (if `max_rounds=2`): set `autofix_state=round_2`, increment attempts
  - after configured limit: set `autofix_state=paused_waiting_owner` and `owner_call_required=true`

Success response (`200`):
```json
{
  "status": "ok",
  "mission_id": "GOV-MANAGER-V1-FOUNDATION",
  "autofix_attempts": 2,
  "autofix_state": "round_2",
  "owner_call_required": false,
  "control": {
    "enabled": true,
    "max_rounds": 2,
    "on_exhaust": "pause_owner"
  },
  "next_action": "retry_limited"
}
```

## Webhook: workers-cppia-dispatch

- `POST /webhook/govhub/workers/cppia/dispatch`
- Auth: `X-GOVHUB-TOKEN` in `GOVHUB_TOKENS`
- Purpose: dispatch an execution task to the self-hosted `CPP-IA` worker.
- Regra operacional: `git_ops` e opcional; se ausente, o worker executa modo padrao (`accepted`).

Request:
```json
{
  "mission_id": "GOV-CPP-IA-TEST-01",
  "task_id": "task-01",
  "udn_block": "!MIS|GOV-CPP-IA-TEST-01|P1|RUN",
  "git_ops": {
    "repo_path": "/workspace/proforma-platform",
    "branch": "feat/gov-123",
    "base_branch": "main",
    "remote": "origin",
    "commit_message": "feat: ajuste GOV-123",
    "fetch_remote": true,
    "stage_all": true,
    "push": true
  }
}
```

Success response:
```json
{
  "status": "ok",
  "dispatch": "sent",
  "worker_response": {
    "status": "ok",
    "worker_id": "CPP-IA",
    "mission_id": "GOV-CPP-IA-TEST-01",
    "task_id": "task-01",
    "result": "accepted",
    "udn_received": true,
    "git_ops": {
      "status": "ok",
      "branch": "feat/gov-123",
      "head_sha": "abc123",
      "commit_created": true
    },
    "next_action": "report_ingest"
  }
}
```

Failure response with automatic limited autofix:
- if worker execution fails (for example HTTP 422 from worker), gateway returns `502` and triggers `missions-autofix-limited`.
- when autofix limit is exceeded and mission moves to `paused_waiting_owner`, gateway returns `409`.

Example failure payload:
```json
{
  "status": "error",
  "dispatch": "failed",
  "error_code": "DISPATCH_WORKER_HTTP_FAILURE",
  "autofix_response": {
    "mission_id": "GOV-EXAMPLE-02",
    "autofix_state": "paused_waiting_owner",
    "owner_call_required": true,
    "next_action": "pause_owner"
  },
  "next_action": "owner_ack_required"
}
```

## Webhook: timelines-write

- `POST /webhook/govhub/timelines/write`
- Auth: `X-GOVHUB-TOKEN` in `GOVHUB_TOKENS`
- Purpose: registrar eventos de governanca real no ledger de timelines (desenvolvimento e evolucao).

Timeline 1 - Desenvolvimento:
- UDN: `!DEV|PHASE|DUR|MS|EXEC|QG;`
- Campos de conteudo: fase, duracao, milestone, prompt executor, quality gate.

Timeline 2 - Evolucao:
- UDN: `!EVL|TIMELINE|EVENT|STAFF_ACT|ART;`
- Campos de conteudo: timeline, evento, acao IA/Staff, artefato.

Campos minimos obrigatorios em qualquer timeline:
- `mission_id`
- `timeline_type` (`dev` ou `evl`)
- `executor_id` (quem executou tecnicamente)
- `performed_by` (quem registrou/efetivou no Hub)
- `occurred_at` (quando ocorreu, ISO-8601)
- `udn_line`
- `context_summary` e/ou `context_payload`

Request (DEV):
```json
{
  "timeline_type": "dev",
  "mission_id": "GOV-MANAGER-V1-FOUNDATION",
  "run_id": "GOV-MANAGER-V1-FOUNDATION-run-001",
  "executor_id": "CPP",
  "performed_by": "self-worker-cpp",
  "occurred_at": "2026-03-02T23:30:00Z",
  "udn_line": "!DEV|PHASE_2|DUR_2H|MS_RUNTIME_ADAPTERS|CPP|QG_PASS;",
  "context_summary": "Implementacao de runtime adapters e validacao de contrato",
  "context_payload": {
    "files": ["apps/gov-manager/src/app/page.tsx"],
    "tests": "typecheck_ok"
  },
  "artifact_ref": "apps/gov-manager/src/app/page.tsx",
  "source": "staff-hub"
}
```

Request (EVL):
```json
{
  "timeline_type": "evl",
  "mission_id": "GOV-MANAGER-V1-FOUNDATION",
  "run_id": "GOV-MANAGER-V1-FOUNDATION-run-001",
  "executor_id": "STAFF",
  "performed_by": "governance-bot",
  "occurred_at": "2026-03-02T23:35:00Z",
  "udn_line": "!EVL|TIMELINE_V1|AUTOFIX_TRIGGERED|STAFF_ROUTING|docs/governance/hub/n8n/exports/missions-autofix-limited.json;",
  "context_summary": "Erro de dispatch levou a rodada automatica de autofix",
  "context_payload": {
    "http_status": 502,
    "next_action": "retry_limited"
  },
  "source": "self-worker"
}
```

Success response:
```json
{
  "status": "ok",
  "timeline_type": "dev",
  "mission_id": "GOV-MANAGER-V1-FOUNDATION",
  "executor_id": "CPP",
  "performed_by": "self-worker-cpp",
  "occurred_at": "2026-03-02T23:30:00Z",
  "event_hash": "<sha256>",
  "next_action": "timeline_logged"
}
```

## Webhook: decision-publish (optional in Phase 1)
Endpoint purpose:
- publish mission decision payload and evidence publication metadata.

Method:
- `POST`

Phase 1 note:
- endpoint MAY be disabled; if disabled, decision is stored and published by internal workflow step.

## Webhook: snapshot-update
Endpoint purpose:
- upsert mission run state and regenerate `mission_runs_v1` UBIN snapshot.

Method:
- `POST`

Canonical endpoint:
- `https://govhub.proforma.net.br/webhook/govhub/snapshot-update`

Required headers:
- `Content-Type: application/json`
- `X-GOVHUB-TOKEN`

Auth scope:
- token MUST include `s:w` (or equivalent `snapshots:write` scope in runtime mapping).

Required payload fields:
- `run_id`
- `mission_id`
- `branch`
- `status`
- `phase`
- `nn`
- `total`
- `udn_state`

Optional payload fields:
- `last_event_ts`
- `last_error_code`
- `last_error_excerpt_256` (truncated to 256)
- `report_ref`
- `integrity_hash` (if provided, MUST match server-calculated hash)

Server behavior:
- canonicalizes `udn_state`
- computes `integrity_hash = sha256(bytes(udn_state_canonical))`
- upserts row in `governance.mission_runs` by `run_id`
- regenerates active `mission_runs_v1` snapshot in `governance.hub_snapshots`

Success response (`200`):
```json
{
  "status": "updated",
  "run_id": "run-001",
  "snapshot_type": "mission_runs_v1",
  "payload_sha256": "<hex>",
  "payload_size_bytes": 1234,
  "snapshot_id": "<uuid>"
}
```

Error responses:
- `401` unauthorized token
- `403` token missing write scope
- `400` invalid payload / content-type / integrity mismatch
- `500` internal error

## Payload Schemas
Common required fields:
- `schema_version` (string)
- `mission_key` (string)
- `repo_key` (string)
- `head_sha` (string)
- `timestamp_utc` (ISO8601 string)

Optional fields:
- `branch`
- `author`
- `artifacts`
- `notes`

### mission-intake example
```json
{
  "schema_version": "1.0",
  "mission_key": "AEI-0.6.2",
  "repo_key": "proforma-platform",
  "head_sha": "7cabb1d",
  "branch": "main",
  "timestamp_utc": "2026-02-26T12:00:00Z",
  "scope": "structural-inventory",
  "constraints": ["read-only", "no infra changes"]
}
```

### report-ingest example
```json
{
  "schema_version": "1.0",
  "mission_key": "AEI-0.6.2",
  "repo_key": "proforma-platform",
  "head_sha": "7cabb1d",
  "timestamp_utc": "2026-02-26T12:20:00Z",
  "report": {
    "status": "completed",
    "summary": "inventory generated",
    "findings": []
  },
  "artifact_hashes": {
    "prompt_sha256": "<hex>",
    "report_sha256": "<hex>"
  }
}
```

### decision-publish example
```json
{
  "schema_version": "1.0",
  "mission_key": "AEI-0.6.2",
  "timestamp_utc": "2026-02-26T12:35:00Z",
  "decision": "NO-GO",
  "reason": "missing repository evidence",
  "artifact_hashes": {
    "decision_sha256": "<hex>"
  }
}
```

## Idempotency and Hashing
Idempotency key MUST be:
- `mission_key + repo_key + head_sha`

Rules:
- duplicate idempotency key with same payload SHOULD return idempotent success
- duplicate idempotency key with different payload MUST be rejected

Hashing:
- Hub MUST compute SHA256 for prompt/report/decision payloads.
- Hashes MUST be stored as immutable evidence references.

## Redaction and Secret Safety
Payloads MUST NOT include secrets.

If secrets are detected:
- request SHOULD be rejected (`422`) OR
- secret fields MUST be redacted before persistence, with redaction flag recorded.

Examples of forbidden sensitive content:
- private keys
- tokens
- passwords
- connection strings with credentials

## Error Codes
- `200` processed successfully
- `202` accepted for async processing
- `400` invalid payload shape
- `401` authentication failed
- `409` idempotency conflict
- `422` unsafe payload (secret exposure)
- `500` internal processing failure

## CCP Payloads
CCP payloads are supported as the canonical compact protocol for mission and report transport.

Rules:
- missions-next MAY return a CCP mission envelope for agent consumption.
- submit-report MAY carry CCP report JSON as `report_content` (inline) or as attached file content.
- every CCP payload MUST pass:
  - `docs/governance/ccp/tools/ccp-secret-scan.*`
  - `docs/governance/ccp/tools/ccp-lint.*`

References:
- `docs/governance/ccp/CCP-SPEC.md`
- `docs/governance/ccp/KEYS.md`
- `docs/governance/ccp/schema/`
- `docs/governance/hub/GOVHUB-TOKEN-CONTAINMENT-POLICY.md`

## Operational Aliases (`me/nm/mc`)
The runtime contract supports short operational aliases to remove manual copy/paste handoffs:

- `me` (`missao enviada`)
  - staff sends mission to hub (`mission-intake` or `missions/register`)
  - hub persists mission as `awaiting_owner_ack`
- `nm` (`nova missao`)
  - owner sends `approve` in `mission-owner-ack`
  - hub moves mission to runnable state and cpp consumes automatically via `missions-next`
- `mc` (`missao concluida`)
  - cpp completes execution and sends final `snapshot-update` + `report-ingest`
  - staff reads db/snapshot state and closes mission without manual payload relay

## Localization Rule (PT-BR)
- Operator-facing naming SHOULD be PT-BR (`missao`, `decisao`, `concluida`).
- Transport contracts remain language-neutral and stable:
  - keep keys like `mission_id`, `decision`, `status`
  - keep canonical webhook paths unchanged when already standardized
  - avoid breaking changes from label translation

## Snapshots (UBIN v1)

Canonical endpoints:
- `POST /webhook/govhub/snapshots/ingest`
- `GET /webhook/govhub/snapshots/latest?snapshot_type=<type>`

Auth:
- `X-GOVHUB-TOKEN` required.

Ingest request (minimum):
- `snapshot_type`
- `protocol` (`UBIN`)
- `version` (`1.0`)
- `encoding` (`json`)
- `compression` (`gzip`)
- `payload_b64`
- `payload_sha256`
- `payload_size_bytes`
- `created_by`

Latest response (200):
- metadata + `payload_b64` + `payload_sha256`

Error codes:
- `401` unauthorized
- `400` invalid request
- `404` snapshot not found (latest)
- `200` stored/ok

Size limits:
- compressed payload max: `256KB` (MVP)

Secret scan policy:
- client-side scan is mandatory before ingest (`snapshot-pack.*`).
- server-side Phase 1 scan is limited to transport payload checks (`payload_b64`) and rejects known risky patterns.
- rejection response: `{"status":"rejected","error_code":"SNAPSHOT_SECRET_DETECTED"}`

SHA256 definition:
- `payload_sha256` MUST be SHA256 of gzip-compressed payload bytes (decoded from `payload_b64`).
