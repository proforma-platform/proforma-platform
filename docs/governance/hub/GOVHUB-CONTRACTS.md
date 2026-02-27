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

## Webhook: missions-next
Endpoint purpose:
- deterministic pull of the next mission task for a repository agent.

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
- `200` + assignment payload when lock succeeds:
```json
{
  "status": "assigned",
  "mission_key": "AEI-0.6.2",
  "repo_key": "platform",
  "agent_id": "cpp",
  "lock_ttl_seconds": 900,
  "lock_expires_at_utc": "2026-02-26T14:30:00Z",
  "instructions": null,
  "source": "govhub-n8n"
}
```

Error responses:
- `400` invalid request (`repo_key`/`agent_id` missing)
- `401` unauthorized (`X-GOVHUB-TOKEN` invalid)
- `500` internal error

## Webhook: decision-publish (optional in Phase 1)
Endpoint purpose:
- publish mission decision payload and evidence publication metadata.

Method:
- `POST`

Phase 1 note:
- endpoint MAY be disabled; if disabled, decision is stored and published by internal workflow step.

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
