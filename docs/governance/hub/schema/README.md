# Governance Hub Phase 1 Schema

## Purpose
This schema defines the Phase 1 Governance Hub persistence layer for mission intake, repository mapping, prompt/report immutability, consolidation decisions, and evidence references.

## How to apply
Use PostgreSQL with a role that can create extensions, schemas, tables, and indexes.

Example:
```bash
psql "postgresql://<user>@<host>:5432/<database>" -v ON_ERROR_STOP=1 -f docs/governance/hub/schema/0001_init.sql
```

## Rollback policy (Phase 1)
Rollback is manual in Phase 1.

Policy:
- Any destructive rollback MUST be approved before execution.
- Prefer forward-fix migrations instead of dropping objects.
- If rollback is mandatory, record evidence in governance mission artifacts.

## Migration strategy
Migration numbering is append-only:
- `0001_init.sql` (current baseline)
- `0002_snapshots_and_backlog.sql`
- `0003_mission_runs.sql`
- `0004_govhub_v7_orchestration.sql`
- `0005_owner_approval_gate.sql`
- `0006_autofix_limited.sql`

Rules:
- Existing migrations MUST NOT be edited after merge.
- New changes MUST be introduced via new migration files.

## Extension notes
This schema requires:
- `pgcrypto` for `gen_random_uuid()`

The migration includes:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Immutability notes
Phase 1 stores hash pointers for reproducibility and audit:
- prompt payload hash (`prompt_versions.content_hash`)
- report hash (`reports.report_hash`)
- decision hash (`decisions.decision_hash`)
- optional evidence hash (`evidence.content_hash`)

Hashes are intended for deterministic verification of stored artifacts.

## Operational guidance
Backup recommendation:
- Daily logical dump of the governance schema with retention policy.
- Retention SHOULD follow operational policy (e.g., rolling 30 days minimum).

Disaster recovery posture:
- Database backups are primary recovery source.
- Governance evidence PRs in GitHub act as secondary historical source for mission reconstruction.
