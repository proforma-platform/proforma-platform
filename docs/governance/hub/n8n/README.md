# Governance Hub n8n Workflows (Phase 1)

## Purpose
This folder versions the Governance Hub Phase 1 workflow exports for n8n.

These workflows implement:
- mission intake
- report ingest with idempotency and hashing
- decision aggregation

The objective is auditable, reproducible governance execution that remains aligned with GOV-0070 and in-repo artifacts.

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
- `GOVHUB_DB_URL` (or equivalent DB host/user/db config)
  - Database connection for Governance Hub Postgres schema.

Optional:
- `N8N_LOG_LEVEL=info`
- `N8N_ENCRYPTION_KEY` (recommended for credential protection)

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

## Data safety and audit posture
- Report and decision artifacts are hash-addressed.
- Hashes are persisted in Postgres (governance schema).
- GitHub Evidence PR remains a secondary historical source in disaster recovery posture.
